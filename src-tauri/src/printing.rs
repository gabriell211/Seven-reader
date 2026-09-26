use crate::{error::SevenError, jobs, pdf::NormalizedRect, state::AppState};
use serde::{Deserialize, Serialize};
use lopdf::{dictionary, Document, Object, Stream};
use std::{collections::HashSet, fs, path::{Path, PathBuf}, process::Command};

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
    pub selection_rect: Option<NormalizedRect>,
    pub page_set: String,
    pub reverse: bool,
    pub duplex: String,
    pub manual_pass: String,
    pub n_up: u8,
    pub n_up_layout: String,
    pub orientation: String,
    pub paper_size: String,
    pub scaling: String,
    pub color_mode: String,
    pub print_as_image: bool,
    pub raster_dpi: u16,
    pub print_annotations: bool,
    pub print_forms: bool,
}

impl PrintOptions {
    pub fn validate(&self) -> Result<(), SevenError> {
        if !(1..=99).contains(&self.copies) {
            return Err(SevenError::OperationRejected("Cópias deve ficar entre 1 e 99".into()));
        }
        if !matches!(self.page_mode.as_str(), "all" | "current" | "range" | "selection") {
            return Err(SevenError::OperationRejected("Modo de páginas inválido".into()));
        }
        if !matches!(self.page_set.as_str(), "all" | "odd" | "even") {
            return Err(SevenError::OperationRejected("Filtro par/ímpar inválido".into()));
        }
        if !matches!(self.duplex.as_str(), "printer" | "simplex" | "long" | "short") {
            return Err(SevenError::OperationRejected("Duplex inválido".into()));
        }
        if !matches!(self.manual_pass.as_str(), "none" | "front" | "back") {
            return Err(SevenError::OperationRejected("Passagem manual inválida".into()));
        }
        if !matches!(self.n_up, 1 | 2 | 4 | 6 | 9 | 16) {
            return Err(SevenError::OperationRejected("Páginas por folha deve ser 1, 2, 4, 6, 9 ou 16".into()));
        }
        if !matches!(
            self.n_up_layout.as_str(),
            "lrtb" | "lrbt" | "rltb" | "rlbt" | "tblr" | "tbrl" | "btlr" | "btrl"
        ) {
            return Err(SevenError::OperationRejected("Ordem N-up inválida".into()));
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
        if !matches!(self.color_mode.as_str(), "auto" | "color" | "grayscale") {
            return Err(SevenError::OperationRejected("Modo de cor inválido".into()));
        }
        if !(72..=1200).contains(&self.raster_dpi) {
            return Err(SevenError::OperationRejected("DPI de rasterização deve ficar entre 72 e 1200".into()));
        }
        if self.page_range.chars().count() > 512 {
            return Err(SevenError::OperationRejected("Intervalo de páginas muito longo".into()));
        }
        if self.page_mode == "selection" {
            self.selection_rect
                .as_ref()
                .ok_or_else(|| SevenError::OperationRejected("Nenhuma área selecionada para impressão".into()))?
                .validated()?;
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
        "current" | "selection" => {
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
    match options.manual_pass.as_str() {
        "front" => pages.retain(|page| page % 2 == 1),
        "back" => pages.retain(|page| page % 2 == 0),
        _ => {}
    }
    if options.reverse ^ (options.manual_pass == "back") {
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

fn object_number(value: &Object) -> Option<f64> {
    match value {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some(f64::from(*value)),
        _ => None,
    }
}

fn inherited_box(
    document: &lopdf::Document,
    mut page_id: lopdf::ObjectId,
    key: &[u8],
) -> Option<[f64; 4]> {
    for _ in 0..32 {
        let dictionary = document.get_object(page_id).ok()?.as_dict().ok()?;
        if let Ok(Object::Array(values)) = dictionary.get(key) {
            if values.len() >= 4 {
                return Some([
                    object_number(&values[0])?,
                    object_number(&values[1])?,
                    object_number(&values[2])?,
                    object_number(&values[3])?,
                ]);
            }
        }
        page_id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn selection_crop_step(
    input: &Path,
    page_index: usize,
    rect: &NormalizedRect,
    output: &Path,
) -> Result<jobs::ProcessStep, SevenError> {
    let rect = rect.validated()?;
    let document = lopdf::Document::load(input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página selecionada não existe".into()))?;
    let page_box = inherited_box(&document, page_id, b"CropBox")
        .or_else(|| inherited_box(&document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let page_width = (page_box[2] - page_box[0]).abs().max(1.0);
    let page_height = (page_box[3] - page_box[1]).abs().max(1.0);
    let left = page_box[0] + f64::from(rect.x) * page_width;
    let top = page_box[3] - f64::from(rect.y) * page_height;
    let width = f64::from(rect.width) * page_width;
    let height = f64::from(rect.height) * page_height;
    let bottom = top - height;

    let gs = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript")?;
    Ok(jobs::ProcessStep {
        program: gs,
        args: vec![
            "-dBATCH".into(),
            "-dNOPAUSE".into(),
            "-dSAFER".into(),
            "-sDEVICE=pdfwrite".into(),
            "-dCompatibilityLevel=1.7".into(),
            format!("-dFirstPage={}", page_index + 1),
            format!("-dLastPage={}", page_index + 1),
            "-dFIXEDMEDIA".into(),
            format!("-dDEVICEWIDTHPOINTS={width:.4}"),
            format!("-dDEVICEHEIGHTPOINTS={height:.4}"),
            format!("-sOutputFile={}", output.to_string_lossy()),
            "-c".into(),
            format!("<< /PageOffset [{:.4} {:.4}] >> setpagedevice", -left, -bottom),
            "-f".into(),
            input.to_string_lossy().into_owned(),
        ],
        label: "Preparando área selecionada para impressão".into(),
    })
}

fn nup_shape(n_up: u8) -> &'static str {
    match n_up {
        2 => "2x1",
        4 => "2x2",
        6 => "3x2",
        9 => "3x3",
        16 => "4x4",
        _ => "1x1",
    }
}

#[cfg(target_os = "windows")]
fn nup_slots(pages: &[usize], n_up: u8, layout: &str) -> Vec<Option<usize>> {
    if n_up == 1 || layout == "lrtb" {
        return pages.iter().copied().map(Some).collect();
    }
    let (columns, rows) = match n_up {
        2 => (2usize, 1usize),
        4 => (2, 2),
        6 => (3, 2),
        9 => (3, 3),
        16 => (4, 4),
        _ => return pages.iter().copied().map(Some).collect(),
    };
    let positions = match layout {
        "lrtb" => (0..n_up as usize).collect::<Vec<_>>(),
        "lrbt" => (0..rows).rev().flat_map(|y| (0..columns).map(move |x| y * columns + x)).collect(),
        "rltb" => (0..rows).flat_map(|y| (0..columns).rev().map(move |x| y * columns + x)).collect(),
        "rlbt" => (0..rows).rev().flat_map(|y| (0..columns).rev().map(move |x| y * columns + x)).collect(),
        "tblr" => (0..columns).flat_map(|x| (0..rows).map(move |y| y * columns + x)).collect(),
        "tbrl" => (0..columns).rev().flat_map(|x| (0..rows).map(move |y| y * columns + x)).collect(),
        "btlr" => (0..columns).flat_map(|x| (0..rows).rev().map(move |y| y * columns + x)).collect(),
        "btrl" => (0..columns).rev().flat_map(|x| (0..rows).rev().map(move |y| y * columns + x)).collect(),
        _ => return pages.iter().copied().map(Some).collect(),
    };

    let mut output = Vec::new();
    for chunk in pages.chunks(n_up as usize) {
        let mut row_major = vec![None; n_up as usize];
        for (source_index, page) in chunk.iter().copied().enumerate() {
            if let Some(&position) = positions.get(source_index) {
                row_major[position] = Some(page);
            }
        }
        output.extend(row_major);
    }
    output
}

fn create_blank_page_pdf(
    destination: &Path,
    width: f64,
    height: f64,
) -> Result<(), SevenError> {
    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let content_id = document.add_object(Stream::new(lopdf::Dictionary::new(), Vec::new()));
    let page_id = document.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => vec![0.into(), 0.into(), width.into(), height.into()],
        "Resources" => dictionary! {},
        "Contents" => content_id,
    });
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    document.save(destination).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn page_subset_step_with_slots(
    input: &Path,
    slots: &[Option<usize>],
    blank: &Path,
    output: &Path,
) -> Result<jobs::ProcessStep, SevenError> {
    let qpdf = jobs::require_executable(&["qpdf"], "qpdf")?;
    let mut args = vec!["--empty".into(), "--pages".into()];
    for slot in slots {
        match slot {
            Some(page) => {
                args.push(input.to_string_lossy().into_owned());
                args.push(page.to_string());
            }
            None => {
                args.push(blank.to_string_lossy().into_owned());
                args.push("1".into());
            }
        }
    }
    args.push("--".into());
    args.push(output.to_string_lossy().into_owned());
    Ok(jobs::ProcessStep {
        program: qpdf,
        args,
        label: "Preparando ordem N-up e espaços vazios".into(),
    })
}


fn rendered_print_pdf_step(
    input: &Path,
    output: &Path,
    options: &PrintOptions,
) -> Result<jobs::ProcessStep, SevenError> {
    let gs = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript")?;
    let device = if options.print_as_image {
        if options.color_mode == "grayscale" { "pdfimage8" } else { "pdfimage24" }
    } else {
        "pdfwrite"
    };
    let mut args = vec![
        "-dBATCH".into(),
        "-dNOPAUSE".into(),
        "-dSAFER".into(),
        format!("-sDEVICE={device}"),
        format!("-sOutputFile={}", output.to_string_lossy()),
        format!("-dShowAnnots={}", if options.print_annotations { "true" } else { "false" }),
        format!("-dShowAcroForm={}", if options.print_forms { "true" } else { "false" }),
    ];
    if options.print_as_image {
        args.push(format!("-r{}", options.raster_dpi));
        args.push("-dDownScaleFactor=1".into());
        args.push("-sCompression=Flate".into());
    } else if options.color_mode == "grayscale" {
        args.push("-sColorConversionStrategy=Gray".into());
        args.push("-dProcessColorModel=/DeviceGray".into());
    }
    args.push(input.to_string_lossy().into_owned());
    Ok(jobs::ProcessStep {
        program: gs,
        args,
        label: if options.print_as_image {
            "Rasterizando páginas para Print as Image".into()
        } else {
            "Preparando conteúdo de impressão".into()
        },
    })
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
    if options.n_up > 1 {
        base.push(format!("-sNupControl={}", nup_shape(options.n_up)));
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
        match if options.manual_pass == "none" { options.duplex.as_str() } else { "simplex" } {
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
    match if options.manual_pass == "none" { options.duplex.as_str() } else { "simplex" } {
        "simplex" => args.extend(["-o".into(), "sides=one-sided".into()]),
        "long" => args.extend(["-o".into(), "sides=two-sided-long-edge".into()]),
        "short" => args.extend(["-o".into(), "sides=two-sided-short-edge".into()]),
        _ => {}
    }
    if options.scaling == "fit" {
        args.extend(["-o".into(), "fit-to-page".into()]);
    }
    if options.n_up > 1 {
        args.extend(["-o".into(), format!("number-up={}", options.n_up)]);
        args.extend(["-o".into(), format!("number-up-layout={}", options.n_up_layout)]);
    }
    match options.color_mode.as_str() {
        "color" => args.extend(["-o".into(), "print-color-mode=color".into()]),
        "grayscale" => args.extend(["-o".into(), "print-color-mode=monochrome".into()]),
        _ => {}
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
    #[cfg(target_os = "windows")]
    let nup_slots = nup_slots(&pages, options.n_up, &options.n_up_layout);
    let page_count = lopdf::Document::load(&input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?
        .get_pages()
        .len();
    let all_pages = pages.len() == page_count
        && pages.iter().copied().eq(1..=page_count)
        && options.manual_pass == "none"
        && options.page_set == "all"
        && !options.reverse
        && {
            #[cfg(target_os = "windows")]
            { options.n_up == 1 || options.n_up_layout == "lrtb" }
            #[cfg(not(target_os = "windows"))]
            { true }
        };

    let mut cleanup = Vec::new();
    let mut steps = Vec::new();
    let mut effective = if options.page_mode == "selection" {
        let directory = state.cache_dir.join("jobs");
        fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
        let cropped = directory.join(format!("print-selection-{}.pdf", uuid::Uuid::new_v4()));
        let rect = options.selection_rect
            .as_ref()
            .ok_or_else(|| SevenError::OperationRejected("Nenhuma área selecionada".into()))?;
        steps.push(selection_crop_step(&input, options.current_page, rect, &cropped)?);
        cleanup.push(cropped.clone());
        cropped
    } else if all_pages {
        input.clone()
    } else {
        let directory = state.cache_dir.join("jobs");
        fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
        let subset = directory.join(format!("print-{}.pdf", uuid::Uuid::new_v4()));

        #[cfg(target_os = "windows")]
        if options.n_up > 1 && options.n_up_layout != "lrtb" {
            let page_id = lopdf::Document::load(&input)
                .map_err(|error| SevenError::PdfOpen(error.to_string()))?
                .get_pages()
                .get(&(pages[0] as u32))
                .copied()
                .ok_or_else(|| SevenError::OperationRejected("Página N-up não encontrada".into()))?;
            let document = lopdf::Document::load(&input)
                .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
            let page_box = inherited_box(&document, page_id, b"CropBox")
                .or_else(|| inherited_box(&document, page_id, b"MediaBox"))
                .unwrap_or([0.0, 0.0, 612.0, 792.0]);
            let blank = directory.join(format!("print-blank-{}.pdf", uuid::Uuid::new_v4()));
            create_blank_page_pdf(
                &blank,
                (page_box[2] - page_box[0]).abs().max(1.0),
                (page_box[3] - page_box[1]).abs().max(1.0),
            )?;
            steps.push(page_subset_step_with_slots(&input, &nup_slots, &blank, &subset)?);
            cleanup.push(blank);
        } else {
            steps.push(page_subset_step(&input, &pages, &subset)?);
        }

        #[cfg(not(target_os = "windows"))]
        steps.push(page_subset_step(&input, &pages, &subset)?);

        cleanup.push(subset.clone());
        subset
    };

    let needs_render_preparation =
        options.print_as_image
        || options.color_mode == "grayscale"
        || (!cfg!(target_os = "windows") && (!options.print_annotations || !options.print_forms));
    if needs_render_preparation {
        let directory = state.cache_dir.join("jobs");
        fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
        let prepared = directory.join(format!("print-rendered-{}.pdf", uuid::Uuid::new_v4()));
        steps.push(rendered_print_pdf_step(&effective, &prepared, &options)?);
        cleanup.push(prepared.clone());
        effective = prepared;
    }

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
