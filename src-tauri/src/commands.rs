use crate::{
    advanced,
    annotations,
    capabilities,
    catalog,
    error::{CommandResult, ErrorPayload, SevenError},
    jobs::{self, JobStart},
    forms,
    ocr,
    optimizer,
    document_ops,
    editing,
    pdf,
    print_production,
    redaction,
    search,
    session,
    shared_review,
    signatures,
    state::{AppState, JobStatus},
};
use serde::Serialize;
use std::{fs, process::Command, sync::atomic::Ordering};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioPreview {
    pub object_id: String,
    pub name: String,
    pub mime: String,
    pub kind: String,
    pub cache_path: String,
    pub text: Option<String>,
    pub size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSearchHit {
    pub object_id: String,
    pub name: String,
    pub mime: String,
    pub collection_path: String,
    pub excerpt: String,
    pub occurrences: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReviewImportResult {
    pub document: pdf::DocumentSummary,
    pub report: shared_review::ReviewTransferReport,
}

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
pub async fn build_catalog(
    state: State<'_, AppState>,
    name: String,
    inputs: Vec<String>,
) -> CommandResult<catalog::CatalogSummary> {
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || catalog::build_catalog(&snapshot, &name, inputs))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn list_catalogs(state: State<'_, AppState>) -> CommandResult<Vec<catalog::CatalogSummary>> {
    catalog::list_catalogs(&state).map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn search_catalog(
    state: State<'_, AppState>,
    id: String,
    query: String,
    match_case: bool,
) -> CommandResult<Vec<catalog::CatalogHit>> {
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || catalog::search_catalog(&snapshot, &id, &query, match_case))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn delete_catalog(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    catalog::delete_catalog(&state, &id).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn export_review_xfdf(
    input: String,
    destination: String,
) -> CommandResult<shared_review::ReviewTransferReport> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let destination = std::path::PathBuf::from(destination);
    let parent = destination.parent()
        .ok_or_else(|| ErrorPayload::from(SevenError::InvalidPath("Destino XFDF inválido".into())))?;
    fs::canonicalize(parent)
        .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;
    if destination.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase() != "xfdf" {
        return Err(ErrorPayload::from(SevenError::UnsupportedFormat(
            destination.extension().and_then(|value| value.to_str()).unwrap_or_default().into(),
        )));
    }
    shared_review::export_xfdf(&input, &destination).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_import_review_xfdf(
    state: State<'_, AppState>,
    document_id: String,
    xfdf: String,
) -> CommandResult<SessionReviewImportResult> {
    let path = std::path::PathBuf::from(xfdf);
    if !path.is_file() || path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase() != "xfdf" {
        return Err(ErrorPayload::from(SevenError::InvalidPath(
            "Selecione um arquivo XFDF válido".into(),
        )));
    }
    let (document, report) = session::apply_revision(
        &state,
        &document_id,
        "import-review",
        |input, output| shared_review::import_xfdf(input, output, &path),
    ).map_err(ErrorPayload::from)?;
    Ok(SessionReviewImportResult { document, report })
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalFileStatus {
    pub exists: bool,
    pub changed: bool,
    pub file_size: Option<u64>,
    pub modified_ns: Option<String>,
}

#[tauri::command]
pub async fn session_transfer_pages(
    state: State<'_, AppState>,
    source_document_id: String,
    target_document_id: String,
    page_range: String,
    insert_after: usize,
    move_pages: bool,
) -> CommandResult<page_transfer::PageTransferResult> {
    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        page_transfer::transfer_pages(
            &snapshot,
            &source_document_id,
            &target_document_id,
            &page_range,
            insert_after,
            move_pages,
        )
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn get_external_file_status(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<ExternalFileStatus> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    match fs::metadata(&document.path) {
        Ok(metadata) => {
            let modified = pdf::modified_ns(&metadata);
            Ok(ExternalFileStatus {
                exists: true,
                changed: metadata.len() != document.source_file_size
                    || modified != document.source_modified_ns,
                file_size: Some(metadata.len()),
                modified_ns: Some(modified.to_string()),
            })
        }
        Err(_) => Ok(ExternalFileStatus {
            exists: false,
            changed: true,
            file_size: None,
            modified_ns: None,
        }),
    }
}

#[tauri::command]
pub async fn reload_document_from_source(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    let snapshot = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    if snapshot.is_dirty() {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Há alterações locais não salvas. Salve como uma cópia ou descarte as alterações antes de recarregar.".into(),
        )));
    }

    let path = snapshot.path.clone();
    let password = snapshot.password.clone();
    let mut refreshed = tauri::async_runtime::spawn_blocking(move || pdf::inspect(&path, password))
        .await
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
        .map_err(ErrorPayload::from)?;

    refreshed.id = snapshot.id.clone();
    refreshed.revision = snapshot.revision.saturating_add(1);
    let summary = pdf::summary(&refreshed);
    state.documents.lock().insert(document_id, refreshed);
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
pub async fn render_pages(
    state: State<'_, AppState>,
    document_id: String,
    page_indices: Vec<usize>,
    target_width: u16,
) -> CommandResult<Vec<pdf::RenderResult>> {
    if page_indices.is_empty() || page_indices.len() > 12 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "A janela de renderização deve conter entre 1 e 12 páginas".into(),
        )));
    }
    if !(320..=6000).contains(&target_width) {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Largura de renderização fora do intervalo permitido".into(),
        )));
    }
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    if page_indices.iter().any(|page| *page >= document.page_count) {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "A janela contém uma página inexistente".into(),
        )));
    }

    let snapshot = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::with_capacity(page_indices.len());
        for page_index in page_indices {
            results.push(pdf::render_page(&snapshot, &document, page_index, target_width)?);
        }
        Ok::<_, SevenError>(results)
    })
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
pub fn get_image_dimensions(path: String) -> CommandResult<[u32; 2]> {
    let input = std::path::PathBuf::from(&path);
    if !input.is_file() {
        return Err(ErrorPayload::from(SevenError::NotFound(path)));
    }
    let extension = input.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "tif" | "tiff" | "bmp" | "webp") {
        return Err(ErrorPayload::from(SevenError::UnsupportedFormat(extension)));
    }
    let (width, height) = image::image_dimensions(&input)
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?;
    Ok([width, height])
}

#[tauri::command]
pub fn list_page_image_objects(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
) -> CommandResult<Vec<editing::ImageObjectInfo>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    editing::list_image_objects(document.active_path(), page_index).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_replace_image_object(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    resource_name: String,
    image_path: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "replace-image", move |input, output| {
        editing::replace_image_object(input, output, page_index, &resource_name, &image_path)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_remove_image_object(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    resource_name: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "remove-image", move |input, output| {
        editing::remove_image_object(input, output, page_index, &resource_name)
    })
    .map(|(summary, _)| summary)
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
pub fn list_pdf_named_destinations(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<editing::NamedDestinationInfo>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    editing::list_named_destinations(document.active_path()).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_upsert_pdf_named_destination(
    state: State<'_, AppState>,
    document_id: String,
    old_name: Option<String>,
    name: String,
    page_index: usize,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "named-destination", move |input, output| {
        editing::upsert_named_destination(input, output, old_name.as_deref(), &name, page_index)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_remove_pdf_named_destination(
    state: State<'_, AppState>,
    document_id: String,
    name: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "remove-named-destination", move |input, output| {
        editing::remove_named_destination(input, output, &name)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn list_pdf_links(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<editing::LinkInfo>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    editing::list_links(document.active_path()).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_update_link(
    state: State<'_, AppState>,
    document_id: String,
    update: editing::LinkUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "update-link", move |input, output| {
        editing::update_link(input, output, update)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_remove_link(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    object_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "remove-link", move |input, output| {
        editing::remove_link(input, output, page_index, &object_id)
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
pub fn list_managed_pdf_elements(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<editing::ManagedElementInfo>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    editing::list_managed_elements(document.active_path()).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_update_overlay_text(
    state: State<'_, AppState>,
    document_id: String,
    element_id: String,
    options: editing::OverlayTextOptions,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "update-overlay", move |input, output| {
        editing::update_overlay_text(input, output, &element_id, options)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_update_background(
    state: State<'_, AppState>,
    document_id: String,
    element_id: String,
    options: editing::BackgroundOptions,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "update-background", move |input, output| {
        editing::update_background(input, output, &element_id, options)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_edit_remove_managed_element(
    state: State<'_, AppState>,
    document_id: String,
    element_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "remove-managed-element", move |input, output| {
        editing::remove_managed_element(input, output, &element_id)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_page_labels(
    state: State<'_, AppState>,
    document_id: String,
    options: editing::PageLabelOptions,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "page-labels", move |input, output| {
        editing::set_page_labels(input, output, options)
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
pub fn list_form_field_actions(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<Vec<forms::FieldActionInfo>> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    forms::list_field_actions(document.active_path()).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_form_field_action(
    state: State<'_, AppState>,
    document_id: String,
    request: forms::FieldActionInput,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "field-action", move |input, output| {
        forms::set_field_action(input, output, request)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_delete_form_field_action(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    trigger: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "delete-field-action", move |input, output| {
        forms::delete_field_action(input, output, &object_id, &trigger)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_duplicate_form_field(
    state: State<'_, AppState>,
    document_id: String,
    request: forms::DuplicateFieldRequest,
) -> CommandResult<SessionFormFillResult> {
    session::apply_revision(&state, &document_id, "duplicate-field", move |input, output| {
        forms::duplicate_field(input, output, request)
    })
    .map(|(document, changed)| SessionFormFillResult { document, changed })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_page_tab_order(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    order: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "tab-order", move |input, output| {
        forms::set_page_tab_order(input, output, page_index, &order)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn export_form_data(
    input: String,
    destination: String,
) -> CommandResult<usize> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let destination = std::path::PathBuf::from(destination);
    let parent = destination.parent()
        .ok_or_else(|| ErrorPayload::from(SevenError::InvalidPath("Destino inválido".into())))?;
    fs::canonicalize(parent)
        .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?;
    forms::export_form_data(&input, &destination).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_import_form_data(
    state: State<'_, AppState>,
    document_id: String,
    data_path: String,
) -> CommandResult<SessionFormFillResult> {
    let data = std::path::PathBuf::from(&data_path);
    if !data.is_file() {
        return Err(ErrorPayload::from(SevenError::NotFound(data_path)));
    }
    session::apply_revision(&state, &document_id, "import-form-data", move |input, output| {
        forms::import_form_data(input, output, &data)
    })
    .map(|(document, changed)| SessionFormFillResult { document, changed })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_reset_form(
    state: State<'_, AppState>,
    document_id: String,
    use_defaults: bool,
) -> CommandResult<SessionFormFillResult> {
    session::apply_revision(&state, &document_id, if use_defaults { "reset-form" } else { "clear-form" }, move |input, output| {
        forms::reset_form(input, output, use_defaults)
    })
    .map(|(document, changed)| SessionFormFillResult { document, changed })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_update_form_field(
    state: State<'_, AppState>,
    document_id: String,
    update: forms::FormFieldUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "update-field", move |input, output| {
        forms::update_field(input, output, update)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_delete_form_field(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "delete-field", move |input, output| {
        forms::delete_field(input, output, &object_id)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedBookmarksResult {
    pub document: pdf::DocumentSummary,
    pub created: usize,
}

#[tauri::command]
pub fn session_update_pdf_bookmark(
    state: State<'_, AppState>,
    document_id: String,
    update: advanced::BookmarkUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "update-bookmark", move |input, output| {
        advanced::update_bookmark(input, output, update)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_all_pdf_bookmarks_open(
    state: State<'_, AppState>,
    document_id: String,
    open: bool,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "bookmark-tree-state", move |input, output| {
        advanced::set_all_bookmarks_open(input, output, open)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_generate_pdf_bookmarks_from_structure(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<GeneratedBookmarksResult> {
    session::apply_revision(&state, &document_id, "generate-bookmarks", move |input, output| {
        advanced::generate_bookmarks_from_structure(input, output)
    })
    .map(|(document, created)| GeneratedBookmarksResult { document, created })
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
pub fn session_delete_pdf_bookmark(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "delete-bookmark", move |input, output| {
        advanced::delete_bookmark(input, output, &object_id)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_move_pdf_bookmark(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    direction: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "move-bookmark", move |input, output| {
        advanced::move_bookmark(input, output, &object_id, &direction)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_pdf_bookmark_open(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    open: bool,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "bookmark-open", move |input, output| {
        advanced::set_bookmark_open(input, output, &object_id, open)
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
pub fn session_update_pdf_attachment(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    name: String,
    description: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "update-attachment", move |input, output| {
        advanced::update_attachment(input, output, &object_id, &name, &description)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_remove_pdf_attachment(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "remove-attachment", move |input, output| {
        advanced::remove_attachment(input, output, &object_id)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFlattenLayersResult {
    pub document: pdf::DocumentSummary,
    pub changed_pages: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPortfolioFolderResult {
    pub document: pdf::DocumentSummary,
    pub changed: usize,
}

fn portfolio_preview_kind(name: &str, mime: &str) -> &'static str {
    let extension = std::path::Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == "pdf" || mime == "application/pdf" {
        "pdf"
    } else if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tif" | "tiff")
        || mime.starts_with("image/")
    {
        "image"
    } else if matches!(extension.as_str(), "txt" | "csv" | "json" | "xml" | "html" | "htm" | "md")
        || mime.starts_with("text/")
        || matches!(mime, "application/json" | "application/xml")
    {
        "text"
    } else {
        "file"
    }
}

fn safe_portfolio_cache_name(name: &str) -> String {
    let file_name = std::path::Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("component.bin");
    let sanitized = file_name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' ') { ch } else { '_' })
        .collect::<String>();
    if sanitized.trim().is_empty() { "component.bin".into() } else { sanitized }
}

fn materialize_portfolio_payload(
    document_path: &std::path::Path,
    cache_root: &std::path::Path,
    document_id: &str,
    object_id: &str,
) -> Result<PortfolioPreview, SevenError> {
    let (info, data) = advanced::read_attachment_payload(document_path, object_id)?;
    if advanced::attachment_is_dangerous(&info.name) {
        return Err(SevenError::OperationRejected(
            "Este tipo de componente é bloqueado para preview e abertura".into(),
        ));
    }
    if data.len() > 512 * 1024 * 1024 {
        return Err(SevenError::OperationRejected(
            "Componente excede o limite de 512 MiB para materialização".into(),
        ));
    }

    let folder = cache_root.join("portfolio").join(document_id);
    fs::create_dir_all(&folder).map_err(|error| SevenError::Io(error.to_string()))?;
    let cache_path = folder.join(format!(
        "{}-{}",
        object_id.replace(':', "-"),
        safe_portfolio_cache_name(&info.name),
    ));
    fs::write(&cache_path, &data).map_err(|error| SevenError::Io(error.to_string()))?;
    let kind = portfolio_preview_kind(&info.name, &info.mime).to_owned();
    let text = if kind == "text" {
        let preview = &data[..data.len().min(2 * 1024 * 1024)];
        Some(String::from_utf8_lossy(preview).chars().take(200_000).collect())
    } else {
        None
    };

    Ok(PortfolioPreview {
        object_id: object_id.to_owned(),
        name: info.name,
        mime: info.mime,
        kind,
        cache_path: cache_path.to_string_lossy().into_owned(),
        text,
        size: data.len(),
    })
}

#[tauri::command]
pub async fn materialize_pdf_portfolio_item(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
) -> CommandResult<PortfolioPreview> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let cache_root = state.cache_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        materialize_portfolio_payload(
            document.active_path(),
            &cache_root,
            &document_id,
            &object_id,
        )
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub async fn open_pdf_portfolio_item_external(
    app: AppHandle,
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
) -> CommandResult<()> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let cache_root = state.cache_dir.clone();
    let preview = tauri::async_runtime::spawn_blocking(move || {
        materialize_portfolio_payload(
            document.active_path(),
            &cache_root,
            &document_id,
            &object_id,
        )
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)?;

    app.opener()
        .open_path(&preview.cache_path, None::<&str>)
        .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?;
    Ok(())
}

#[tauri::command]
pub async fn search_pdf_portfolio_items(
    state: State<'_, AppState>,
    document_id: String,
    query: String,
) -> CommandResult<Vec<PortfolioSearchHit>> {
    let query = query.trim().to_owned();
    if query.is_empty() || query.chars().count() > 512 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "A pesquisa deve conter entre 1 e 512 caracteres".into(),
        )));
    }
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    let cache_root = state.cache_dir.clone();
    let resource_dir = state.resource_dir.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let attachments = advanced::list_attachments(document.active_path())?;
        let needle = query.to_lowercase();
        let pdfium = capabilities::bind_pdfium(&resource_dir)
            .map_err(SevenError::PdfEngineUnavailable)?;
        let mut hits = Vec::new();

        for attachment in attachments {
            if advanced::attachment_is_dangerous(&attachment.name) {
                continue;
            }
            let kind = portfolio_preview_kind(&attachment.name, &attachment.mime);
            if !matches!(kind, "pdf" | "text") {
                continue;
            }
            let preview = match materialize_portfolio_payload(
                document.active_path(),
                &cache_root,
                &document_id,
                &attachment.object_id,
            ) {
                Ok(value) => value,
                Err(_) => continue,
            };

            let haystack = if kind == "text" {
                preview.text.unwrap_or_default()
            } else {
                let pdf = match pdfium.load_pdf_from_file(&preview.cache_path, None) {
                    Ok(pdf) => pdf,
                    Err(_) => continue,
                };
                let mut text = String::new();
                for page in pdf.pages().iter().take(2000) {
                    if text.len() >= 2_000_000 {
                        break;
                    }
                    if let Ok(page_text) = page.text() {
                        text.push_str(&page_text.all());
                        text.push('\n');
                    }
                }
                text
            };

            let lower = haystack.to_lowercase();
            let occurrences = lower.matches(&needle).count();
            if occurrences == 0 {
                continue;
            }
            let first = lower.find(&needle).unwrap_or(0);
            let start = lower[..first].chars().count().saturating_sub(120);
            let excerpt = haystack
                .chars()
                .skip(start)
                .take(360)
                .collect::<String>()
                .replace(['\r', '\n'], " ");

            hits.push(PortfolioSearchHit {
                object_id: attachment.object_id,
                name: attachment.name,
                mime: attachment.mime,
                collection_path: attachment.collection_path,
                excerpt,
                occurrences,
            });
        }

        Ok::<_, SevenError>(hits)
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_add_pdf_portfolio_item(
    state: State<'_, AppState>,
    document_id: String,
    file_path: String,
    display_name: String,
    description: String,
    folder_path: String,
) -> CommandResult<pdf::DocumentSummary> {
    let file_path = std::path::PathBuf::from(file_path);
    session::apply_revision(&state, &document_id, "portfolio-add-item", move |input, output| {
        advanced::add_attachment_to_portfolio_folder(
            input,
            output,
            &file_path,
            &display_name,
            &description,
            &folder_path,
        )
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_configure_pdf_portfolio(
    state: State<'_, AppState>,
    document_id: String,
    view: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "configure-portfolio", move |input, output| {
        advanced::configure_portfolio(input, output, &view)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_pdf_portfolio_view(
    state: State<'_, AppState>,
    document_id: String,
    view: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "portfolio-view", move |input, output| {
        advanced::set_portfolio_view(input, output, &view)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_create_pdf_portfolio_folder(
    state: State<'_, AppState>,
    document_id: String,
    path: String,
    description: String,
) -> CommandResult<SessionPortfolioFolderResult> {
    session::apply_revision(&state, &document_id, "portfolio-folder", move |input, output| {
        advanced::create_portfolio_folder(input, output, &path, &description)
    })
    .map(|(document, changed)| SessionPortfolioFolderResult { document, changed })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_move_pdf_portfolio_item(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    folder_path: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "portfolio-move-item", move |input, output| {
        advanced::move_attachment_to_portfolio_folder(input, output, &object_id, &folder_path)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_rename_pdf_portfolio_folder(
    state: State<'_, AppState>,
    document_id: String,
    folder_id: String,
    new_name: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "portfolio-rename-folder", move |input, output| {
        advanced::rename_portfolio_folder(input, output, &folder_id, &new_name)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_remove_pdf_portfolio_folder(
    state: State<'_, AppState>,
    document_id: String,
    folder_id: String,
) -> CommandResult<SessionPortfolioFolderResult> {
    session::apply_revision(&state, &document_id, "portfolio-remove-folder", move |input, output| {
        advanced::remove_portfolio_folder(input, output, &folder_id)
    })
    .map(|(document, changed)| SessionPortfolioFolderResult { document, changed })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_import_image_as_pdf_layer(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
    image_path: String,
    name: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
    locked: bool,
) -> CommandResult<pdf::DocumentSummary> {
    let image_path = std::path::PathBuf::from(image_path);
    session::apply_revision(&state, &document_id, "import-layer", move |input, output| {
        advanced::import_image_as_layer(
            input, output, page_index, &image_path, &name, x, y, width, height, visible, locked,
        )
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_reorder_pdf_layer(
    state: State<'_, AppState>,
    document_id: String,
    object_id: String,
    direction: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "reorder-layer", move |input, output| {
        advanced::reorder_layer(input, output, &object_id, &direction)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_merge_pdf_layers(
    state: State<'_, AppState>,
    document_id: String,
    source_id: String,
    target_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "merge-layers", move |input, output| {
        advanced::merge_layers(input, output, &source_id, &target_id)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_flatten_pdf_layers(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<SessionFlattenLayersResult> {
    session::apply_revision(&state, &document_id, "flatten-layers", move |input, output| {
        advanced::flatten_layers(input, output)
    })
    .map(|(document, changed_pages)| SessionFlattenLayersResult { document, changed_pages })
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_apply_pdf_layer_overrides(
    state: State<'_, AppState>,
    document_id: String,
    context: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "layer-overrides", move |input, output| {
        advanced::apply_layer_usage_overrides(input, output, &context)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_reset_pdf_layer_visibility(
    state: State<'_, AppState>,
    document_id: String,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "layer-reset", move |input, output| {
        advanced::reset_layer_visibility_to_base(input, output)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_update_pdf_layer_properties(
    state: State<'_, AppState>,
    document_id: String,
    update: advanced::LayerPropertiesUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "layer-properties", move |input, output| {
        advanced::update_layer_properties(input, output, update)
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
    let base = canonical[0].clone();

    let mut offsets = Vec::new();
    let mut page_offset = lopdf::Document::load(&base)
        .map_err(|error| ErrorPayload::from(SevenError::PdfOpen(error.to_string())))?
        .get_pages()
        .len();
    for source in canonical.iter().skip(1) {
        offsets.push((source.clone(), page_offset));
        page_offset += lopdf::Document::load(source)
            .map_err(|error| ErrorPayload::from(SevenError::PdfOpen(error.to_string())))?
            .get_pages()
            .len();
    }

    // Keep the first PDF as qpdf's primary document so document-level
    // metadata, outlines, names, page labels and other global structures
    // are preserved whenever qpdf can preserve them.
    let mut args = vec![
        base.to_string_lossy().into_owned(),
        "--pages".into(),
        ".".into(),
        "1-z".into(),
    ];
    for input in canonical.iter().skip(1) {
        args.push(input.to_string_lossy().into_owned());
        args.push("1-z".into());
    }
    args.push("--".into());
    args.push(output.to_string_lossy().into_owned());

    let post_output = output.clone();
    Ok(jobs::start_process_job_with_postprocess(
        app,
        &state,
        "combine",
        executable,
        args,
        Some(output),
        "Mesclando árvores de marcadores",
        move || {
            advanced::append_bookmarks_from_sources(&post_output, &offsets)?;
            Ok(())
        },
    ))
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

fn start_insert_pdf_source_job(
    app: AppHandle,
    state: &AppState,
    input: std::path::PathBuf,
    output: std::path::PathBuf,
    source: std::path::PathBuf,
    insert_after: usize,
    kind: &str,
) -> Result<JobStart, SevenError> {
    let executable = jobs::require_executable(&["qpdf"], "qpdf")?;
    let page_count = lopdf::Document::load(&input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?
        .get_pages()
        .len();
    if insert_after > page_count {
        return Err(SevenError::OperationRejected(format!(
            "A posição de inserção deve ficar entre 0 e {page_count}"
        )));
    }

    let mut args = vec![input.to_string_lossy().into_owned(), "--pages".into()];
    if insert_after > 0 {
        args.push(".".into());
        args.push(format!("1-{insert_after}"));
    }
    args.push(source.to_string_lossy().into_owned());
    args.push("1-z".into());
    if insert_after < page_count {
        args.push(".".into());
        args.push(format!("{}-z", insert_after + 1));
    }
    args.push("--".into());
    args.push(output.to_string_lossy().into_owned());

    Ok(jobs::start_process_job(
        app,
        state,
        kind,
        executable,
        args,
        Some(output),
    ))
}

fn transient_pdf(state: &AppState, prefix: &str) -> Result<std::path::PathBuf, SevenError> {
    let directory = state.cache_dir.join("jobs");
    fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(directory.join(format!("{prefix}-{}.pdf", uuid::Uuid::new_v4())))
}

#[tauri::command]
pub fn start_insert_blank_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    page_size: String,
    page_count: u16,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source = transient_pdf(&state, "blank-pages").map_err(ErrorPayload::from)?;
    pdf::create_blank_pdf(&source, &page_size, page_count).map_err(ErrorPayload::from)?;
    start_insert_pdf_source_job(app, &state, input, output, source, insert_after, "insert-blank-pages")
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_insert_image_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    images: Vec<String>,
    dpi: u16,
) -> CommandResult<JobStart> {
    if images.is_empty() || images.len() > 500 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Selecione entre 1 e 500 imagens".into(),
        )));
    }
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let mut paths = Vec::with_capacity(images.len());
    for image in images {
        let path = std::path::Path::new(&image);
        if !path.is_file() {
            return Err(ErrorPayload::from(SevenError::NotFound(image)));
        }
        paths.push(fs::canonicalize(path)
            .map_err(|error| ErrorPayload::from(SevenError::InvalidPath(error.to_string())))?);
    }
    let source = transient_pdf(&state, "image-pages").map_err(ErrorPayload::from)?;
    pdf::create_pdf_from_images(&paths, &source, dpi).map_err(ErrorPayload::from)?;
    start_insert_pdf_source_job(app, &state, input, output, source, insert_after, "insert-image-pages")
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_insert_text_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    text: String,
    page_size: String,
    font_size: u16,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source = transient_pdf(&state, "text-pages").map_err(ErrorPayload::from)?;
    pdf::create_pdf_from_text(&source, &text, &page_size, font_size).map_err(ErrorPayload::from)?;
    start_insert_pdf_source_job(app, &state, input, output, source, insert_after, "insert-text-pages")
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_insert_clipboard_image_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    dpi: u16,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source = transient_pdf(&state, "clipboard-pages").map_err(ErrorPayload::from)?;
    pdf::create_pdf_from_rgba(&source, rgba, width, height, dpi).map_err(ErrorPayload::from)?;
    start_insert_pdf_source_job(app, &state, input, output, source, insert_after, "insert-clipboard-pages")
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_insert_web_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    url: String,
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
    let qpdf = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source = transient_pdf(&state, "web-pages").map_err(ErrorPayload::from)?;

    let page_count = lopdf::Document::load(&input)
        .map_err(|error| ErrorPayload::from(SevenError::PdfOpen(error.to_string())))?
        .get_pages()
        .len();
    if insert_after > page_count {
        return Err(ErrorPayload::from(SevenError::OperationRejected(format!(
            "A posição de inserção deve ficar entre 0 e {page_count}"
        ))));
    }

    let browser_args = vec![
        "--headless=new".into(),
        "--disable-gpu".into(),
        "--disable-extensions".into(),
        "--incognito".into(),
        "--no-pdf-header-footer".into(),
        format!("--print-to-pdf={}", source.to_string_lossy()),
        trimmed.to_owned(),
    ];

    let mut qpdf_args = vec![input.to_string_lossy().into_owned(), "--pages".into()];
    if insert_after > 0 {
        qpdf_args.push(".".into());
        qpdf_args.push(format!("1-{insert_after}"));
    }
    qpdf_args.push(source.to_string_lossy().into_owned());
    qpdf_args.push("1-z".into());
    if insert_after < page_count {
        qpdf_args.push(".".into());
        qpdf_args.push(format!("{}-z", insert_after + 1));
    }
    qpdf_args.push("--".into());
    qpdf_args.push(output.to_string_lossy().into_owned());

    Ok(jobs::start_process_sequence_job(
        app,
        &state,
        "insert-web-pages",
        vec![
            jobs::ProcessStep {
                program: browser,
                args: browser_args,
                label: "Capturando página web".into(),
            },
            jobs::ProcessStep {
                program: qpdf,
                args: qpdf_args,
                label: "Inserindo páginas capturadas".into(),
            },
        ],
        Some(output),
    ))
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn start_insert_scanned_page(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    dpi: u16,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source = transient_pdf(&state, "scan-pages").map_err(ErrorPayload::from)?;
    let dpi = dpi.clamp(75, 1200);
    let scan_target = source.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<(), SevenError> {
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
        let temp = scan_target.with_extension("seven-insert-scan.png");
        fs::write(&temp, scan.stdout).map_err(|error| SevenError::Io(error.to_string()))?;
        let result = pdf::create_pdf_from_images(&[temp.clone()], &scan_target, dpi);
        let _ = fs::remove_file(temp);
        result
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)?;

    start_insert_pdf_source_job(app, &state, input, output, source, insert_after, "insert-scanned-page")
        .map_err(ErrorPayload::from)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn start_insert_scanned_page(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    insert_after: usize,
    dpi: u16,
) -> CommandResult<JobStart> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let source = transient_pdf(&state, "scan-pages").map_err(ErrorPayload::from)?;
    let dpi = dpi.clamp(75, 1200);
    let scan_target = source.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<(), SevenError> {
        let powershell = jobs::require_executable(&["powershell"], "Windows PowerShell/WIA")?;
        let temp = scan_target.with_extension("seven-insert-wia.png");
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
        let created = pdf::create_pdf_from_images(&[temp.clone()], &scan_target, dpi);
        let _ = fs::remove_file(&temp);
        created
    })
    .await
    .map_err(|error| ErrorPayload::from(SevenError::Operation(error.to_string())))?
    .map_err(ErrorPayload::from)?;

    start_insert_pdf_source_job(app, &state, input, output, source, insert_after, "insert-scanned-page")
        .map_err(ErrorPayload::from)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
#[tauri::command]
pub async fn start_insert_scanned_page(
    _app: AppHandle,
    _state: State<'_, AppState>,
    _input: String,
    _output: String,
    _insert_after: usize,
    _dpi: u16,
) -> CommandResult<JobStart> {
    Err(ErrorPayload::from(SevenError::CapabilityUnavailable(
        "Scanner nativo ainda não disponível neste sistema operacional".into(),
    )))
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
pub fn start_batch_optimize_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    inputs: Vec<String>,
    output_directory: String,
    preset: Option<String>,
) -> CommandResult<JobStart> {
    if inputs.is_empty() || inputs.len() > 200 {
        return Err(ErrorPayload::from(SevenError::OperationRejected(
            "Selecione entre 1 e 200 PDFs para otimização em lote".into(),
        )));
    }

    let executable = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript")
        .map_err(ErrorPayload::from)?;
    let output_directory = jobs::validated_directory(&output_directory).map_err(ErrorPayload::from)?;
    let setting = match preset.as_deref() {
        Some("screen") => "/screen",
        Some("ebook") => "/ebook",
        Some("printer") => "/printer",
        Some("prepress") => "/prepress",
        _ => "/default",
    };
    let total = inputs.len();
    let mut steps = Vec::with_capacity(total);

    for (index, input) in inputs.into_iter().enumerate() {
        let canonical = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
        let stem = canonical.file_stem().and_then(|value| value.to_str()).unwrap_or("documento");
        let mut output = output_directory.join(format!("{stem}-otimizado.pdf"));
        let mut suffix = 2usize;
        while output.exists() {
            output = output_directory.join(format!("{stem}-otimizado-{suffix}.pdf"));
            suffix += 1;
        }
        let name = canonical.file_name().and_then(|value| value.to_str()).unwrap_or("documento.pdf");
        let args = vec![
            "-sDEVICE=pdfwrite".into(),
            "-dCompatibilityLevel=1.7".into(),
            format!("-dPDFSETTINGS={setting}"),
            "-dNOPAUSE".into(),
            "-dQUIET".into(),
            "-dBATCH".into(),
            format!("-sOutputFile={}", output.to_string_lossy()),
            canonical.to_string_lossy().into_owned(),
        ];
        steps.push(jobs::ProcessStep {
            program: executable.clone(),
            args,
            label: format!("Otimizando {} de {} · {name}", index + 1, total),
        });
    }

    Ok(jobs::start_process_sequence_job(
        app,
        &state,
        "batch-optimize",
        steps,
        Some(output_directory),
    ))
}

#[tauri::command]
pub fn get_optimization_audit(input: String) -> CommandResult<optimizer::OptimizationAudit> {
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    optimizer::audit(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn start_optimize_pdf_advanced(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    output: String,
    options: optimizer::OptimizeOptions,
) -> CommandResult<JobStart> {
    options.validate().map_err(ErrorPayload::from)?;
    let ghostscript = jobs::require_executable(&["gswin64c", "gswin32c", "gs"], "Ghostscript")
        .map_err(ErrorPayload::from)?;
    let input = pdf::validate_pdf_path(&input).map_err(ErrorPayload::from)?;
    let output = jobs::validated_output(&output, "pdf").map_err(ErrorPayload::from)?;
    let jobs_dir = state.cache_dir.join("jobs");
    fs::create_dir_all(&jobs_dir)
        .map_err(|error| ErrorPayload::from(SevenError::Io(error.to_string())))?;

    let has_discard = options.remove_javascript
        || options.remove_open_actions
        || options.remove_embedded_files
        || options.remove_metadata
        || options.remove_xfa
        || options.remove_annotations
        || options.remove_forms
        || options.remove_multimedia;

    let effective_input = if has_discard {
        let sanitized = jobs_dir.join(format!("sanitize-{}.pdf", uuid::Uuid::new_v4()));
        document_ops::sanitize_document(
            &input,
            &sanitized,
            document_ops::SanitizeOptions {
                remove_javascript: options.remove_javascript,
                remove_open_actions: options.remove_open_actions,
                remove_embedded_files: options.remove_embedded_files,
                remove_metadata: options.remove_metadata,
                remove_xfa: options.remove_xfa,
                remove_annotations: options.remove_annotations,
                remove_forms: options.remove_forms,
                remove_multimedia: options.remove_multimedia,
            },
        )
        .map_err(ErrorPayload::from)?;
        sanitized
    } else {
        input
    };

    let needs_qpdf = options.cleanup || options.linearize;
    if needs_qpdf {
        let qpdf = jobs::require_executable(&["qpdf"], "qpdf").map_err(ErrorPayload::from)?;
        let intermediate = jobs_dir.join(format!("optimize-{}.pdf", uuid::Uuid::new_v4()));
        let gs_args = options
            .ghostscript_args(&effective_input, &intermediate)
            .map_err(ErrorPayload::from)?;

        let mut qpdf_args = vec![
            "--stream-data=compress".into(),
            "--recompress-flate".into(),
            "--compression-level=9".into(),
            "--object-streams=generate".into(),
        ];
        if options.linearize {
            qpdf_args.push("--linearize".into());
        }
        qpdf_args.push(intermediate.to_string_lossy().into_owned());
        qpdf_args.push(output.to_string_lossy().into_owned());

        Ok(jobs::start_process_sequence_job(
            app,
            &state,
            "optimize-advanced",
            vec![
                jobs::ProcessStep {
                    program: ghostscript,
                    args: gs_args,
                    label: if has_discard {
                        "Compactando PDF sanitizado".into()
                    } else {
                        "Compactando e regravando PDF".into()
                    },
                },
                jobs::ProcessStep {
                    program: qpdf,
                    args: qpdf_args,
                    label: if options.linearize {
                        "Clean Up e Fast Web View".into()
                    } else {
                        "Clean Up estrutural".into()
                    },
                },
            ],
            Some(output),
        ))
    } else {
        let args = options
            .ghostscript_args(&effective_input, &output)
            .map_err(ErrorPayload::from)?;
        Ok(jobs::start_process_job(
            app,
            &state,
            "optimize-advanced",
            ghostscript,
            args,
            Some(output),
        ))
    }
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
pub fn get_page_preflight(
    state: State<'_, AppState>,
    document_id: String,
    page_index: usize,
) -> CommandResult<print_production::PagePreflight> {
    let document = state
        .documents
        .lock()
        .get(&document_id)
        .cloned()
        .ok_or_else(|| ErrorPayload::from(SevenError::DocumentNotOpen))?;
    print_production::page_preflight(document.active_path(), page_index).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn get_print_preflight(path: String) -> CommandResult<print_production::PrintPreflightReport> {
    let input = pdf::validate_pdf_path(&path).map_err(ErrorPayload::from)?;
    print_production::preflight(&input).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_page_geometry(
    state: State<'_, AppState>,
    document_id: String,
    update: print_production::PageGeometryUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "page-geometry", move |input, output| {
        print_production::set_page_geometry(input, output, update)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn session_set_page_boxes(
    state: State<'_, AppState>,
    document_id: String,
    update: print_production::PageBoxUpdate,
) -> CommandResult<pdf::DocumentSummary> {
    session::apply_revision(&state, &document_id, "page-boxes", move |input, output| {
        print_production::set_page_boxes(input, output, update)
    })
    .map(|(summary, _)| summary)
    .map_err(ErrorPayload::from)
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
