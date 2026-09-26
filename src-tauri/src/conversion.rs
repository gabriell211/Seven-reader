use crate::{
    capabilities,
    error::SevenError,
    state::AppState,
};
use lopdf::{Document, Object};
use pdfium_render::prelude::PdfPageIndex;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionOptions {
    pub post_process: bool,
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
    #[serde(default)]
    pub rgb_profile: Option<String>,
    #[serde(default)]
    pub cmyk_profile: Option<String>,
    #[serde(default)]
    pub gray_profile: Option<String>,
    #[serde(default)]
    pub output_profile: Option<String>,
    pub color_strategy: String,
    pub rendering_intent: String,
    pub preserve_overprint: bool,
    pub preserve_metadata: bool,
    pub pdf_standard: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionPresetDefinition {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub built_in: bool,
    pub options: ConversionOptions,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversionPresetFile {
    version: u8,
    presets: Vec<ConversionPresetDefinition>,
}

impl ConversionOptions {
    pub fn standard() -> Self {
        Self {
            post_process: false,
            compatibility: "1.7".into(),
            color_dpi: 150,
            grayscale_dpi: 150,
            monochrome_dpi: 300,
            downsample: "bicubic".into(),
            color_compression: "jpeg".into(),
            grayscale_compression: "jpeg".into(),
            jpeg_quality: 82,
            embed_fonts: true,
            subset_fonts: true,
            rgb_profile: None,
            cmyk_profile: None,
            gray_profile: None,
            output_profile: None,
            color_strategy: "preserve".into(),
            rendering_intent: "relative".into(),
            preserve_overprint: true,
            preserve_metadata: true,
            pdf_standard: "pdf".into(),
        }
    }

    pub fn compact() -> Self {
        Self {
            post_process: true,
            color_dpi: 144,
            grayscale_dpi: 144,
            monochrome_dpi: 300,
            jpeg_quality: 70,
            preserve_overprint: false,
            ..Self::standard()
        }
    }

    pub fn print() -> Self {
        Self {
            post_process: true,
            color_dpi: 300,
            grayscale_dpi: 300,
            monochrome_dpi: 600,
            jpeg_quality: 92,
            preserve_overprint: true,
            ..Self::standard()
        }
    }

    pub fn from_legacy_preset(preset: &str) -> Self {
        match preset {
            "compact" => Self::compact(),
            "print" => Self::print(),
            _ => Self::standard(),
        }
    }

    pub fn requires_postprocess(&self) -> bool {
        self.post_process || self.pdf_standard != "pdf"
    }

    pub fn validate(&self) -> Result<(), SevenError> {
        if !matches!(self.compatibility.as_str(), "1.3" | "1.4" | "1.5" | "1.6" | "1.7" | "2.0") {
            return Err(SevenError::OperationRejected("Compatibilidade PDF inválida".into()));
        }
        for dpi in [self.color_dpi, self.grayscale_dpi, self.monochrome_dpi] {
            if !(36..=2400).contains(&dpi) {
                return Err(SevenError::OperationRejected("DPI deve ficar entre 36 e 2400".into()));
            }
        }
        if !matches!(self.downsample.as_str(), "bicubic" | "average" | "subsample") {
            return Err(SevenError::OperationRejected("Método de downsampling inválido".into()));
        }
        if !matches!(self.color_compression.as_str(), "jpeg" | "flate")
            || !matches!(self.grayscale_compression.as_str(), "jpeg" | "flate")
        {
            return Err(SevenError::OperationRejected("Compressão de imagem inválida".into()));
        }
        if !(1..=100).contains(&self.jpeg_quality) {
            return Err(SevenError::OperationRejected("Qualidade JPEG deve ficar entre 1 e 100".into()));
        }
        if !matches!(self.color_strategy.as_str(), "preserve" | "rgb" | "cmyk" | "gray") {
            return Err(SevenError::OperationRejected("Estratégia de cor inválida".into()));
        }
        if !matches!(self.rendering_intent.as_str(), "perceptual" | "relative" | "saturation" | "absolute") {
            return Err(SevenError::OperationRejected("Rendering intent inválido".into()));
        }
        if !matches!(self.pdf_standard.as_str(), "pdf" | "pdfa-1b" | "pdfa-2b" | "pdfa-3b" | "pdfx-3") {
            return Err(SevenError::OperationRejected("Padrão PDF inválido".into()));
        }

        match self.pdf_standard.as_str() {
            "pdfa-1b" if self.compatibility != "1.4" => {
                return Err(SevenError::OperationRejected("PDF/A-1b exige compatibilidade PDF 1.4".into()));
            }
            "pdfa-2b" | "pdfa-3b" if self.compatibility != "1.7" => {
                return Err(SevenError::OperationRejected("PDF/A-2b e PDF/A-3b exigem compatibilidade PDF 1.7 neste pipeline".into()));
            }
            "pdfx-3" if self.compatibility != "1.3" => {
                return Err(SevenError::OperationRejected("PDF/X-3 exige compatibilidade PDF 1.3 neste pipeline".into()));
            }
            _ => {}
        }

        if self.pdf_standard != "pdf" {
            if !self.requires_postprocess() || !self.embed_fonts || !self.preserve_metadata {
                return Err(SevenError::OperationRejected(
                    "PDF/A e PDF/X exigem pós-processamento, incorporação de fontes e metadados de conformidade".into(),
                ));
            }
            if self.output_profile.as_deref().unwrap_or_default().trim().is_empty() {
                return Err(SevenError::OperationRejected(
                    "PDF/A e PDF/X exigem um perfil ICC de OutputIntent".into(),
                ));
            }
        }
        if self.pdf_standard.starts_with("pdfa-") && !matches!(self.color_strategy.as_str(), "rgb" | "cmyk") {
            return Err(SevenError::OperationRejected(
                "Este pipeline PDF/A aceita estratégia RGB ou CMYK com ICC correspondente".into(),
            ));
        }
        if self.pdf_standard == "pdfx-3" && !matches!(self.color_strategy.as_str(), "cmyk" | "gray") {
            return Err(SevenError::OperationRejected(
                "PDF/X-3 exige estratégia CMYK ou Gray".into(),
            ));
        }

        self.validate_profiles()?;
        Ok(())
    }

    fn validate_profiles(&self) -> Result<(), SevenError> {
        for (value, label, expected) in [
            (self.rgb_profile.as_deref(), "Perfil RGB", Some("RGB")),
            (self.cmyk_profile.as_deref(), "Perfil CMYK", Some("CMYK")),
            (self.gray_profile.as_deref(), "Perfil Gray", Some("GRAY")),
        ] {
            if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
                validate_icc_profile(Path::new(value), label, expected)?;
            }
        }

        if let Some(value) = self.output_profile.as_deref().filter(|value| !value.trim().is_empty()) {
            let expected = match self.color_strategy.as_str() {
                "rgb" => Some("RGB"),
                "cmyk" => Some("CMYK"),
                "gray" => Some("GRAY"),
                _ => None,
            };
            validate_icc_profile(Path::new(value), "Perfil de saída", expected)?;
        }
        Ok(())
    }

    pub fn ghostscript_args(
        &self,
        input: &Path,
        output: &Path,
        standard_prefix: Option<&Path>,
    ) -> Result<Vec<String>, SevenError> {
        self.validate()?;
        let downsample = match self.downsample.as_str() {
            "bicubic" => "/Bicubic",
            "average" => "/Average",
            "subsample" => "/Subsample",
            _ => unreachable!(),
        };
        let color_filter = if self.color_compression == "jpeg" { "/DCTEncode" } else { "/FlateEncode" };
        let gray_filter = if self.grayscale_compression == "jpeg" { "/DCTEncode" } else { "/FlateEncode" };
        let intent = match self.rendering_intent.as_str() {
            "perceptual" => 0,
            "relative" => 1,
            "saturation" => 2,
            "absolute" => 3,
            _ => unreachable!(),
        };

        let mut args = vec![
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
            format!("-dPreserveOverprintSettings={}", if self.preserve_overprint { "true" } else { "false" }),
            format!("-dRenderIntent={intent}"),
        ];

        if !self.preserve_metadata && self.pdf_standard == "pdf" {
            args.push("-dOmitXMP=true".into());
            args.push("-dOmitInfoDate=true".into());
            if self.compatibility != "2.0" {
                args.push("-dOmitID=true".into());
            }
        }

        for (flag, profile) in [
            ("-sDefaultRGBProfile", self.rgb_profile.as_deref()),
            ("-sDefaultCMYKProfile", self.cmyk_profile.as_deref()),
            ("-sDefaultGrayProfile", self.gray_profile.as_deref()),
            ("-sOutputICCProfile", self.output_profile.as_deref()),
        ] {
            if let Some(profile) = profile.filter(|value| !value.trim().is_empty()) {
                let canonical = canonical_profile_path(profile)?;
                args.push(format!("--permit-file-read={}", canonical.to_string_lossy()));
                args.push(format!("{flag}={}", canonical.to_string_lossy()));
            }
        }

        match self.color_strategy.as_str() {
            "rgb" => args.push("-sColorConversionStrategy=RGB".into()),
            "cmyk" => args.push("-sColorConversionStrategy=CMYK".into()),
            "gray" => args.push("-sColorConversionStrategy=Gray".into()),
            _ => {}
        }

        match self.pdf_standard.as_str() {
            "pdfa-1b" => {
                args.push("-dPDFA=1".into());
                args.push("-dPDFACompatibilityPolicy=2".into());
            }
            "pdfa-2b" => {
                args.push("-dPDFA=2".into());
                args.push("-dPDFACompatibilityPolicy=2".into());
                args.push("-sBlendConversionStrategy=Managed".into());
            }
            "pdfa-3b" => {
                args.push("-dPDFA=3".into());
                args.push("-dPDFACompatibilityPolicy=2".into());
                args.push("-sBlendConversionStrategy=Managed".into());
            }
            "pdfx-3" => {
                args.push("-dPDFX=3".into());
                args.push("-dPDFACompatibilityPolicy=2".into());
            }
            _ => {}
        }

        args.push(format!("-sOutputFile={}", output.to_string_lossy()));
        if let Some(prefix) = standard_prefix {
            args.push(prefix.to_string_lossy().into_owned());
        }
        args.push(input.to_string_lossy().into_owned());
        Ok(args)
    }

    pub fn write_standard_prefix(&self, directory: &Path) -> Result<Option<PathBuf>, SevenError> {
        if self.pdf_standard == "pdf" {
            return Ok(None);
        }
        self.validate()?;
        fs::create_dir_all(directory).map_err(|error| SevenError::Io(error.to_string()))?;
        let profile = canonical_profile_path(
            self.output_profile.as_deref().ok_or_else(|| SevenError::OperationRejected("OutputIntent ICC ausente".into()))?,
        )?;
        let color_space = icc_color_space(&profile)?;
        let components = match color_space.as_str() {
            "RGB" => 3,
            "CMYK" => 4,
            "GRAY" => 1,
            _ => return Err(SevenError::OperationRejected("Perfil ICC de saída possui espaço de cor não suportado".into())),
        };
        let escaped = escape_postscript_string(&profile.to_string_lossy());
        let path = directory.join(if self.pdf_standard == "pdfx-3" { "seven-pdfx.ps" } else { "seven-pdfa.ps" });
        let body = if self.pdf_standard == "pdfx-3" {
            format!(
                "%!\n/ICCProfile ({escaped}) def\n[ /GTS_PDFXVersion (PDF/X-3:2002) /Title (Seven Reader conversion) /Trapped /False /DOCINFO pdfmark\n[/_objdef {{sevenICC}} /type /stream /OBJ pdfmark\n[{{sevenICC}} << /N {components} >> /PUT pdfmark\n[{{sevenICC}} ICCProfile (r) file /PUT pdfmark\n[/_objdef {{sevenOI}} /type /dict /OBJ pdfmark\n[{{sevenOI}} << /Type /OutputIntent /S /GTS_PDFX /OutputCondition (Seven Reader ICC workflow) /Info (Custom ICC) /OutputConditionIdentifier (Custom) /RegistryName (https://www.color.org) /DestOutputProfile {{sevenICC}} >> /PUT pdfmark\n[{{Catalog}} << /OutputIntents [ {{sevenOI}} ] >> /PUT pdfmark\n"
            )
        } else {
            format!(
                "%!\n/ICCProfile ({escaped}) def\n[/_objdef {{sevenICC}} /type /stream /OBJ pdfmark\n[{{sevenICC}} << /N {components} >> /PUT pdfmark\n[{{sevenICC}} ICCProfile (r) file /PUT pdfmark\n[/_objdef {{sevenOI}} /type /dict /OBJ pdfmark\n[{{sevenOI}} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {{sevenICC}} /OutputConditionIdentifier (Custom ICC) >> /PUT pdfmark\n[{{Catalog}} << /OutputIntents [ {{sevenOI}} ] >> /PUT pdfmark\n"
            )
        };
        fs::write(&path, body).map_err(|error| SevenError::Io(error.to_string()))?;
        Ok(Some(path))
    }
}

fn canonical_profile_path(value: &str) -> Result<PathBuf, SevenError> {
    let path = Path::new(value);
    if value.trim().is_empty() || !path.is_file() {
        return Err(SevenError::InvalidPath(format!("Perfil ICC não encontrado: {value}")));
    }
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !matches!(extension.as_str(), "icc" | "icm") {
        return Err(SevenError::OperationRejected("Perfis de cor devem usar extensão .icc ou .icm".into()));
    }
    fs::canonicalize(path).map_err(|error| SevenError::InvalidPath(error.to_string()))
}

fn icc_color_space(path: &Path) -> Result<String, SevenError> {
    let mut file = File::open(path).map_err(|error| SevenError::Io(error.to_string()))?;
    let mut header = [0u8; 128];
    file.read_exact(&mut header).map_err(|error| SevenError::OperationRejected(format!("Perfil ICC inválido: {error}")))?;
    if &header[36..40] != b"acsp" {
        return Err(SevenError::OperationRejected("Arquivo selecionado não possui cabeçalho ICC válido".into()));
    }
    let signature = &header[16..20];
    match signature {
        b"RGB " => Ok("RGB".into()),
        b"CMYK" => Ok("CMYK".into()),
        b"GRAY" => Ok("GRAY".into()),
        _ => Ok(String::from_utf8_lossy(signature).trim().to_owned()),
    }
}

fn validate_icc_profile(path: &Path, label: &str, expected: Option<&str>) -> Result<(), SevenError> {
    let canonical = canonical_profile_path(&path.to_string_lossy())?;
    let actual = icc_color_space(&canonical)?;
    if let Some(expected) = expected {
        if actual != expected {
            return Err(SevenError::OperationRejected(format!(
                "{label} usa espaço {actual}, mas o esperado é {expected}",
            )));
        }
    }
    Ok(())
}

fn escape_postscript_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

pub fn import_presets(path: &str) -> Result<Vec<ConversionPresetDefinition>, SevenError> {
    let canonical = fs::canonicalize(path).map_err(|error| SevenError::InvalidPath(error.to_string()))?;
    if !canonical.is_file() {
        return Err(SevenError::InvalidPath("Arquivo de presets inválido".into()));
    }
    if canonical.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase() != "json" {
        return Err(SevenError::UnsupportedFormat("json".into()));
    }
    let metadata = fs::metadata(&canonical).map_err(|error| SevenError::Io(error.to_string()))?;
    if metadata.len() > 2 * 1024 * 1024 {
        return Err(SevenError::OperationRejected("Arquivo de presets excede 2 MB".into()));
    }
    let content = fs::read_to_string(&canonical).map_err(|error| SevenError::Io(error.to_string()))?;
    let mut file: ConversionPresetFile = serde_json::from_str(&content)
        .map_err(|error| SevenError::OperationRejected(format!("Arquivo de presets inválido: {error}")))?;
    if file.version != 1 || file.presets.is_empty() || file.presets.len() > 100 {
        return Err(SevenError::OperationRejected(
            "A coleção deve usar versão 1 e conter entre 1 e 100 presets".into(),
        ));
    }
    let mut ids = std::collections::HashSet::new();
    for preset in &mut file.presets {
        preset.id = preset.id.trim().to_owned();
        preset.name = preset.name.trim().to_owned();
        preset.built_in = false;
        if preset.id.is_empty() || preset.id.chars().count() > 160 || preset.name.is_empty() || preset.name.chars().count() > 120 {
            return Err(SevenError::OperationRejected("Preset contém id ou nome inválido".into()));
        }
        if !ids.insert(preset.id.clone()) {
            return Err(SevenError::OperationRejected("Arquivo contém ids de preset duplicados".into()));
        }
        preset.options.validate()?;
    }
    Ok(file.presets)
}

pub fn export_presets(path: &str, presets: &[ConversionPresetDefinition]) -> Result<(), SevenError> {
    if presets.is_empty() || presets.len() > 100 {
        return Err(SevenError::OperationRejected("Selecione entre 1 e 100 presets para exportar".into()));
    }
    let output = Path::new(path);
    let file_name = output.file_name().and_then(|value| value.to_str()).ok_or_else(|| SevenError::InvalidPath(path.into()))?;
    if !file_name.to_ascii_lowercase().ends_with(".json") {
        return Err(SevenError::UnsupportedFormat("json".into()));
    }
    let parent = output.parent().filter(|value| !value.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."));
    let parent = fs::canonicalize(parent).map_err(|error| SevenError::InvalidPath(error.to_string()))?;
    if !parent.is_dir() {
        return Err(SevenError::InvalidPath("Pasta de destino inválida".into()));
    }
    for preset in presets {
        if preset.name.trim().is_empty() || preset.name.chars().count() > 120 {
            return Err(SevenError::OperationRejected("Nome de preset inválido".into()));
        }
        preset.options.validate()?;
    }
    let target = parent.join(file_name);
    let payload = serde_json::to_string_pretty(&ConversionPresetFile { version: 1, presets: presets.to_vec() })
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    fs::write(target, payload).map_err(|error| SevenError::Io(error.to_string()))
}

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
