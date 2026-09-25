use crate::{
    capabilities,
    error::{CommandResult, ErrorPayload, SevenError},
    jobs::{self, JobStart},
    ocr,
    document_ops,
    pdf,
    state::{AppState, JobStatus},
};
use std::{fs, sync::atomic::Ordering};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_capabilities(state: State<'_, AppState>) -> capabilities::Capabilities {
    capabilities::detect(&state)
}

#[tauri::command]
pub async fn open_document(
    state: State<'_, AppState>,
    path: String,
    password: Option<String>,
) -> CommandResult<pdf::DocumentSummary> {
    let canonical = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    let inspected = tauri::async_runtime::spawn_blocking(move || pdf::inspect(&canonical, password))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)?;

    let summary = pdf::summary(&inspected);
    state.documents.lock().insert(inspected.id.clone(), inspected);
    Ok(summary)
}

#[tauri::command]
pub fn close_document(state: State<'_, AppState>, document_id: String) -> CommandResult<()> {
    state.documents.lock().remove(&document_id);
    Ok(())
}

#[tauri::command]
pub async fn render_page(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    target_width: u16,
) -> CommandResult<pdf::RenderResult> {
    let document = state.documents.lock().get(&document_id).cloned().ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let state_snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || pdf::render_page(&state_snapshot, &document, page_index, target_width.clamp(320, 6000)))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn search_document(
    state: State<'_, AppState>,
    document_id: String,
    query: String,
) -> CommandResult<Vec<pdf::SearchHit>> {
    let document = state.documents.lock().get(&document_id).cloned().ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let state_snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || pdf::search_document(&state_snapshot, &document, &query))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn save_document_as(
    state: State<'_, AppState>,
    document_id: String,
    destination: String,
) -> CommandResult<()> {
    let document = state.documents.lock().get(&document_id).cloned().ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    let temp = output.with_extension("seven.tmp.pdf");
    fs::copy(&document.path, &temp).map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
    pdf::validate_pdf_path(temp.to_string_lossy().as_ref()).map_err(ErrorPayload::from)?;
    fs::rename(&temp, &output).map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
    Ok(())
}

#[tauri::command]
pub fn create_blank_document(
    destination: String,
    page_size: String,
    page_count: u16,
) -> CommandResult<()> {
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    pdf::create_blank_pdf(&output, &page_size, page_count).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_combine_documents(
    app: AppHandle,
    state: State<'_, AppState>,
    inputs: Vec<String>,
    output: String,
) -> CommandResult<JobStart> {
    if inputs.len() < 2 {
        return Err(ErrorPayload::from(SevenError::OperationRejected("Selecione ao menos dois PDFs".into())));
    }
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let mut canonical = Vec::with_capacity(inputs.len());
    for input in inputs {
        canonical.push(pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?);
    }
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let mut args = vec!["--empty".to_owned(), "--pages".to_owned()];
    for input in canonical {
        args.push(input.to_string_lossy().into_owned());
        args.push("1-z".into());
    }
    args.push("--".into());
    args.push(output.to_string_lossy().into_owned());
    Ok(jobs::start_process_job(app, &state, "combine", executable, args, Some(output)))
}

#[tauri::command]
pub fn start_split_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    pages_per_file: u16,
) -> CommandResult<JobStart> {
    if !(1..=500).contains(&pages_per_file) {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Páginas por arquivo deve ficar entre 1 e 500".into(),
        )));
    }

    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let args = vec![
        format!("--split-pages={pages_per_file}"),
        input.to_string_lossy().into_owned(),
        output.to_string_lossy().into_owned(),
    ];

    Ok(jobs::start_process_job(
        app,
        &state,
        "split-pages",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub fn start_extract_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    page_range: String,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let page_range = jobs::validated_page_range(&page_range).map_err(ErrorPayload::from)?;

    let args = vec![
        input.to_string_lossy().into_owned(),
        "--pages".into(),
        ".".into(),
        page_range,
        "--".into(),
        output.to_string_lossy().into_owned(),
    ];

    Ok(jobs::start_process_job(
        app,
        &state,
        "extract-pages",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub fn start_reorder_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    page_order: String,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let page_order = jobs::validated_page_range(&page_order).map_err(ErrorPayload::from)?;

    let args = vec![
        input.to_string_lossy().into_owned(),
        "--pages".into(),
        ".".into(),
        page_order,
        "--".into(),
        output.to_string_lossy().into_owned(),
    ];

    Ok(jobs::start_process_job(
        app,
        &state,
        "reorder-pages",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub fn start_rotate_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    page_range: String,
    angle: i16,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let page_range = jobs::validated_page_range(&page_range).map_err(ErrorPayload::from)?;
    let angle = jobs::validated_rotation(angle).map_err(ErrorPayload::from)?;
    let sign = if angle >= 0 { "+" } else { "" };
    let rotate = format!("--rotate={sign}{angle}:{page_range}");

    let args = vec![
        input.to_string_lossy().into_owned(),
        rotate,
        "--".into(),
        output.to_string_lossy().into_owned(),
    ];

    Ok(jobs::start_process_job(
        app,
        &state,
        "rotate-pages",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub fn create_pdf_from_images(
    inputs: Vec<String>,
    destination: String,
    dpi: u16,
) -> CommandResult<()> {
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    let mut paths = Vec::with_capacity(inputs.len());
    for input in inputs {
        let path = std::path::Path::new(&input);
        if !path.exists() || !path.is_file() {
            return Err(ErrorPayload::from(SevenError::NotFound(input)));
        }
        paths.push(
            fs::canonicalize(path)
                .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?,
        );
    }
    pdf::create_pdf_from_images(&paths, &output, dpi).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_ocr_advanced(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    options: ocr::OcrOptions,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["ocrmypdf"], "OCRmyPDF").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let args = options
        .args(
            input.to_string_lossy().as_ref(),
            output.to_string_lossy().as_ref(),
        )
        .map_err(ErrorPayload::from)?;
    Ok(jobs::start_process_job(
        app,
        &state,
        "ocr",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub async fn review_ocr_page(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    language: String,
    threshold: f32,
) -> CommandResult<Vec<ocr::OcrWord>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let state_snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        ocr::review_page(&state_snapshot, &document, page_index, &language, threshold)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn scan_page_to_pdf(
    destination: String,
    dpi: u16,
) -> CommandResult<()> {
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    let dpi = dpi.clamp(75, 1200);
    tauri::async_runtime::spawn_blocking(move || {
        let scanner = jobs::require_executable(&["scanimage"], "SANE/scanimage")?;
        let scan = std::process::Command::new(scanner)
            .arg("--format=png")
            .arg(format!("--resolution={dpi}"))
            .stdin(std::process::Stdio::null())
            .output()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        if !scan.status.success() {
            return Err(SevenError::Operation(format!(
                "Scanner encerrou com código {:?}",
                scan.status.code()
            )));
        }
        let temp = output.with_extension("seven-scan.png");
        fs::write(&temp, scan.stdout).map_err(|error| SevenError::Io(error.to_string()))?;
        let result = pdf::create_pdf_from_images(&[temp.clone()], &output, dpi);
        let _ = fs::remove_file(temp);
        result
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn scan_page_to_pdf(
    _destination: String,
    _dpi: u16,
) -> CommandResult<()> {
    Err(ErrorPayload::from(SevenError::CapabilityUnavailable(
        "Scanner nativo ainda não disponível neste sistema operacional".into(),
    )))
}

#[tauri::command]
pub fn start_ocr(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    language: Option<String>,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["ocrmypdf"], "OCRmyPDF").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let language = language.unwrap_or_else(|| "por+eng".into());
    if !language.chars().all(|char| char.is_ascii_alphanumeric() || matches!(char, '+' | '_' | '-')) {
        return Err(ErrorPayload::from(SevenError::OperationRejected("Idioma OCR inválido".into())));
    }
    let args = vec![
        "--deskew".into(),
        "--rotate-pages".into(),
        "--skip-text".into(),
        "-l".into(),
        language,
        input.to_string_lossy().into_owned(),
        output.to_string_lossy().into_owned(),
    ];
    Ok(jobs::start_process_job(app, &state, "ocr", executable, args, Some(output)))
}

#[tauri::command]
pub fn start_optimize_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    preset: Option<String>,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let setting = match preset.as_deref() {
        Some("screen") => "/screen",
        Some("ebook") => "/ebook",
        Some("printer") => "/printer",
        Some("prepress") => "/prepress",
        _ => "/default",
    };
    let args = vec![
        "-sDEVICE=pdfwrite".into(),
        "-dCompatibilityLevel=1.7".into(),
        format!("-dPDFSETTINGS={setting}"),
        "-dNOPAUSE".into(),
        "-dQUIET".into(),
        "-dBATCH".into(),
        format!("-sOutputFile={}", output.to_string_lossy()),
        input.to_string_lossy().into_owned(),
    ];
    Ok(jobs::start_process_job(app, &state, "optimize", executable, args, Some(output)))
}

#[tauri::command]
pub fn get_document_metadata(
    path: String,
) -> CommandResult<document_ops::DocumentMetadata> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    document_ops::read_metadata(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn update_document_metadata(
    input: String,
    output: String,
    update: document_ops::MetadataUpdate,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    document_ops::write_metadata(&input, &output, update).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn sanitize_document(
    input: String,
    output: String,
    options: document_ops::SanitizeOptions,
) -> CommandResult<document_ops::SanitizeReport> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    document_ops::sanitize_document(&input, &output, options).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn get_accessibility_report(
    path: String,
) -> CommandResult<document_ops::AccessibilityReport> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    document_ops::accessibility_report(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn compare_documents(
    state: State<'_, AppState>,
    left: String,
    right: String,
) -> CommandResult<pdf::CompareReport> {
    let left = pdf::validate_pdf_path(&left).map_err(ErrorPayload::from)?;
    let right = pdf::validate_pdf_path(&right).map_err(ErrorPayload::from)?;
    let state_snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || pdf::compare_documents(&state_snapshot, &left, &right))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_encrypt_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    user_password: String,
    owner_password: String,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let user_password = jobs::validated_password(&user_password, "Senha de abertura").map_err(ErrorPayload::from)?;
    let owner_password = jobs::validated_password(&owner_password, "Senha de proprietário").map_err(ErrorPayload::from)?;

    let args = vec![
        "--encrypt".into(),
        format!("--user-password={user_password}"),
        format!("--owner-password={owner_password}"),
        "--bits=256".into(),
        "--".into(),
        input.to_string_lossy().into_owned(),
        output.to_string_lossy().into_owned(),
    ];
    Ok(jobs::start_process_job(app, &state, "encrypt", executable, args, Some(output)))
}

#[tauri::command]
pub fn start_decrypt_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    password: String,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let password = jobs::validated_password(&password, "Senha").map_err(ErrorPayload::from)?;
    let args = vec![
        format!("--password={password}"),
        "--decrypt".into(),
        input.to_string_lossy().into_owned(),
        output.to_string_lossy().into_owned(),
    ];
    Ok(jobs::start_process_job(app, &state, "decrypt", executable, args, Some(output)))
}

#[tauri::command]
pub fn start_convert_to_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output_directory: String,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["soffice", "libreoffice"], "LibreOffice").map_err(ErrorPayload::from)?;
    let input_path = std::path::Path::new(&input);
    if !input_path.exists() || !input_path.is_file() {
        return Err(ErrorPayload::from(SevenError::NotFound(input)));
    }
    let input = fs::canonicalize(input_path).map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;
    let output_directory = jobs::validated_directory(&output_directory).map_err(ErrorPayload::from)?;

    let args = vec![
        "--headless".into(),
        "--convert-to".into(),
        "pdf".into(),
        "--outdir".into(),
        output_directory.to_string_lossy().into_owned(),
        input.to_string_lossy().into_owned(),
    ];
    Ok(jobs::start_process_job(
        app,
        &state,
        "convert-to-pdf",
        executable,
        args,
        Some(output_directory),
    ))
}

#[tauri::command]
pub fn start_export_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    format: String,
    dpi: Option<u16>,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let format = format.to_lowercase();

    if format == "txt" {
        let executable = jobs::require_executable(&["pdftotext"], "pdftotext").map_err(ErrorPayload::from)?;
        let output = jobs::validated_output(&output, "txt").map_err(ErrorPayload::from)?;
        let args = vec![input.to_string_lossy().into_owned(), output.to_string_lossy().into_owned()];
        return Ok(jobs::start_process_job(app, &state, "export-text", executable, args, Some(output)));
    }

    let executable = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript").map_err(ErrorPayload::from)?;
    if format == "ps" {
        let output = jobs::validated_output(&output, "ps").map_err(ErrorPayload::from)?;
        let args = vec![
            "-sDEVICE=ps2write".into(),
            "-dNOPAUSE".into(),
            "-dBATCH".into(),
            format!("-sOutputFile={}", output.to_string_lossy()),
            input.to_string_lossy().into_owned(),
        ];
        return Ok(jobs::start_process_job(app, &state, "export-ps", executable, args, Some(output)));
    }

    let extension = match format.as_str() {
        "png" => "png",
        "jpeg" | "jpg" => "jpg",
        "tiff" | "tif" => "tif",
        _ => return Err(ErrorPayload::from(SevenError::UnsupportedFormat(format))),
    };
    let output_directory = jobs::validated_directory(&output).map_err(ErrorPayload::from)?;
    let dpi = dpi.unwrap_or(150).clamp(72, 1200);
    let device = match extension {
        "png" => "png16m",
        "jpg" => "jpeg",
        _ => "tiff24nc",
    };
    let pattern = output_directory.join(format!("page-%04d.{extension}"));
    let args = vec![
        format!("-sDEVICE={device}"),
        format!("-r{dpi}"),
        "-dNOPAUSE".into(),
        "-dBATCH".into(),
        format!("-sOutputFile={}", pattern.to_string_lossy()),
        input.to_string_lossy().into_owned(),
    ];
    Ok(jobs::start_process_job(app, &state, "export-images", executable, args, Some(output_directory)))
}

#[tauri::command]
pub fn get_job_status(state: State<'_, AppState>, job_id: String) -> CommandResult<JobStatus> {
    state.jobs.lock().get(&job_id).map(|runtime| runtime.status.clone())
        .ok_or_else(|| ErrorPayload::from(SevenError::NotFound(job_id)))
}

#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, job_id: String) -> CommandResult<()> {
    let jobs = state.jobs.lock();
    let runtime = jobs.get(&job_id).ok_or_else(|| ErrorPayload::from(SevenError::NotFound(job_id)))?;
    runtime.cancel.store(true, Ordering::Relaxed);
    Ok(())
}
