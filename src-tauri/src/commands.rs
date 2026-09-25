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
    search,
    session,
    signatures,
    state::{AppState, JobStatus},
};
use serde::Serialize;
use std::{fs, process::Command, sync::atomic::Ordering};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReplaceTextResult {
    pub document: pdf::DocumentSummary,
    pub report: editing::ReplaceTextReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFormFillResult {
    pub document: pdf::DocumentSummary,
    pub changed: usize,
}

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
pub async fn restore_document_session(
    state: State<'_, AppState>,
    path: String,
    working_path: String,
    password: Option<String>,
) -> CommandResult<pdf::DocumentSummary> {
    let canonical = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    let working = pdf::validate_pdf_path(&working_path).map_err(ErrorPayload::from)?;
    let editing_root = state.cache_dir.join("editing");
    fs::create_dir_all(&editing_root)
        .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
    let editing_root = fs::canonicalize(&editing_root)
        .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;
    let working = fs::canonicalize(&working)
        .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;

    if !working.starts_with(&editing_root) {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "A revisão de recuperação não pertence ao cache seguro do Seven Reader".into(),
        )));
    }

    let password_for_original = password.clone();
    let mut inspected = tauri::async_runtime::spawn_blocking(move || {
        pdf::inspect(&canonical, password_for_original)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)?;

    let working_for_inspection = working.clone();
    let password_for_working = password.clone();
    let working_inspected = tauri::async_runtime::spawn_blocking(move || {
        pdf::inspect(&working_for_inspection, password_for_working)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)?;

    let recovery_dir = state.cache_dir.join("editing").join(&inspected.id);
    fs::create_dir_all(&recovery_dir)
        .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
    let recovered = recovery_dir.join("rev-00000001-recovered.pdf");
    fs::copy(&working, &recovered)
        .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
    pdf::validate_pdf_path(recovered.to_string_lossy().as_ref()).map_err(ErrorPayload::from)?;

    inspected.working_path = Some(recovered);
    inspected.revision = 1;
    inspected.file_size = working_inspected.file_size;
    inspected.page_count = working_inspected.page_count;
    inspected.pdf_version = working_inspected.pdf_version;
    inspected.encrypted = working_inspected.encrypted;
    inspected.has_signatures = working_inspected.has_signatures;
    inspected.has_forms = working_inspected.has_forms;

    let summary = pdf::summary(&inspected);
    state.documents.lock().insert(inspected.id.clone(), inspected);

    if let Some(old_dir) = working.parent() {
        if old_dir.starts_with(&editing_root) && old_dir != recovery_dir {
            let _ = fs::remove_dir_all(old_dir);
        }
    }
    Ok(summary)
}

#[tauri::command]
pub fn close_document(state: State<'_, AppState>, document_id: String) -> CommandResult<()> {
    state.documents.lock().remove(&document_id);
    let editing_dir = state.cache_dir.join("editing").join(&document_id);
    if editing_dir.exists() {
        fs::remove_dir_all(&editing_dir)
            .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
    }
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
pub async fn search_document_advanced(
    state: State<'_, AppState>,
    document_id: String,
    options: search::AdvancedSearchOptions,
) -> CommandResult<Vec<search::AdvancedSearchHit>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || search::search(&snapshot, &document, options))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn extract_text_in_rect(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    rect: pdf::NormalizedRect,
) -> CommandResult<pdf::TextSelectionResult> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        pdf::extract_text_in_rect(&snapshot, &document, page_index, rect)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn crop_page_selection(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    target_width: u16,
    rect: pdf::NormalizedRect,
) -> CommandResult<String> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        pdf::crop_rendered_page(&snapshot, &document, page_index, target_width, rect)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn save_document(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::save(&state, &document_id).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn undo_document(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::undo(&state, &document_id).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn redo_document(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::redo(&state, &document_id).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_add_annotation(
    state: State<'_, AppState>,
    document_id: String,
    annotation: annotations::AnnotationInput,
) -> CommandResult<pdf::DocumentSummary> {
    let prepared = session::prepare_revision(&state, &document_id, "annotation")
        .map_err(ErrorPayload::from)?;
    annotations::add_annotation(
        prepared.document.active_path(),
        &prepared.output,
        annotation,
    )
    .map_err(ErrorPayload::from)?;
    session::commit_revision(
        &state,
        &document_id,
        prepared.expected_revision,
        prepared.output,
    )
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_delete_annotation(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    let prepared = session::prepare_revision(&state, &document_id, "delete-annotation")
        .map_err(ErrorPayload::from)?;
    annotations::delete_annotation(
        prepared.document.active_path(),
        &prepared.output,
        &object_id,
    )
    .map_err(ErrorPayload::from)?;
    session::commit_revision(
        &state,
        &document_id,
        prepared.expected_revision,
        prepared.output,
    )
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_add_ink(
    state: State<'_, AppState>,
    document_id: String,
    ink: annotations::InkAnnotationInput,
) -> CommandResult<pdf::DocumentSummary> {
    let prepared = session::prepare_revision(&state, &document_id, "ink")
        .map_err(ErrorPayload::from)?;
    annotations::add_ink_annotation(
        prepared.document.active_path(),
        &prepared.output,
        ink,
    )
    .map_err(ErrorPayload::from)?;
    session::commit_revision(
        &state,
        &document_id,
        prepared.expected_revision,
        prepared.output,
    )
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_add_markup(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    kind: String,
    author: String,
    rect: pdf::NormalizedRect,
) -> CommandResult<pdf::DocumentSummary> {
    let prepared = session::prepare_revision(&state, &document_id, "markup")
        .map_err(ErrorPayload::from)?;
    annotations::add_markup_annotation_normalized(
        prepared.document.active_path(),
        &prepared.output,
        page_index,
        &kind,
        &author,
        rect,
    )
    .map_err(ErrorPayload::from)?;
    session::commit_revision(
        &state,
        &document_id,
        prepared.expected_revision,
        prepared.output,
    )
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_add_text(
    state: State<'_, AppState>,
    document_id: String,
    placement: editing::TextPlacement,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "add-text", move |input, output| {
        editing::add_text(input, output, placement)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_replace_text(
    state: State<'_, AppState>,
    document_id: String,
    find: String,
    replacement: String,
    all_pages: bool,
    page_index: usize,
) -> CommandResult<SessionReplaceTextResult> {
    session::apply_revision(&state, &document_id, "replace-text", move |input, output| {
        editing::replace_text(input, output, &find, &replacement, all_pages, page_index)
    })
    .map(|(document, report)| SessionReplaceTextResult { document, report })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_add_image(
    state: State<'_, AppState>,
    document_id: String,
    placement: editing::ImagePlacement,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "add-image", move |input, output| {
        editing::add_image(input, output, placement)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_add_link(
    state: State<'_, AppState>,
    document_id: String,
    link: editing::LinkPlacement,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "add-link", move |input, output| {
        editing::add_link(input, output, link)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_overlay_text(
    state: State<'_, AppState>,
    document_id: String,
    options: editing::OverlayTextOptions,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "overlay", move |input, output| {
        editing::add_overlay_text(input, output, options)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_set_background(
    state: State<'_, AppState>,
    document_id: String,
    options: editing::BackgroundOptions,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "background", move |input, output| {
        editing::set_background(input, output, options)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_fill_form_fields(
    state: State<'_, AppState>,
    document_id: String,
    values: Vec<forms::FormValue>,
) -> CommandResult<SessionFormFillResult> {
    session::apply_revision(&state, &document_id, "fill-form", move |input, output| {
        forms::fill_fields(input, output, values)
    })
    .map(|(document, changed)| SessionFormFillResult { document, changed })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_create_form_field(
    state: State<'_, AppState>,
    document_id: String,
    field: forms::NewFormField,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "create-field", move |input, output| {
        forms::create_field(input, output, field)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_add_pdf_bookmark(
    state: State<'_, AppState>,
    document_id: String,
    bookmark: advanced::BookmarkInput,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "bookmark", move |input, output| {
        advanced::add_bookmark(input, output, bookmark)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_rename_pdf_bookmark(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    title: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "rename-bookmark", move |input, output| {
        advanced::rename_bookmark(input, output, &object_id, &title)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_add_pdf_attachment(
    state: State<'_, AppState>,
    document_id: String,
    file_path: String,
    display_name: String,
    description: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "attachment", move |input, output| {
        advanced::add_attachment(input, output, std::path::Path::new(&file_path), &display_name, &description)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_pdf_layer_visibility(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    visible: bool,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "layer", move |input, output| {
        advanced::set_layer_visibility(input, output, &object_id, visible)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_update_document_metadata(
    state: State<'_, AppState>,
    document_id: String,
    update: document_ops::MetadataUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "metadata", move |input, output| {
        document_ops::write_metadata(input, output, update)
    })
    .map(|(summary, _)| summary)
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
    fs::copy(document.active_path(), &temp).map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
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
pub fn create_pdf_from_clipboard_image(
    destination: String,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    dpi: u16,
) -> CommandResult<()> {
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    pdf::create_pdf_from_rgba(&output, rgba, width, height, dpi).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn create_pdf_from_text(
    destination: String,
    text: String,
    page_size: String,
    font_size: u16,
) -> CommandResult<()> {
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    pdf::create_pdf_from_text(&output, &text, &page_size, font_size).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_web_to_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    output: String,
) -> CommandResult<JobStart> {
    let trimmed = url.trim();
    if trimmed.len() > 4096
        || trimmed.contains(['\r', '\n', '\0'])
        || !(trimmed.starts_with("https://") || trimmed.starts_with("http://"))
    {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Use uma URL HTTP ou HTTPS válida".into(),
        )));
    }

    let browser = capabilities::find_browser().ok_or_else(|| {
        ErrorPayload::from(SevenError::CapabilityUnavailable(
            "Chrome, Chromium ou Edge não detectado".into(),
        ))
    })?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;

    let args = vec![
        "--headless=new".into(),
        "--disable-gpu".into(),
        "--disable-extensions".into(),
        "--incognito".into(),
        "--no-pdf-header-footer".into(),
        format!("--print-to-pdf={}", output.to_string_lossy()),
        trimmed.to_owned(),
    ];

    Ok(jobs::start_process_job(
        app,
        &state,
        "web-to-pdf",
        browser,
        args,
        Some(output),
    ))
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
pub fn start_delete_pages(
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

    let exclusions = page_range
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| format!("x{}", part.trim_start_matches('x')))
        .collect::<Vec<_>>();

    if exclusions.is_empty() {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Informe ao menos uma página para excluir".into(),
        )));
    }

    let selection = format!("1-z,{}", exclusions.join(","));
    let args = vec![
        input.to_string_lossy().into_owned(),
        "--pages".into(),
        ".".into(),
        selection,
        "--".into(),
        output.to_string_lossy().into_owned(),
    ];

    Ok(jobs::start_process_job(
        app,
        &state,
        "delete-pages",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub fn start_insert_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    source: String,
    source_range: String,
    insert_after: usize,
) -> CommandResult<JobStart> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let source = pdf::validate_pdf_path(&source).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source_range = jobs::validated_page_range(&source_range).map_err(ErrorPayload::from)?;

    let page_count = lopdf::Document::load(&input)
        .map_err(|error| ErrorPayload::from(SevenError::PdfOpen(error.to_string())))?
        .get_pages()
        .len();

    if insert_after > page_count {
        return Err(ErrorPayload::from(SevenError::OperationRejected(format!(
            "A posição de inserção deve ficar entre 0 e {page_count}"
        ))));
    }

    let mut args = vec![
        input.to_string_lossy().into_owned(),
        "--pages".into(),
    ];

    if insert_after > 0 {
        args.push(".".into());
        args.push(format!("1-{insert_after}"));
    }

    args.push(source.to_string_lossy().into_owned());
    args.push(source_range);

    if insert_after < page_count {
        args.push(".".into());
        args.push(format!("{}-z", insert_after + 1));
    }

    args.push("--".into());
    args.push(output.to_string_lossy().into_owned());

    Ok(jobs::start_process_job(
        app,
        &state,
        "insert-pages",
        executable,
        args,
        Some(output),
    ))
}

#[tauri::command]
pub fn start_replace_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    source: String,
    target_start: usize,
    source_start: usize,
    count: usize,
) -> CommandResult<JobStart> {
    if target_start == 0 || source_start == 0 || count == 0 || count > 5000 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Página inicial e quantidade devem ser maiores que zero".into(),
        )));
    }

    let executable = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let source = pdf::validate_pdf_path(&source).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;

    let target_count = lopdf::Document::load(&input)
        .map_err(|error| ErrorPayload::from(SevenError::PdfOpen(error.to_string())))?
        .get_pages()
        .len();
    let source_count = lopdf::Document::load(&source)
        .map_err(|error| ErrorPayload::from(SevenError::PdfOpen(error.to_string())))?
        .get_pages()
        .len();

    let target_end = target_start.saturating_add(count - 1);
    let source_end = source_start.saturating_add(count - 1);

    if target_end > target_count {
        return Err(ErrorPayload::from(SevenError::OperationRejected(format!(
            "O intervalo de destino ultrapassa as {target_count} páginas do documento"
        ))));
    }
    if source_end > source_count {
        return Err(ErrorPayload::from(SevenError::OperationRejected(format!(
            "O intervalo de substituição ultrapassa as {source_count} páginas do arquivo de origem"
        ))));
    }

    let mut args = vec![
        input.to_string_lossy().into_owned(),
        "--pages".into(),
    ];

    if target_start > 1 {
        args.push(".".into());
        args.push(format!("1-{}", target_start - 1));
    }

    args.push(source.to_string_lossy().into_owned());
    args.push(format!("{source_start}-{source_end}"));

    if target_end < target_count {
        args.push(".".into());
        args.push(format!("{}-z", target_end + 1));
    }

    args.push("--".into());
    args.push(output.to_string_lossy().into_owned());

    Ok(jobs::start_process_job(
        app,
        &state,
        "replace-pages",
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
pub fn start_batch_ocr(
    app: AppHandle,
    state: State<'_, AppState>,
    inputs: Vec<String>,
    output_directory: String,
    options: ocr::OcrOptions,
) -> CommandResult<JobStart> {
    if inputs.is_empty() || inputs.len() > 200 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Selecione entre 1 e 200 PDFs para OCR em lote".into(),
        )));
    }
    options.validated().map_err(ErrorPayload::from)?;

    let executable = jobs::require_executable(&["ocrmypdf"], "OCRmyPDF").map_err(ErrorPayload::from)?;
    let output_directory = jobs::validated_directory(&output_directory).map_err(ErrorPayload::from)?;
    let total = inputs.len();
    let mut steps = Vec::with_capacity(total);

    for (index, input) in inputs.into_iter().enumerate() {
        let canonical = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
        let stem = canonical.file_stem().and_then(|value| value.to_str()).unwrap_or("documento");
        let mut output = output_directory.join(format!("{stem}-ocr.pdf"));
        let mut suffix = 2usize;
        while output.exists() {
            output = output_directory.join(format!("{stem}-ocr-{suffix}.pdf"));
            suffix += 1;
        }

        let args = options
            .args(canonical.to_string_lossy().as_ref(), output.to_string_lossy().as_ref())
            .map_err(ErrorPayload::from)?;
        let name = canonical.file_name().and_then(|value| value.to_str()).unwrap_or("documento.pdf");
        steps.push(jobs::ProcessStep {
            program: executable.clone(),
            args,
            label: format!("OCR {} de {} · {name}", index + 1, total),
        });
    }

    Ok(jobs::start_process_sequence_job(
        app,
        &state,
        "batch-ocr",
        steps,
        Some(output_directory),
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

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn scan_page_to_pdf(
    destination: String,
    dpi: u16,
) -> CommandResult<()> {
    let output = jobs::validated_output(&destination, "pdf").map_err(ErrorPayload::from)?;
    let dpi = dpi.clamp(75, 1200);
    tauri::async_runtime::spawn_blocking(move || {
        let powershell = jobs::require_executable(&["powershell"], "Windows PowerShell/WIA")?;
        let temp = output.with_extension("seven-wia-scan.png");
        let escaped_temp = temp.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$ErrorActionPreference='Stop'; \
             $dialog=New-Object -ComObject WIA.CommonDialog; \
             $device=$dialog.ShowSelectDevice(1,$false,$false); \
             if($null -eq $device){{ throw 'Nenhum scanner selecionado.' }}; \
             $item=$device.Items.Item(1); \
             try{{$item.Properties.Item('6147').Value={dpi}}}catch{{}}; \
             try{{$item.Properties.Item('6148').Value={dpi}}}catch{{}}; \
             $image=$dialog.ShowTransfer($item,'{{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}}',$false); \
             if($null -eq $image){{ throw 'Digitalização cancelada.' }}; \
             $image.SaveFile('{escaped_temp}')"
        );
        let result = std::process::Command::new(powershell)
            .args(["-NoProfile", "-STA", "-Command", &script])
            .stdin(std::process::Stdio::null())
            .output()
            .map_err(|error| SevenError::Operation(error.to_string()))?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr).trim().to_owned();
            return Err(SevenError::Operation(if stderr.is_empty() {
                format!("WIA encerrou com código {:?}", result.status.code())
            } else {
                stderr
            }));
        }

        if !temp.is_file() {
            return Err(SevenError::Operation("O scanner não gerou uma imagem".into()));
        }

        let created = pdf::create_pdf_from_images(&[temp.clone()], &output, dpi);
        let _ = fs::remove_file(&temp);
        created
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
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
pub fn add_ink_annotation(
    input: String,
    output: String,
    ink: annotations::InkAnnotationInput,
) -> CommandResult<()> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    annotations::add_ink_annotation(&input, &output, ink).map_err(ErrorPayload::from)
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
pub fn list_pdf_actions(path: String) -> CommandResult<Vec<advanced::PdfActionInfo>> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    advanced::list_actions(&input).map_err(ErrorPayload::from)
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
pub fn start_batch_convert_to_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    inputs: Vec<String>,
    output_directory: String,
) -> CommandResult<JobStart> {
    if inputs.is_empty() || inputs.len() > 200 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Selecione entre 1 e 200 arquivos para conversão em lote".into(),
        )));
    }

    let executable = jobs::require_executable(&["soffice", "libreoffice"], "LibreOffice").map_err(ErrorPayload::from)?;
    let output_directory = jobs::validated_directory(&output_directory).map_err(ErrorPayload::from)?;
    let total = inputs.len();
    let mut steps = Vec::with_capacity(total);

    for (index, input) in inputs.into_iter().enumerate() {
        let path = std::path::Path::new(&input);
        if !path.exists() || !path.is_file() {
            return Err(ErrorPayload::from(SevenError::NotFound(input)));
        }
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp" | "rtf" | "txt" | "html" | "htm"
        ) {
            return Err(ErrorPayload::from(SevenError::UnsupportedFormat(extension)));
        }

        let canonical = fs::canonicalize(path)
            .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;
        let name = canonical.file_name().and_then(|value| value.to_str()).unwrap_or("arquivo").to_owned();
        let args = vec![
            "--headless".into(),
            "--convert-to".into(),
            "pdf".into(),
            "--outdir".into(),
            output_directory.to_string_lossy().into_owned(),
            canonical.to_string_lossy().into_owned(),
        ];
        steps.push(jobs::ProcessStep {
            program: executable.clone(),
            args,
            label: format!("Convertendo {} de {} · {name}", index + 1, total),
        });
    }

    Ok(jobs::start_process_sequence_job(
        app,
        &state,
        "batch-convert",
        steps,
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
pub fn list_pdf_files_in_folder(
    path: String,
    recursive: bool,
    limit: Option<usize>,
) -> CommandResult<Vec<String>> {
    let root = jobs::validated_directory(&path).map_err(ErrorPayload::from)?;
    let limit = limit.unwrap_or(500).clamp(1, 5000);
    let mut found = Vec::new();
    let mut pending = vec![root];

    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;

        for entry in entries {
            let entry = entry.map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
            let file_type = entry.file_type()
                .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;
            let entry_path = entry.path();

            if file_type.is_dir() {
                if recursive {
                    pending.push(entry_path);
                }
                continue;
            }

            if file_type.is_file()
                && entry_path.extension().and_then(|value| value.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
            {
                found.push(entry_path.to_string_lossy().into_owned());
                if found.len() >= limit {
                    found.sort_by_key(|value| value.to_lowercase());
                    return Ok(found);
                }
            }
        }
    }

    found.sort_by_key(|value| value.to_lowercase());
    Ok(found)
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
        let escaped = input.to_string_lossy().replace('\'', "''");
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
