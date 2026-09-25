use crate::{
    capabilities::bind_pdfium,
    error::SevenError,
    state::{AppState, OpenDocument},
};
use lopdf::{Document, Object};
use pdfium_render::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub path: String,
    pub name: String,
    pub page_count: usize,
    pub file_size: u64,
    pub pdf_version: Option<String>,
    pub encrypted: bool,
    pub has_signatures: bool,
    pub has_forms: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderResult {
    pub document_id: String,
    pub page_index: usize,
    pub width: u32,
    pub height: u32,
    pub cache_path: String,
    pub revision: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub page_index: usize,
    pub excerpt: String,
    pub occurrences: usize,
}

pub fn validate_pdf_path(path: &str) -> Result<PathBuf, SevenError> {
    let input = Path::new(path);
    if !input.exists() {
        return Err(SevenError::NotFound(path.to_owned()));
    }
    let canonical = fs::canonicalize(input).map_err(|error| SevenError::InvalidPath(error.to_string()))?;
    if !canonical.is_file() {
        return Err(SevenError::InvalidPath("O caminho não aponta para um arquivo".into()));
    }
    let extension = canonical.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if !extension.eq_ignore_ascii_case("pdf") {
        return Err(SevenError::UnsupportedFormat(extension.to_owned()));
    }
    Ok(canonical)
}

pub fn inspect(path: &Path, password: Option<String>) -> Result<OpenDocument, SevenError> {
    let metadata = fs::metadata(path).map_err(|error| SevenError::Io(error.to_string()))?;
    if metadata.len() > 16 * 1024 * 1024 * 1024 {
        return Err(SevenError::OperationRejected("PDF maior que 16 GiB exige modo de arquivo grande".into()));
    }

    let parsed = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_count = parsed.get_pages().len();
    let encrypted = parsed.is_encrypted();
    let pdf_version = Some(parsed.version.clone());

    let has_forms = parsed
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"AcroForm").ok())
        .is_some();

    let has_signatures = parsed.objects.values().any(|object| {
        let Ok(dictionary) = object.as_dict() else { return false };
        let Ok(field_type) = dictionary.get(b"FT") else { return false };
        matches!(field_type, Object::Name(name) if name.as_slice() == b"Sig")
    });

    let id = uuid::Uuid::new_v4().to_string();
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("Documento.pdf").to_owned();

    Ok(OpenDocument {
        id,
        path: path.to_path_buf(),
        name,
        password,
        page_count,
        file_size: metadata.len(),
        pdf_version,
        encrypted,
        has_signatures,
        has_forms,
        revision: 0,
    })
}

pub fn summary(document: &OpenDocument) -> DocumentSummary {
    DocumentSummary {
        id: document.id.clone(),
        path: document.path.to_string_lossy().into_owned(),
        name: document.name.clone(),
        page_count: document.page_count,
        file_size: document.file_size,
        pdf_version: document.pdf_version.clone(),
        encrypted: document.encrypted,
        has_signatures: document.has_signatures,
        has_forms: document.has_forms,
    }
}

fn render_cache_path(state: &AppState, document: &OpenDocument, page_index: usize, target_width: u16) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(document.path.to_string_lossy().as_bytes());
    hasher.update(document.revision.to_le_bytes());
    hasher.update(page_index.to_le_bytes());
    hasher.update(target_width.to_le_bytes());
    let key = hex::encode(hasher.finalize());
    state.cache_dir.join("render").join(format!("{key}.png"))
}

pub fn render_page(
    state: &AppState,
    document: &OpenDocument,
    page_index: usize,
    target_width: u16,
) -> Result<RenderResult, SevenError> {
    if page_index >= document.page_count {
        return Err(SevenError::OperationRejected(format!("Página {} não existe", page_index + 1)));
    }

    let cache_path = render_cache_path(state, document, page_index, target_width);
    if cache_path.exists() {
        let image = image::open(&cache_path).map_err(|error| SevenError::Render(error.to_string()))?;
        return Ok(RenderResult {
            document_id: document.id.clone(),
            page_index,
            width: image.width(),
            height: image.height(),
            cache_path: cache_path.to_string_lossy().into_owned(),
            revision: document.revision,
        });
    }

    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|error| SevenError::Io(error.to_string()))?;
    }

    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let pdf = pdfium
        .load_pdf_from_file(&document.path, document.password.as_deref())
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page = pdf.pages().get(page_index as PdfPageIndex)
        .map_err(|error| SevenError::Render(error.to_string()))?;

    let bitmap = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(i32::from(target_width))
                .set_maximum_height(14000)
                .render_form_data(true),
        )
        .map_err(|error| SevenError::Render(error.to_string()))?;

    let image = bitmap
        .as_image()
        .map_err(|error| SevenError::Render(error.to_string()))?;
    let width = image.width();
    let height = image.height();
    image.save(&cache_path).map_err(|error| SevenError::Render(error.to_string()))?;

    Ok(RenderResult {
        document_id: document.id.clone(),
        page_index,
        width,
        height,
        cache_path: cache_path.to_string_lossy().into_owned(),
        revision: document.revision,
    })
}

pub fn search_document(
    state: &AppState,
    document: &OpenDocument,
    query: &str,
) -> Result<Vec<SearchHit>, SevenError> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    if needle.chars().count() > 512 {
        return Err(SevenError::OperationRejected("Pesquisa excede 512 caracteres".into()));
    }

    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let pdf = pdfium
        .load_pdf_from_file(&document.path, document.password.as_deref())
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;

    let needle_lower = needle.to_lowercase();
    let mut hits = Vec::new();

    for (index, page) in pdf.pages().iter().enumerate() {
        let text = page.text().map_err(|error| SevenError::Operation(error.to_string()))?.all();
        let text_lower = text.to_lowercase();
        let occurrences = text_lower.matches(&needle_lower).count();
        if occurrences == 0 {
            continue;
        }
        let excerpt = text
            .chars()
            .take(260)
            .collect::<String>()
            .replace(['\r', '\n'], " ");
        hits.push(SearchHit { page_index: index, excerpt, occurrences });
    }

    Ok(hits)
}
