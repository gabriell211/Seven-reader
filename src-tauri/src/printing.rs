use crate::{error::SevenError, jobs, state::AppState};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::{Path, PathBuf}, process::Command};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintOptions {
    pub printer: Option<String>,
    pub copies: u16,
    pub page_mode: String,
    pub current_page: usize,
    pub page_range: String,
    pub page_set: String,
    pub reverse: bool,
    pub duplex: String,
    pub orientation: String,
    pub paper_size: String,
    pub scaling: String,
    pub print_annotations: bool,
    pub print_forms: bool,
}

impl PrintOptions {
    pub fn validate(&self) -> Result<(), SevenError> {
        if !(1..=99).contains(&self.copies) {
            return Err(SevenError::OperationRejected("Cópias deve ficar entre 1 e 99".into()));
        }
        if !matches!(self.page_mode.as_str(), "all" | "current" | "range") {
            return Err(SevenError::OperationRejected("Modo de páginas inválido".into()));
        }
        if !matches!(self.page_set.as_str(), "all" | "odd" | "even") {
            return Err(SevenError::OperationRejected("Filtro par/ímpar inválido".into()));
        }
        if !matches!(self.duplex.as_str(), "printer" | "simplex" | "long" | "short") {
            return Err(SevenError::OperationRejected("Duplex inválido".into()));
        }
        if !matches!(self.orientation.as_str(), "auto" | "portrait" | "landscape") {
            return Err(SevenError::OperationRejected("Orientação inválida".into()));
        }
        if !matches!(self.paper_size.as_str(), "printer" | "a4" | "letter" | "legal") {
            return Err(SevenError::OperationRejected("Tamanho de papel inválido".into()));
        }
        if !matches!(self.scaling.as_str(), "fit" | "actual") {
            return Err(SevenError::OperationRejected("Escala de impressão inválida".into()));
        }
        if self.page_range.chars().count() > 512 {
            return Err(SevenError::OperationRejected("Intervalo de páginas muito longo".into()));
        }
        Ok(())
    }
}

fn parse_page_range(value: &str, page_count: usize) -> Result<Vec<usize>, SevenError> {
    let mut pages = Vec::new();
    let mut seen = HashSet::new();

    for token in value.split(',').map(str::trim).filter(|part| !part.is_empty()) {
        if let Some((start, end)) = token.split_once('-') {
            let start = start.trim().parse::<usize>()
                .map_err(|_| SevenError::OperationRejected(format!("Página inválida: {token}")))?;
            let end = end.trim().parse::<usize>()
                .map_err(|_| SevenError::OperationRejected(format!("Página inválida: {token}")))?;
            if start == 0 || end == 0 || start > page_count || end > page_count {
                return Err(SevenError::OperationRejected(format!("Intervalo fora do documento: {token}")));
            }
            if start <= end {
                for page in start..=end {
                    if seen.insert(page) { pages.push(page); }
                }
            } else {
                for page in (end..=start).rev() {
                    if seen.insert(page) { pages.push(page); }
                }
            }
        } else {
            let page = token.parse::<usize>()
                .map_err(|_| SevenError::OperationRejected(format!("Página inválida: {token}")))?;
            if page == 0 || page > page_count {
                return Err(SevenError::OperationRejected(format!("Página fora do documento: {page}")));
            }
            if seen.insert(page) { pages.push(page); }
        }
    }

    if pages.is_empty() {
        return Err(SevenError::OperationRejected("Nenhuma página selecionada para impressão".into()));
    }
    Ok(pages)
}

pub fn selected_pages(
    input: &Path,
    options: &PrintOptions,
) -> Result<Vec<usize>, SevenError> {
    options.validate()?;
    let document = lopdf::Document::load(input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_count = document.get_pages().len();
    if page_count == 0 {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }

    let mut pages = match options.page_mode.as_str() {
        "all" => (1..=page_count).collect::<Vec<_>>(),
        "current" => {
            let page = options.current_page.saturating_add(1);
            if page > page_count {
                return Err(SevenError::OperationRejected("Página atual fora do documento".into()));
            }
            vec![page]
        }
        "range" => parse_page_range(&options.page_range, page_count)?,
        _ => unreachable!(),
    };

    pages.retain(|page| match options.page_set.as_str() {
        "odd" => page % 2 == 1,
        "even" => page % 2 == 0,
        _ => true,
    });
    if options.reverse {
        pages.reverse();
    }
    if pages.is_empty() {
        return Err(SevenError::OperationRejected("O filtro de páginas resultou em uma lista vazia".into()));
    }
    Ok(pages)
}

#[cfg(target_os = "windows")]
pub fn list_printers() -> Result<Vec<PrinterInfo>, SevenError> {
    let powershell = jobs::require_executable(&["powershell"], "Windows PowerShell")?;
    let output = Command::new(powershell)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Compress",
        ])
        .output()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if !output.status.success() {
        return Err(SevenError::Operation(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let value: serde_json::Value = serde_json::from_str(text.trim())
        .map_err(|error| SevenError::Operation(format!("Lista de impressoras inválida: {error}")))?;
    let values = match value {
        serde_json::Value::Array(values) => values,
        serde_json::Value::Object(_) => vec![value],
        serde_json::Value::Null => Vec::new(),
        _ => Vec::new(),
    };
    let mut printers = values
        .into_iter()
        .filter_map(|value| {
            let name = value.get("Name")?.as_str()?.trim().to_owned();
            if name.is_empty() { return None; }
            Some(PrinterInfo {
                name,
                is_default: value.get("Default").and_then(|value| value.as_bool()).unwrap_or(false),
            })
        })
        .collect::<Vec<_>>();
    printers.sort_by(|left, right| {
        right.is_default.cmp(&left.is_default).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(printers)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub fn list_printers() -> Result<Vec<PrinterInfo>, SevenError> {
    let lpstat = jobs::require_executable(&["lpstat"], "CUPS/lpstat")?;
    let output = Command::new(lpstat)
        .args(["-p", "-d"])
        .output()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if !output.status.success() {
        return Err(SevenError::Operation(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let default = text.lines().find_map(|line| {
        line.strip_prefix("system default destination:")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    });
    let mut printers = text
        .lines()
        .filter_map(|line| line.strip_prefix("printer "))
        .filter_map(|line| line.split_whitespace().next())
        .map(|name| PrinterInfo {
            name: name.to_owned(),
            is_default: default.as_deref() == Some(name),
        })
        .collect::<Vec<_>>();
    printers.sort_by(|left, right| {
        right.is_default.cmp(&left.is_default).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(printers)
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
pub fn list_printers() -> Result<Vec<PrinterInfo>, SevenError> {
    Ok(Vec::new())
}

fn validate_printer(options: &PrintOptions) -> Result<(), SevenError> {
    if let Some(name) = options.printer.as_ref().filter(|name| !name.trim().is_empty()) {
        let known = list_printers()?;
        if !known.iter().any(|printer| printer.name == *name) {
            return Err(SevenError::OperationRejected("Impressora selecionada não foi encontrada".into()));
        }
    }
    Ok(())
}

fn page_subset_step(
    input: &Path,
    pages: &[usize],
    output: &Path,
) -> Result<jobs::ProcessStep, SevenError> {
    let qpdf = jobs::require_executable(&["qpdf"], "qpdf")?;
    let selection = pages.iter().map(usize::to_string).collect::<Vec<_>>().join(",");
    Ok(jobs::ProcessStep {
        program: qpdf,
        args: vec![
            input.to_string_lossy().into_owned(),
            "--pages".into(),
            ".".into(),
            selection,
            "--".into(),
            output.to_string_lossy().into_owned(),
        ],
        label: "Preparando páginas para impressão".into(),
    })
}

#[cfg(target_os = "windows")]
fn print_steps(
    input: &Path,
    options: &PrintOptions,
) -> Result<Vec<jobs::ProcessStep>, SevenError> {
    let gs = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript")?;
    let mut base = vec![
        "-dBATCH".into(),
        "-dNOPAUSE".into(),
        "-dSAFER".into(),
        "-sDEVICE=mswinpr2".into(),
        "-dNoCancel".into(),
        format!("-dShowAnnots={}", if options.print_annotations { "true" } else { "false" }),
        format!("-dShowAcroForm={}", if options.print_forms { "true" } else { "false" }),
    ];
    if let Some(printer) = options.printer.as_ref().filter(|value| !value.trim().is_empty()) {
        base.push(format!("-sOutputFile=%printer%{printer}"));
    }
    if options.scaling == "fit" {
        base.push("-dPDFFitPage".into());
    }
    if options.orientation == "auto" {
        base.push("-dAutoRotatePages=/PageByPage".into());
    }
    if options.paper_size != "printer" {
        base.push(format!("-sPAPERSIZE={}", options.paper_size));
    }

    let mut device = Vec::new();
    if options.duplex != "printer" || options.orientation != "auto" {
        let mut entries = Vec::new();
        match options.duplex.as_str() {
            "simplex" => entries.push("/Duplex false".to_owned()),
            "long" => {
                entries.push("/Duplex true".to_owned());
                entries.push("/Tumble false".to_owned());
            }
            "short" => {
                entries.push("/Duplex true".to_owned());
                entries.push("/Tumble true".to_owned());
            }
            _ => {}
        }
        match options.orientation.as_str() {
            "portrait" => entries.push("/Orientation 0".to_owned()),
            "landscape" => entries.push("/Orientation 3".to_owned()),
            _ => {}
        }
        if !entries.is_empty() {
            device = vec!["-c".into(), format!("<< {} >> setpagedevice", entries.join(" ")), "-f".into()];
        }
    }

    let mut steps = Vec::with_capacity(options.copies as usize);
    for copy in 0..options.copies {
        let mut args = base.clone();
        args.extend(device.clone());
        args.push(input.to_string_lossy().into_owned());
        steps.push(jobs::ProcessStep {
            program: gs.clone(),
            args,
            label: format!("Imprimindo cópia {} de {}", copy + 1, options.copies),
        });
    }
    Ok(steps)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn print_steps(
    input: &Path,
    options: &PrintOptions,
) -> Result<Vec<jobs::ProcessStep>, SevenError> {
    let lp = jobs::require_executable(&["lp"], "CUPS/lp")?;
    let mut args = Vec::new();
    if let Some(printer) = options.printer.as_ref().filter(|value| !value.trim().is_empty()) {
        args.extend(["-d".into(), printer.clone()]);
    }
    args.extend(["-n".into(), options.copies.to_string()]);
    match options.duplex.as_str() {
        "simplex" => args.extend(["-o".into(), "sides=one-sided".into()]),
        "long" => args.extend(["-o".into(), "sides=two-sided-long-edge".into()]),
        "short" => args.extend(["-o".into(), "sides=two-sided-short-edge".into()]),
        _ => {}
    }
    if options.scaling == "fit" {
        args.extend(["-o".into(), "fit-to-page".into()]);
    }
    if options.orientation == "landscape" {
        args.extend(["-o".into(), "landscape".into()]);
    }
    if options.paper_size != "printer" {
        let media = match options.paper_size.as_str() {
            "a4" => "A4",
            "letter" => "Letter",
            "legal" => "Legal",
            _ => unreachable!(),
        };
        args.extend(["-o".into(), format!("media={media}")]);
    }
    args.push(input.to_string_lossy().into_owned());
    Ok(vec![jobs::ProcessStep {
        program: lp,
        args,
        label: format!("Enviando {} cópia(s) ao CUPS", options.copies),
    }])
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn print_steps(
    _input: &Path,
    _options: &PrintOptions,
) -> Result<Vec<jobs::ProcessStep>, SevenError> {
    Err(SevenError::CapabilityUnavailable("Impressão não suportada".into()))
}

pub fn start_print_job(
    app: tauri::AppHandle,
    state: &AppState,
    input: PathBuf,
    options: PrintOptions,
) -> Result<jobs::JobStart, SevenError> {
    options.validate()?;
    validate_printer(&options)?;
    let pages = selected_pages(&input, &options)?;
    let page_count = lopdf::Document::load(&input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?
        .get_pages()
        .len();
    let all_pages = pages.len() == page_count
        && pages.iter().copied().eq(1..=page_count);

    let mut cleanup = Vec::new();
    let mut steps = Vec::new();
    let effective = if all_pages {
        input.clone()
    } else {
        let directory = state.cache_dir.join("jobs");
        fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
        let subset = directory.join(format!("print-{}.pdf", uuid::Uuid::new_v4()));
        steps.push(page_subset_step(&input, &pages, &subset)?);
        cleanup.push(subset.clone());
        subset
    };
    steps.extend(print_steps(&effective, &options)?);

    Ok(jobs::start_process_sequence_job_with_cleanup(
        app,
        state,
        "print",
        steps,
        None,
        cleanup,
    ))
}
