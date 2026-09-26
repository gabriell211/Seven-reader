use crate::{
    capabilities,
    error::SevenError,
    state::AppState,
};
use lopdf::{Document, Object};
use pdfium_render::prelude::PdfPageIndex;
use serde::Serialize;
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionInputInfo {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub detected_format: String,
    pub detected_mime: String,
    pub size: u64,
    pub page_count: Option<usize>,
    pub encrypted: Option<bool>,
    pub has_extractable_text: Option<bool>,
    pub scan_like: Option<bool>,
    pub orientation: Option<String>,
    pub ocr_recommended: Option<bool>,
    pub available_outputs: Vec<String>,
    pub limitations: Vec<String>,
}

fn read_prefix(path: &Path, limit: usize) -> Result<Vec<u8>, SevenError> {
    let mut file = File::open(path).map_err(|error| SevenError::Io(error.to_string()))?;
    let mut buffer = vec![0u8; limit];
    let read = file.read(&mut buffer).map_err(|error| SevenError::Io(error.to_string()))?;
    buffer.truncate(read);
    Ok(buffer)
}

fn detect_signature(path: &Path, extension: &str) -> Result<(String, String), SevenError> {
    let bytes = read_prefix(path, 8192)?;
    if bytes.starts_with(b"%PDF-") {
        return Ok(("pdf".into(), "application/pdf".into()));
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok(("png".into(), "image/png".into()));
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok(("jpeg".into(), "image/jpeg".into()));
    }
    if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        return Ok(("tiff".into(), "image/tiff".into()));
    }
    if bytes.starts_with(b"BM") {
        return Ok(("bmp".into(), "image/bmp".into()));
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return Ok(("webp".into(), "image/webp".into()));
    }
    if bytes.starts_with(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) {
        let kind = match extension {
            "doc" => ("doc", "application/msword"),
            "xls" => ("xls", "application/vnd.ms-excel"),
            "ppt" => ("ppt", "application/vnd.ms-powerpoint"),
            _ => ("ole", "application/x-ole-storage"),
        };
        return Ok((kind.0.into(), kind.1.into()));
    }
    if bytes.starts_with(b"PK\x03\x04") {
        let mime = match extension {
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "odt" => "application/vnd.oasis.opendocument.text",
            "ods" => "application/vnd.oasis.opendocument.spreadsheet",
            "odp" => "application/vnd.oasis.opendocument.presentation",
            _ => "application/zip",
        };
        return Ok((if extension.is_empty() { "zip" } else { extension }.into(), mime.into()));
    }

    let text_like = bytes.iter().all(|byte| {
        *byte == b'\n' || *byte == b'\r' || *byte == b'\t' || (*byte >= 0x20 && *byte != 0x7f)
    });
    if text_like {
        let sample = String::from_utf8_lossy(&bytes).to_lowercase();
        if sample.contains("<html") || sample.contains("<!doctype html") {
            return Ok(("html".into(), "text/html".into()));
        }
        let mime = match extension {
            "csv" => "text/csv",
            "rtf" => "application/rtf",
            "md" => "text/markdown",
            _ => "text/plain",
        };
        return Ok((if extension.is_empty() { "text" } else { extension }.into(), mime.into()));
    }

    Ok((
        if extension.is_empty() { "binary" } else { extension }.into(),
        "application/octet-stream".into(),
    ))
}

fn inherited_box(document: &Document, mut id: (u32, u16)) -> Option<[f64; 4]> {
    for _ in 0..32 {
        let dict = document.get_object(id).ok()?.as_dict().ok()?;
        for key in [b"CropBox".as_slice(), b"MediaBox".as_slice()] {
            if let Ok(Object::Array(values)) = dict.get(key) {
                if values.len() >= 4 {
                    let number = |value: &Object| match value {
                        Object::Integer(value) => Some(*value as f64),
                        Object::Real(value) => Some(f64::from(*value)),
                        _ => None,
                    };
                    return Some([
                        number(&values[0])?,
                        number(&values[1])?,
                        number(&values[2])?,
                        number(&values[3])?,
                    ]);
                }
            }
        }
        id = dict.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn inspect_pdf(
    state: &AppState,
    path: &Path,
    info: &mut ConversionInputInfo,
) -> Result<(), SevenError> {
    let parsed = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let pages = parsed.get_pages();
    info.page_count = Some(pages.len());
    info.encrypted = Some(parsed.is_encrypted());

    if parsed.is_encrypted() {
        info.has_extractable_text = None;
        info.scan_like = None;
        info.ocr_recommended = None;
        info.limitations.push("PDF protegido: informe a senha antes de converter conteúdo.".into());
        return Ok(());
    }

    let orientation = pages
        .values()
        .take(12)
        .filter_map(|id| inherited_box(&parsed, *id))
        .fold((0usize, 0usize), |(portrait, landscape), rect| {
            let width = (rect[2] - rect[0]).abs();
            let height = (rect[3] - rect[1]).abs();
            if width > height { (portrait, landscape + 1) } else { (portrait + 1, landscape) }
        });
    info.orientation = Some(if orientation.1 > orientation.0 { "landscape" } else { "portrait" }.into());

    let pdfium = match capabilities::bind_pdfium(&state.resource_dir) {
        Ok(pdfium) => pdfium,
        Err(error) => {
            info.limitations.push(format!("Texto não analisado: PDFium indisponível ({error})."));
            return Ok(());
        }
    };
    let pdf = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let sample_pages = usize::min(pdf.pages().len() as usize, 5);
    let mut chars = 0usize;
    for index in 0..sample_pages {
        let page = pdf
            .pages()
            .get(index as PdfPageIndex)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        chars += page
            .text()
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .all()
            .trim()
            .chars()
            .count();
    }
    let threshold = sample_pages.saturating_mul(24);
    let has_text = chars >= threshold;
    info.has_extractable_text = Some(has_text);
    info.scan_like = Some(!has_text);
    info.ocr_recommended = Some(!has_text);
    Ok(())
}

fn office_input(extension: &str) -> bool {
    matches!(
        extension,
        "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx"
            | "odt" | "ods" | "odp" | "rtf" | "txt" | "html" | "htm"
    )
}

fn image_input(extension: &str) -> bool {
    matches!(extension, "png" | "jpg" | "jpeg" | "tif" | "tiff" | "bmp" | "webp")
}

pub fn inspect_inputs(
    state: &AppState,
    inputs: Vec<String>,
) -> Result<Vec<ConversionInputInfo>, SevenError> {
    if inputs.is_empty() || inputs.len() > 500 {
        return Err(SevenError::OperationRejected(
            "Selecione entre 1 e 500 arquivos para inspecionar".into(),
        ));
    }
    let caps = capabilities::detect(state);
    let mut output = Vec::with_capacity(inputs.len());

    for input in inputs {
        let original = PathBuf::from(&input);
        if !original.is_file() {
            return Err(SevenError::NotFound(input));
        }
        let path = fs::canonicalize(&original).map_err(|error| SevenError::InvalidPath(error.to_string()))?;
        let metadata = fs::metadata(&path).map_err(|error| SevenError::Io(error.to_string()))?;
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let (detected_format, detected_mime) = detect_signature(&path, &extension)?;
        let mut info = ConversionInputInfo {
            path: path.to_string_lossy().into_owned(),
            name: path.file_name().and_then(|value| value.to_str()).unwrap_or("arquivo").to_owned(),
            extension: extension.clone(),
            detected_format,
            detected_mime,
            size: metadata.len(),
            page_count: None,
            encrypted: None,
            has_extractable_text: None,
            scan_like: None,
            orientation: None,
            ocr_recommended: None,
            available_outputs: Vec::new(),
            limitations: Vec::new(),
        };

        if info.detected_format == "pdf" {
            inspect_pdf(state, &path, &mut info)?;
            if caps.pdftotext.available {
                info.available_outputs.extend(["txt".into(), "html".into(), "markdown".into()]);
            }
            if caps.ghostscript.available {
                info.available_outputs.extend([
                    "png".into(), "jpeg".into(), "tiff".into(), "bmp".into(), "ps".into(),
                    "optimized-pdf".into(),
                ]);
            }
            if caps.ocr.available && info.ocr_recommended == Some(true) {
                info.available_outputs.push("searchable-pdf".into());
            }
        } else if office_input(&extension) {
            if caps.office.available {
                info.available_outputs.push("pdf".into());
            } else {
                info.limitations.push("LibreOffice não detectado.".into());
            }
        } else if image_input(&extension) {
            info.available_outputs.push("pdf".into());
        } else {
            info.limitations.push("Formato sem conversor local registrado.".into());
        }

        output.push(info);
    }
    Ok(output)
}
