use crate::{
    error::SevenError,
    pdf,
    state::{AppState, OpenDocument},
};
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOptions {
    pub language: String,
    pub deskew: bool,
    pub rotate_pages: bool,
    pub output_type: String,
    pub mode: String,
    pub sidecar: Option<String>,
    pub page_range: Option<String>,
    pub clean: bool,
    pub clean_final: bool,
    pub remove_background: bool,
    pub oversample: Option<u16>,
    pub optimize: u8,
    pub rotate_pages_threshold: f32,
}

impl OcrOptions {
    pub fn validated(&self) -> Result<(), SevenError> {
        if self.language.is_empty()
            || self.language.len() > 80
            || !self
                .language
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || matches!(character, '+' | '_' | '-'))
        {
            return Err(SevenError::OperationRejected("Idioma OCR inválido".into()));
        }
        if !matches!(self.output_type.as_str(), "auto" | "pdf" | "pdfa" | "pdfa-1" | "pdfa-2" | "pdfa-3") {
            return Err(SevenError::OperationRejected("Tipo de saída OCR inválido".into()));
        }
        if !matches!(self.mode.as_str(), "skip" | "redo" | "force") {
            return Err(SevenError::OperationRejected("Modo OCR inválido".into()));
        }
        if let Some(range) = &self.page_range {
            let range = range.trim();
            if range.is_empty()
                || range.len() > 512
                || !range.chars().all(|character| character.is_ascii_digit() || matches!(character, ',' | '-'))
                || range.starts_with('-')
                || range.ends_with('-')
                || range.contains("--")
            {
                return Err(SevenError::OperationRejected("Intervalo OCR inválido".into()));
            }
        }
        if let Some(dpi) = self.oversample {
            if !(72..=1200).contains(&dpi) {
                return Err(SevenError::OperationRejected("Oversample deve ficar entre 72 e 1200 DPI".into()));
            }
        }
        if self.optimize > 3 {
            return Err(SevenError::OperationRejected("Nível de otimização OCR deve ficar entre 0 e 3".into()));
        }
        if !(0.0..=100.0).contains(&self.rotate_pages_threshold) {
            return Err(SevenError::OperationRejected("Threshold de rotação deve ficar entre 0 e 100".into()));
        }
        Ok(())
    }

    pub fn args(&self, input: &str, output: &str) -> Result<Vec<String>, SevenError> {
        self.validated()?;
        let mut args = vec![
            "--output-type".into(),
            self.output_type.clone(),
            "-l".into(),
            self.language.clone(),
        ];
        if self.deskew {
            args.push("--deskew".into());
        }
        if self.rotate_pages {
            args.push("--rotate-pages".into());
            args.push("--rotate-pages-threshold".into());
            args.push(format!("{:.2}", self.rotate_pages_threshold));
        }
        if self.clean {
            args.push("--clean".into());
        }
        if self.clean_final {
            args.push("--clean-final".into());
        }
        if self.remove_background {
            args.push("--remove-background".into());
        }
        if let Some(dpi) = self.oversample {
            args.push("--oversample".into());
            args.push(dpi.to_string());
        }
        args.push("--optimize".into());
        args.push(self.optimize.to_string());
        if let Some(range) = &self.page_range {
            args.push("--pages".into());
            args.push(range.trim().into());
        }
        args.push(match self.mode.as_str() {
            "redo" => "--redo-ocr".into(),
            "force" => "--force-ocr".into(),
            _ => "--skip-text".into(),
        });
        if let Some(sidecar) = &self.sidecar {
            if !sidecar.trim().is_empty() {
                args.push("--sidecar".into());
                args.push(sidecar.clone());
            }
        }
        args.push(input.into());
        args.push(output.into());
        Ok(args)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrWord {
    pub text: String,
    pub confidence: f32,
    pub left: u32,
    pub top: u32,
    pub width: u32,
    pub height: u32,
}

pub fn review_page(
    state: &AppState,
    document: &OpenDocument,
    page_index: usize,
    language: &str,
    threshold: f32,
) -> Result<Vec<OcrWord>, SevenError> {
    if !(0.0..=100.0).contains(&threshold) {
        return Err(SevenError::OperationRejected(
            "Confidence threshold deve ficar entre 0 e 100".into(),
        ));
    }
    if language.is_empty()
        || !language
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '+' | '_' | '-'))
    {
        return Err(SevenError::OperationRejected("Idioma OCR inválido".into()));
    }

    let rendered = pdf::render_page(state, document, page_index, 2400)?;
    let executable = which::which("tesseract")
        .map_err(|_| SevenError::CapabilityUnavailable("Tesseract".into()))?;

    let output = Command::new(executable)
        .arg(&rendered.cache_path)
        .arg("stdout")
        .arg("-l")
        .arg(language)
        .arg("tsv")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    if !output.status.success() {
        return Err(SevenError::Operation(format!(
            "Tesseract encerrou com código {:?}",
            output.status.code()
        )));
    }

    let text = String::from_utf8(output.stdout)
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let mut words = Vec::new();

    for line in text.lines().skip(1) {
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() < 12 {
            continue;
        }
        let word = columns[11].trim();
        if word.is_empty() {
            continue;
        }
        let confidence = columns[10].parse::<f32>().unwrap_or(-1.0);
        if confidence < 0.0 || confidence >= threshold {
            continue;
        }
        words.push(OcrWord {
            text: word.to_owned(),
            confidence,
            left: columns[6].parse().unwrap_or(0),
            top: columns[7].parse().unwrap_or(0),
            width: columns[8].parse().unwrap_or(0),
            height: columns[9].parse().unwrap_or(0),
        });
    }

    words.sort_by(|left, right| {
        left.confidence
            .partial_cmp(&right.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(words)
}
