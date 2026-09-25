use crate::{
    capabilities::bind_pdfium,
    document_ops,
    error::SevenError,
    pdf,
    state::AppState,
};
use pdfium_render::prelude::PdfPageIndex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPage {
    pub page_index: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogDocument {
    pub path: String,
    pub name: String,
    pub title: String,
    pub author: String,
    pub page_count: usize,
    pub pages: Vec<CatalogPage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogIndex {
    pub id: String,
    pub name: String,
    pub created_at_unix: u64,
    pub documents: Vec<CatalogDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSummary {
    pub id: String,
    pub name: String,
    pub created_at_unix: u64,
    pub document_count: usize,
    pub page_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogHit {
    pub catalog_id: String,
    pub document_path: String,
    pub document_name: String,
    pub page_index: usize,
    pub excerpt: String,
    pub occurrences: usize,
}

fn catalogs_dir(state: &AppState) -> PathBuf {
    state.cache_dir.join("catalogs")
}

fn safe_name(value: &str) -> Result<String, SevenError> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(SevenError::OperationRejected(
            "Nome do catálogo deve ter entre 1 e 120 caracteres".into(),
        ));
    }
    Ok(name.to_owned())
}

fn catalog_path(state: &AppState, id: &str) -> Result<PathBuf, SevenError> {
    if id.len() != 64 || !id.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(SevenError::OperationRejected("ID de catálogo inválido".into()));
    }
    Ok(catalogs_dir(state).join(format!("{id}.json")))
}

pub fn build_catalog(
    state: &AppState,
    name: &str,
    inputs: Vec<String>,
) -> Result<CatalogSummary, SevenError> {
    let name = safe_name(name)?;
    if inputs.is_empty() || inputs.len() > 500 {
        return Err(SevenError::OperationRejected(
            "Selecione entre 1 e 500 PDFs para indexar".into(),
        ));
    }

    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let mut documents = Vec::with_capacity(inputs.len());
    let mut hash = Sha256::new();
    hash.update(name.as_bytes());

    for input in inputs {
        let path = pdf::validate_pdf_path(&input)?;
        hash.update(path.to_string_lossy().as_bytes());

        let loaded = pdfium
            .load_pdf_from_file(&path, None)
            .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
        let metadata = document_ops::read_metadata(&path)?;
        let mut pages = Vec::with_capacity(loaded.pages().len() as usize);

        for index in 0..loaded.pages().len() as usize {
            let page = loaded
                .pages()
                .get(index as PdfPageIndex)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let text = page
                .text()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .all();
            pages.push(CatalogPage { page_index: index, text });
        }

        let file_name = path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Documento.pdf")
            .to_owned();
        documents.push(CatalogDocument {
            path: path.to_string_lossy().into_owned(),
            name: file_name,
            title: metadata.title,
            author: metadata.author,
            page_count: pages.len(),
            pages,
        });
    }

    let created_at_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_secs();
    hash.update(created_at_unix.to_le_bytes());
    let id = hex::encode(hash.finalize());

    let index = CatalogIndex {
        id: id.clone(),
        name: name.clone(),
        created_at_unix,
        documents,
    };
    let directory = catalogs_dir(state);
    fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
    let destination = directory.join(format!("{id}.json"));
    let temp = directory.join(format!("{id}.tmp"));
    let bytes = serde_json::to_vec(&index).map_err(|error| SevenError::Operation(error.to_string()))?;
    fs::write(&temp, bytes).map_err(|error| SevenError::Io(error.to_string()))?;
    fs::rename(&temp, &destination).map_err(|error| SevenError::Io(error.to_string()))?;

    Ok(summary(&index))
}

fn read_index(path: &Path) -> Result<CatalogIndex, SevenError> {
    let bytes = fs::read(path).map_err(|error| SevenError::Io(error.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|error| SevenError::Operation(error.to_string()))
}

fn summary(index: &CatalogIndex) -> CatalogSummary {
    CatalogSummary {
        id: index.id.clone(),
        name: index.name.clone(),
        created_at_unix: index.created_at_unix,
        document_count: index.documents.len(),
        page_count: index.documents.iter().map(|document| document.page_count).sum(),
    }
}

pub fn list_catalogs(state: &AppState) -> Result<Vec<CatalogSummary>, SevenError> {
    let directory = catalogs_dir(state);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut output = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|error| SevenError::Io(error.to_string()))? {
        let entry = entry.map_err(|error| SevenError::Io(error.to_string()))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Ok(index) = read_index(&path) {
            output.push(summary(&index));
        }
    }
    output.sort_by(|left, right| right.created_at_unix.cmp(&left.created_at_unix));
    Ok(output)
}

pub fn search_catalog(
    state: &AppState,
    id: &str,
    query: &str,
    match_case: bool,
) -> Result<Vec<CatalogHit>, SevenError> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 512 {
        return Err(SevenError::OperationRejected(
            "A consulta deve ter entre 1 e 512 caracteres".into(),
        ));
    }
    let index = read_index(&catalog_path(state, id)?)?;
    let needle = if match_case { query.to_owned() } else { query.to_lowercase() };
    let mut hits = Vec::new();

    for document in index.documents {
        for page in document.pages {
            let haystack = if match_case { page.text.clone() } else { page.text.to_lowercase() };
            let occurrences = haystack.matches(&needle).count();
            if occurrences == 0 {
                continue;
            }
            let excerpt = page.text
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(360)
                .collect::<String>();
            hits.push(CatalogHit {
                catalog_id: index.id.clone(),
                document_path: document.path.clone(),
                document_name: document.name.clone(),
                page_index: page.page_index,
                excerpt,
                occurrences,
            });
        }
    }

    Ok(hits)
}

pub fn delete_catalog(state: &AppState, id: &str) -> Result<(), SevenError> {
    let path = catalog_path(state, id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    Ok(())
}
