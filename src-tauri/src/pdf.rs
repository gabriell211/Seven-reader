use encoding_rs::WINDOWS_1252;
use crate::{
    capabilities::bind_pdfium,
    error::SevenError,
    state::{AppState, OpenDocument},
};
use lopdf::{dictionary, Document, Object, Stream};
use pdfium_render::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, time::UNIX_EPOCH};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub path: String,
    pub active_path: String,
    pub name: String,
    pub page_count: usize,
    pub file_size: u64,
    pub pdf_version: Option<String>,
    pub encrypted: bool,
    pub has_signatures: bool,
    pub has_forms: bool,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
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
pub struct PageTextStatus {
    pub page_index: usize,
    pub char_count: usize,
    pub textless: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub page_index: usize,
    pub excerpt: String,
    pub occurrences: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOccurrence {
    pub page_index: usize,
    pub rects: Vec<NormalizedRect>,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl NormalizedRect {
    pub(crate) fn validated(&self) -> Result<Self, SevenError> {
        let values = [self.x, self.y, self.width, self.height];
        if values.iter().any(|value| !value.is_finite())
            || self.width <= 0.0
            || self.height <= 0.0
            || self.x < 0.0
            || self.y < 0.0
            || self.x + self.width > 1.0001
            || self.y + self.height > 1.0001
        {
            return Err(SevenError::OperationRejected(
                "Área de seleção inválida".into(),
            ));
        }
        Ok(Self {
            x: self.x.clamp(0.0, 1.0),
            y: self.y.clamp(0.0, 1.0),
            width: self.width.clamp(0.0, 1.0),
            height: self.height.clamp(0.0, 1.0),
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSelectionResult {
    pub text: String,
    pub page_index: usize,
    pub rect: NormalizedRect,
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

pub fn modified_ns(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
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
        source_file_size: metadata.len(),
        source_modified_ns: modified_ns(&metadata),
        pdf_version,
        encrypted,
        has_signatures,
        has_forms,
        revision: 0,
        working_path: None,
        undo_stack: Vec::new(),
        redo_stack: Vec::new(),
    })
}

pub fn refresh_document_facts(
    document: &mut OpenDocument,
    path: &Path,
) -> Result<(), SevenError> {
    let parsed = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    document.page_count = parsed.get_pages().len();
    document.pdf_version = Some(parsed.version.clone());
    document.encrypted = parsed.is_encrypted();
    document.has_forms = parsed
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"AcroForm").ok())
        .is_some();
    document.has_signatures = parsed.objects.values().any(|object| {
        let Ok(dictionary) = object.as_dict() else { return false };
        let Ok(field_type) = dictionary.get(b"FT") else { return false };
        matches!(field_type, Object::Name(name) if name.as_slice() == b"Sig")
    });
    Ok(())
}

pub fn summary(document: &OpenDocument) -> DocumentSummary {
    DocumentSummary {
        id: document.id.clone(),
        path: document.path.to_string_lossy().into_owned(),
        active_path: document.active_path().to_string_lossy().into_owned(),
        name: document.name.clone(),
        page_count: document.page_count,
        file_size: document.file_size,
        pdf_version: document.pdf_version.clone(),
        encrypted: document.encrypted,
        has_signatures: document.has_signatures,
        has_forms: document.has_forms,
        dirty: document.is_dirty(),
        can_undo: !document.undo_stack.is_empty(),
        can_redo: !document.redo_stack.is_empty(),
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
        .load_pdf_from_file(document.active_path(), document.password.as_deref())
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

pub fn page_text_status(
    state: &AppState,
    document: &OpenDocument,
    page_index: usize,
) -> Result<PageTextStatus, SevenError> {
    if page_index >= document.page_count {
        return Err(SevenError::OperationRejected(format!("Página {} não existe", page_index + 1)));
    }
    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let pdf = pdfium
        .load_pdf_from_file(document.active_path(), document.password.as_deref())
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page = pdf.pages().get(page_index as PdfPageIndex)
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let text = page.text()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .all();
    let char_count = text.chars().filter(|character| !character.is_whitespace()).count();
    Ok(PageTextStatus {
        page_index,
        char_count,
        textless: char_count == 0,
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
        .load_pdf_from_file(document.active_path(), document.password.as_deref())
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


pub fn search_document_occurrences(
    state: &AppState,
    document: &OpenDocument,
    query: &str,
    match_case: bool,
    whole_word: bool,
) -> Result<Vec<SearchOccurrence>, SevenError> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    if needle.chars().count() > 512 {
        return Err(SevenError::OperationRejected("Pesquisa excede 512 caracteres".into()));
    }

    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let pdf = pdfium
        .load_pdf_from_file(document.active_path(), document.password.as_deref())
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let options = PdfSearchOptions::new()
        .match_case(match_case)
        .match_whole_word(whole_word);
    let mut output = Vec::new();

    'pages: for (page_index, page) in pdf.pages().iter().enumerate() {
        let width = page.width().value.max(1.0);
        let height = page.height().value.max(1.0);
        let text = page
            .text()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let search = text
            .search(needle, &options)
            .map_err(|error| SevenError::Operation(error.to_string()))?;

        while let Some(segments) = search.find_next() {
            let mut rects = Vec::new();
            for segment in segments.iter() {
                let bounds = segment.bounds();
                let left = bounds.left().value;
                let right = bounds.right().value;
                let bottom = bounds.bottom().value;
                let top = bounds.top().value;
                let x = (left / width).clamp(0.0, 1.0);
                let y = (1.0 - top / height).clamp(0.0, 1.0);
                let rect_width = ((right - left) / width).max(0.0).min(1.0 - x);
                let rect_height = ((top - bottom) / height).max(0.0).min(1.0 - y);
                if rect_width > 0.0 && rect_height > 0.0 {
                    rects.push(NormalizedRect {
                        x,
                        y,
                        width: rect_width,
                        height: rect_height,
                    });
                }
            }
            if !rects.is_empty() {
                output.push(SearchOccurrence { page_index, rects });
            }
            if output.len() >= 10_000 {
                break 'pages;
            }
        }
    }

    Ok(output)
}

pub fn extract_text_in_rect(
    state: &AppState,
    document: &OpenDocument,
    page_index: usize,
    rect: NormalizedRect,
) -> Result<TextSelectionResult, SevenError> {
    if page_index >= document.page_count {
        return Err(SevenError::OperationRejected(format!(
            "Página {} não existe",
            page_index + 1
        )));
    }
    let rect = rect.validated()?;
    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let pdf = pdfium
        .load_pdf_from_file(document.active_path(), document.password.as_deref())
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page = pdf
        .pages()
        .get(page_index as PdfPageIndex)
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    let page_width = page.width().value;
    let page_height = page.height().value;
    let left = rect.x * page_width;
    let right = (rect.x + rect.width) * page_width;
    let top = (1.0 - rect.y) * page_height;
    let bottom = (1.0 - rect.y - rect.height) * page_height;
    let pdf_rect = PdfRect::new_from_values(bottom, left, top, right);
    let text = page
        .text()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .inside_rect(pdf_rect);

    Ok(TextSelectionResult {
        text,
        page_index,
        rect,
    })
}

pub fn crop_rendered_page(
    state: &AppState,
    document: &OpenDocument,
    page_index: usize,
    target_width: u16,
    rect: NormalizedRect,
) -> Result<String, SevenError> {
    let rect = rect.validated()?;
    let rendered = render_page(state, document, page_index, target_width.clamp(900, 6000))?;
    let image = image::open(&rendered.cache_path)
        .map_err(|error| SevenError::Render(error.to_string()))?;

    let width = image.width();
    let height = image.height();
    let x = ((rect.x * width as f32).floor() as u32).min(width.saturating_sub(1));
    let y = ((rect.y * height as f32).floor() as u32).min(height.saturating_sub(1));
    let right = (((rect.x + rect.width) * width as f32).ceil() as u32).clamp(x + 1, width);
    let bottom = (((rect.y + rect.height) * height as f32).ceil() as u32).clamp(y + 1, height);
    let cropped = image.crop_imm(x, y, right - x, bottom - y);

    let mut hasher = Sha256::new();
    hasher.update(document.id.as_bytes());
    hasher.update(page_index.to_le_bytes());
    hasher.update(target_width.to_le_bytes());
    hasher.update(rect.x.to_le_bytes());
    hasher.update(rect.y.to_le_bytes());
    hasher.update(rect.width.to_le_bytes());
    hasher.update(rect.height.to_le_bytes());
    let key = hex::encode(hasher.finalize());
    let output = state.cache_dir.join("render").join(format!("selection-{key}.png"));
    cropped
        .save(&output)
        .map_err(|error| SevenError::Render(error.to_string()))?;
    Ok(output.to_string_lossy().into_owned())
}

pub fn create_pdf_from_rgba(
    destination: &Path,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    dpi: u16,
) -> Result<(), SevenError> {
    if width == 0 || height == 0 || width > 20_000 || height > 20_000 {
        return Err(SevenError::OperationRejected(
            "Dimensões da imagem do clipboard são inválidas".into(),
        ));
    }
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| SevenError::OperationRejected("Imagem do clipboard é grande demais".into()))?;
    if rgba.len() != expected || expected > 512 * 1024 * 1024 {
        return Err(SevenError::OperationRejected(
            "Buffer RGBA do clipboard é inválido ou excede o limite seguro".into(),
        ));
    }

    let image = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| SevenError::OperationRejected("Buffer RGBA inválido".into()))?;
    let temp = destination.with_extension("seven-clipboard.png");
    image
        .save(&temp)
        .map_err(|error| SevenError::Io(error.to_string()))?;
    let result = create_pdf_from_images(&[temp.clone()], destination, dpi);
    let _ = fs::remove_file(&temp);
    result
}

pub fn create_blank_pdf(
    destination: &Path,
    page_size: &str,
    page_count: u16,
) -> Result<(), SevenError> {
    if !(1..=500).contains(&page_count) {
        return Err(SevenError::OperationRejected(
            "A quantidade de páginas deve ficar entre 1 e 500".into(),
        ));
    }

    let (width, height) = match page_size {
        "a4" => (595, 842),
        "letter" => (612, 792),
        "legal" => (612, 1008),
        _ => {
            return Err(SevenError::OperationRejected(
                "Tamanho de página não suportado".into(),
            ))
        }
    };

    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let mut kids = Vec::with_capacity(page_count as usize);

    for _ in 0..page_count {
        let content_id = document.add_object(Stream::new(dictionary! {}, Vec::new()));
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => dictionary! {},
            "Contents" => content_id,
        });
        kids.push(page_id.into());
    }

    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => i64::from(page_count),
        }),
    );

    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    document.compress();

    let temp = destination.with_extension("seven-create.tmp.pdf");
    document
        .save(&temp)
        .map_err(|error| SevenError::Io(error.to_string()))?;

    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    fs::rename(&temp, destination).map_err(|error| {
        let _ = fs::remove_file(&temp);
        SevenError::Io(error.to_string())
    })?;

    Ok(())
}


fn encode_pdf_text(text: &str) -> String {
    let (encoded, _, _) = WINDOWS_1252.encode(text);
    hex::encode_upper(encoded)
}

fn wrap_text_lines(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();

    for raw_line in text.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        if raw_line.is_empty() {
            lines.push(String::new());
            continue;
        }

        let mut current = String::new();
        for word in raw_line.split_whitespace() {
            let additional = if current.is_empty() { word.len() } else { word.len() + 1 };
            if current.len() + additional > max_chars && !current.is_empty() {
                lines.push(current);
                current = String::new();
            }

            if word.len() > max_chars {
                if !current.is_empty() {
                    lines.push(current);
                    current = String::new();
                }
                let chars = word.chars().collect::<Vec<_>>();
                for chunk in chars.chunks(max_chars.max(1)) {
                    lines.push(chunk.iter().collect());
                }
                continue;
            }

            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }

        if !current.is_empty() {
            lines.push(current);
        }
    }

    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

pub fn create_pdf_from_text(
    destination: &Path,
    text: &str,
    page_size: &str,
    font_size: u16,
) -> Result<(), SevenError> {
    if text.chars().count() > 2_000_000 {
        return Err(SevenError::OperationRejected(
            "O texto excede o limite de 2 milhões de caracteres".into(),
        ));
    }

    let font_size = font_size.clamp(8, 36);
    let (width, height) = match page_size {
        "a4" => (595.0_f64, 842.0_f64),
        "letter" => (612.0, 792.0),
        "legal" => (612.0, 1008.0),
        _ => {
            return Err(SevenError::OperationRejected(
                "Tamanho de página não suportado".into(),
            ))
        }
    };

    let margin = 54.0_f64;
    let leading = f64::from(font_size) * 1.35;
    let usable_width = (width - margin * 2.0).max(72.0);
    let usable_height = (height - margin * 2.0).max(72.0);
    let max_chars = (usable_width / (f64::from(font_size) * 0.52)).floor().max(12.0) as usize;
    let lines_per_page = (usable_height / leading).floor().max(1.0) as usize;
    let lines = wrap_text_lines(text, max_chars);

    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let font_id = document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });
    let mut kids = Vec::new();

    for page_lines in lines.chunks(lines_per_page) {
        let mut content = format!(
            "BT\n/F1 {} Tf\n{:.2} {:.2} Td\n{:.2} TL\n",
            font_size,
            margin,
            height - margin - f64::from(font_size),
            leading,
        );

        for line in page_lines {
            content.push('<');
            content.push_str(&encode_pdf_text(line));
            content.push_str("> Tj\nT*\n");
        }
        content.push_str("ET\n");

        let content_id = document.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let resources = dictionary! {
            "Font" => dictionary! {
                "F1" => font_id,
            },
        };
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => resources,
            "Contents" => content_id,
        });
        kids.push(Object::Reference(page_id));
    }

    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids.clone(),
            "Count" => kids.len() as i64,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    document.compress();

    let temp = destination.with_extension("seven-text.tmp.pdf");
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if destination.exists() {
        fs::remove_file(destination).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, destination).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparePage {
    pub page_index: usize,
    pub left_excerpt: String,
    pub right_excerpt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareReport {
    pub left_pages: usize,
    pub right_pages: usize,
    pub changed_pages: usize,
    pub pages: Vec<ComparePage>,
}

fn normalized_page_text(page: &PdfPage<'_>) -> Result<String, SevenError> {
    let text = page
        .text()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .all();
    Ok(text.split_whitespace().collect::<Vec<_>>().join(" "))
}

pub fn compare_documents(
    state: &AppState,
    left: &Path,
    right: &Path,
) -> Result<CompareReport, SevenError> {
    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let left_doc = pdfium
        .load_pdf_from_file(left, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let right_doc = pdfium
        .load_pdf_from_file(right, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;

    let left_pages = left_doc.pages().len() as usize;
    let right_pages = right_doc.pages().len() as usize;
    let max_pages = left_pages.max(right_pages);
    let mut pages = Vec::new();

    for index in 0..max_pages {
        let left_text = if index < left_pages {
            normalized_page_text(
                &left_doc.pages().get(index as PdfPageIndex)
                    .map_err(|error| SevenError::Operation(error.to_string()))?
            )?
        } else {
            String::new()
        };
        let right_text = if index < right_pages {
            normalized_page_text(
                &right_doc.pages().get(index as PdfPageIndex)
                    .map_err(|error| SevenError::Operation(error.to_string()))?
            )?
        } else {
            String::new()
        };

        if left_text != right_text {
            pages.push(ComparePage {
                page_index: index,
                left_excerpt: left_text.chars().take(260).collect(),
                right_excerpt: right_text.chars().take(260).collect(),
            });
        }
    }

    Ok(CompareReport {
        left_pages,
        right_pages,
        changed_pages: pages.len(),
        pages,
    })
}


pub fn create_pdf_from_images(
    inputs: &[PathBuf],
    destination: &Path,
    dpi: u16,
) -> Result<(), SevenError> {
    if inputs.is_empty() || inputs.len() > 500 {
        return Err(SevenError::OperationRejected(
            "Selecione entre 1 e 500 imagens".into(),
        ));
    }
    let dpi = dpi.clamp(72, 1200);
    let mut document = Document::with_version("1.7");
    let pages_id = document.new_object_id();
    let mut page_ids = Vec::with_capacity(inputs.len());

    for input in inputs {
        let canonical = fs::canonicalize(input)
            .map_err(|error| SevenError::InvalidPath(error.to_string()))?;
        let extension = canonical
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "tif" | "tiff" | "bmp" | "webp") {
            return Err(SevenError::UnsupportedFormat(extension));
        }

        let decoded = image::open(&canonical)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let width_points = ((decoded.width() as f64 * 72.0) / f64::from(dpi)).max(1.0);
        let height_points = ((decoded.height() as f64 * 72.0) / f64::from(dpi)).max(1.0);

        let image_stream = lopdf::xobject::image(&canonical)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let image_id = document.add_object(image_stream);
        let image_name = format!("Im{}", image_id.0);

        let content = format!(
            "q\n{width_points:.4} 0 0 {height_points:.4} 0 0 cm\n/{image_name} Do\nQ\n"
        );
        let content_id = document.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "MediaBox" => vec![0.into(), 0.into(), width_points.into(), height_points.into()],
        });
        document
            .add_xobject(page_id, image_name.as_bytes(), image_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        page_ids.push(page_id);
    }

    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => page_ids.len() as i64,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    document.compress();

    let temp = destination.with_extension("seven-images.tmp.pdf");
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if destination.exists() {
        fs::remove_file(destination).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, destination).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(())
}
