use crate::error::SevenError;
use lopdf::{Document, Object};
use serde::Serialize;
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationAudit {
    pub file_size: u64,
    pub object_count: usize,
    pub stream_bytes: u64,
    pub image_stream_bytes: u64,
    pub font_stream_bytes: u64,
    pub embedded_file_bytes: u64,
    pub page_content_bytes: u64,
    pub other_stream_bytes: u64,
    pub image_count: usize,
    pub font_count: usize,
    pub embedded_file_count: usize,
}

fn name_is(dictionary: &lopdf::Dictionary, key: &[u8], expected: &[u8]) -> bool {
    dictionary
        .get(key)
        .ok()
        .and_then(|value| value.as_name().ok())
        .is_some_and(|name| name == expected)
}

pub fn audit(path: &Path) -> Result<OptimizationAudit, SevenError> {
    let metadata = fs::metadata(path).map_err(|error| SevenError::Io(error.to_string()))?;
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_content_ids = document
        .get_pages()
        .values()
        .filter_map(|page_id| {
            document
                .get_object(*page_id)
                .ok()
                .and_then(|object| object.as_dict().ok())
                .and_then(|dictionary| dictionary.get(b"Contents").ok())
                .map(|contents| match contents {
                    Object::Reference(id) => vec![*id],
                    Object::Array(values) => values.iter().filter_map(|value| value.as_reference().ok()).collect(),
                    _ => Vec::new(),
                })
        })
        .flatten()
        .collect::<std::collections::HashSet<_>>();

    let mut result = OptimizationAudit {
        file_size: metadata.len(),
        object_count: document.objects.len(),
        stream_bytes: 0,
        image_stream_bytes: 0,
        font_stream_bytes: 0,
        embedded_file_bytes: 0,
        page_content_bytes: 0,
        other_stream_bytes: 0,
        image_count: 0,
        font_count: 0,
        embedded_file_count: 0,
    };

    for (id, object) in &document.objects {
        let Ok(stream) = object.as_stream() else { continue };
        let size = stream.content.len() as u64;
        result.stream_bytes = result.stream_bytes.saturating_add(size);

        if name_is(&stream.dict, b"Subtype", b"Image") {
            result.image_stream_bytes = result.image_stream_bytes.saturating_add(size);
            result.image_count += 1;
        } else if name_is(&stream.dict, b"Type", b"EmbeddedFile") {
            result.embedded_file_bytes = result.embedded_file_bytes.saturating_add(size);
            result.embedded_file_count += 1;
        } else if page_content_ids.contains(id) {
            result.page_content_bytes = result.page_content_bytes.saturating_add(size);
        } else {
            let is_font = name_is(&stream.dict, b"Subtype", b"Type1C")
                || name_is(&stream.dict, b"Subtype", b"CIDFontType0C")
                || stream.dict.get(b"Length1").is_ok();
            if is_font {
                result.font_stream_bytes = result.font_stream_bytes.saturating_add(size);
                result.font_count += 1;
            } else {
                result.other_stream_bytes = result.other_stream_bytes.saturating_add(size);
            }
        }
    }

    Ok(result)
}
