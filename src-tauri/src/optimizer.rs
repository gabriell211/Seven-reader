use crate::error::SevenError;
use lopdf::{Document, Object};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeOptions {
    pub compatibility: String,
    pub color_dpi: u16,
    pub grayscale_dpi: u16,
    pub monochrome_dpi: u16,
    pub downsample: String,
    pub color_compression: String,
    pub grayscale_compression: String,
    pub jpeg_quality: u8,
    pub embed_fonts: bool,
    pub subset_fonts: bool,
    pub linearize: bool,
}

impl OptimizeOptions {
    pub fn validate(&self) -> Result<(), SevenError> {
        if !matches!(self.compatibility.as_str(), "1.4" | "1.5" | "1.6" | "1.7" | "2.0") {
            return Err(SevenError::OperationRejected("Compatibilidade PDF inválida".into()));
        }
        for dpi in [self.color_dpi, self.grayscale_dpi, self.monochrome_dpi] {
            if !(36..=2400).contains(&dpi) {
                return Err(SevenError::OperationRejected("DPI deve ficar entre 36 e 2400".into()));
            }
        }
        if !matches!(self.downsample.as_str(), "bicubic" | "average" | "subsample") {
            return Err(SevenError::OperationRejected("Método de downsample inválido".into()));
        }
        if !matches!(self.color_compression.as_str(), "jpeg" | "flate")
            || !matches!(self.grayscale_compression.as_str(), "jpeg" | "flate")
        {
            return Err(SevenError::OperationRejected("Compressão de imagem inválida".into()));
        }
        if !(1..=100).contains(&self.jpeg_quality) {
            return Err(SevenError::OperationRejected("Qualidade JPEG deve ficar entre 1 e 100".into()));
        }
        Ok(())
    }

    pub fn ghostscript_args(&self, input: &Path, output: &Path) -> Result<Vec<String>, SevenError> {
        self.validate()?;
        let downsample = match self.downsample.as_str() {
            "bicubic" => "/Bicubic",
            "average" => "/Average",
            "subsample" => "/Subsample",
            _ => unreachable!(),
        };
        let color_filter = if self.color_compression == "jpeg" { "/DCTEncode" } else { "/FlateEncode" };
        let gray_filter = if self.grayscale_compression == "jpeg" { "/DCTEncode" } else { "/FlateEncode" };

        Ok(vec![
            "-sDEVICE=pdfwrite".into(),
            format!("-dCompatibilityLevel={}", self.compatibility),
            "-dNOPAUSE".into(),
            "-dBATCH".into(),
            "-dQUIET".into(),
            "-dDetectDuplicateImages=true".into(),
            "-dCompressFonts=true".into(),
            format!("-dEmbedAllFonts={}", if self.embed_fonts { "true" } else { "false" }),
            format!("-dSubsetFonts={}", if self.subset_fonts { "true" } else { "false" }),
            "-dDownsampleColorImages=true".into(),
            format!("-dColorImageResolution={}", self.color_dpi),
            format!("-dColorImageDownsampleType={downsample}"),
            "-dAutoFilterColorImages=false".into(),
            format!("-dColorImageFilter={color_filter}"),
            "-dDownsampleGrayImages=true".into(),
            format!("-dGrayImageResolution={}", self.grayscale_dpi),
            format!("-dGrayImageDownsampleType={downsample}"),
            "-dAutoFilterGrayImages=false".into(),
            format!("-dGrayImageFilter={gray_filter}"),
            "-dDownsampleMonoImages=true".into(),
            format!("-dMonoImageResolution={}", self.monochrome_dpi),
            format!("-dMonoImageDownsampleType={downsample}"),
            "-dMonoImageFilter=/CCITTFaxEncode".into(),
            format!("-dJPEGQ={}", self.jpeg_quality),
            "-dPreserveMarkedContent=true".into(),
            format!("-sOutputFile={}", output.to_string_lossy()),
            input.to_string_lossy().into_owned(),
        ])
    }
}

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
