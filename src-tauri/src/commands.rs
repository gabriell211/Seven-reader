use crate::{
    advanced,
    annotations,
    capabilities,
    error::{CommandResult, ErrorPayload, SevenError},
    jobs::{self, JobStart},
    forms,
    ocr,
    document_ops,
    editing,
    pdf,
    redaction,
    signatures,
    state::{AppState, JobStatus},
};
use std::{fs, process::Command, sync::atomic::Ordering};
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
pub async fn find_redaction_matches(
    state: State<'_, AppState>,
    input: String,
    query: String,
    match_case: bool,
    whole_word: bool,
) -> CommandResult<Vec<redaction::RedactionArea>> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        redaction::find_text_matches(&snapshot, &input, &query, match_case, whole_word)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn apply_redactions(
    state: State<'_, AppState>,
    input: String,
    output: String,
    areas: Vec<redaction::RedactionArea>,
) -> CommandResult<redaction::RedactionReport> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        redaction::apply_redactions(&snapshot, &input, &output, &areas)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn edit_add_text(
    input: String,
    output: String,
    placement: editing::TextPlacement,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    editing::add_text(&input, &output, placement).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn edit_replace_text(
    input: String,
    output: String,
    find: String,
    replacement: String,
    all_pages: bool,
    page_index: usize,
) -> CommandResult<editing::ReplaceTextReport> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    editing::replace_text(&input, &output, &find, &replacement, all_pages, page_index)
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn edit_add_image(
    input: String,
    output: String,
    placement: editing::ImagePlacement,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    editing::add_image(&input, &output, placement).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn edit_add_link(
    input: String,
    output: String,
    link: editing::LinkPlacement,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    editing::add_link(&input, &output, link).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn edit_overlay_text(
    input: String,
    output: String,
    options: editing::OverlayTextOptions,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    editing::add_overlay_text(&input, &output, options).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn edit_set_background(
    input: String,
    output: String,
    options: editing::BackgroundOptions,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    editing::set_background(&input, &output, options).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn inspect_advanced_pdf(path: String) -> CommandResult<advanced::AdvancedPdfReport> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    advanced::inspect(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn add_pdf_attachment(
    input: String,
    output: String,
    file_path: String,
    display_name: String,
    description: String,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    advanced::add_attachment(&input, &output, Path::new(&file_path), &display_name, &description).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn extract_pdf_attachment(
    input: String,
    object_id: String,
    destination: String,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    advanced::extract_attachment(&input, &object_id, Path::new(&destination)).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn add_pdf_bookmark(
    input: String,
    output: String,
    bookmark: advanced::BookmarkInput,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    advanced::add_bookmark(&input, &output, bookmark).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn rename_pdf_bookmark(
    input: String,
    output: String,
    object_id: String,
    title: String,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    advanced::rename_bookmark(&input, &output, &object_id, &title).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn set_pdf_layer_visibility(
    input: String,
    output: String,
    object_id: String,
    visible: bool,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    advanced::set_layer_visibility(&input, &output, &object_id, visible).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn list_annotations(path: String) -> CommandResult<Vec<annotations::AnnotationInfo>> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    annotations::list_annotations(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn add_annotation(
    input: String,
    output: String,
    annotation: annotations::AnnotationInput,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    annotations::add_annotation(&input, &output, annotation).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn delete_annotation(
    input: String,
    output: String,
    object_id: String,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    annotations::delete_annotation(&input, &output, &object_id).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn list_form_fields(path: String) -> CommandResult<Vec<forms::FormFieldInfo>> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    forms::list_fields(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn fill_form_fields(
    input: String,
    output: String,
    values: Vec<forms::FormValue>,
) -> CommandResult<usize> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    forms::fill_fields(&input, &output, values).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn create_form_field(
    input: String,
    output: String,
    field: forms::NewFormField,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    forms::create_field(&input, &output, field).map_err(ErrorPayload::from)
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
pub async fn sign_document(
    input: String,
    output: String,
    request: signatures::SignRequest,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    signatures::sign_pdf(&input, &output, request)
        .await
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn validate_signatures(
    input: String,
    trust_directory: Option<String>,
    allow_online: bool,
) -> CommandResult<signatures::SignatureValidationReport> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let trust = match trust_directory {
        Some(path) if !path.trim().is_empty() => Some(
            fs::canonicalize(path)
                .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?,
        ),
        _ => None,
    };
    tauri::async_runtime::spawn_blocking(move || {
        signatures::verify_pdf(&input, trust.as_deref(), allow_online)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_print_document(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;

    #[cfg(target_os = "windows")]
    {
        let executable = jobs::require_executable(&["powershell"], "Windows Print").map_err(ErrorPayload::from)?;
        let escaped = input.to_string_lossy().replace(''', "''");
        let script = format!("Start-Process -FilePath '{}' -Verb Print", escaped);
        let args = vec![
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-Command".into(),
            script,
        ];
        return Ok(jobs::start_process_job(app, &state, "print", executable, args, None));
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let executable = jobs::require_executable(&["lp"], "CUPS/lp").map_err(ErrorPayload::from)?;
        let args = vec![input.to_string_lossy().into_owned()];
        return Ok(jobs::start_process_job(app, &state, "print", executable, args, None));
    }

    #[allow(unreachable_code)]
    Err(ErrorPayload::from(SevenError::CapabilityUnavailable(
        "Impressão não suportada neste sistema".into(),
    )))
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> CommandResult<()> {
    let canonical = fs::canonicalize(&path)
        .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&canonical)
            .spawn()
            .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let parent = canonical.parent().ok_or_else(|| ErrorPayload::from(
            SevenError::InvalidPath("Arquivo sem pasta pai".into())
        ))?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&canonical)
            .spawn()
            .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(ErrorPayload::from(SevenError::CapabilityUnavailable(
        "Gerenciador de arquivos não suportado neste sistema".into(),
    )))
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
