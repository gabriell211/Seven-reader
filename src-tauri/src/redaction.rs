use crate::{
    capabilities::bind_pdfium,
    error::SevenError,
    state::AppState,
};
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactionArea {
    pub page_index: usize,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub source_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactionReport {
    pub areas_applied: usize,
    pub objects_removed: usize,
    pub annotations_removed: usize,
    pub verified_areas: usize,
    pub verification_passed: bool,
    pub output: String,
}

fn area_rect(area: &RedactionArea) -> Result<PdfRect, SevenError> {
    if area.width <= 0.0 || area.height <= 0.0 {
        return Err(SevenError::OperationRejected("Área de redação inválida".into()));
    }
    Ok(PdfRect::new_from_values(
        area.y,
        area.x,
        area.y + area.height,
        area.x + area.width,
    ))
}

pub fn find_text_matches(
    state: &AppState,
    path: &Path,
    query: &str,
    match_case: bool,
    whole_word: bool,
) -> Result<Vec<RedactionArea>, SevenError> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 1024 {
        return Err(SevenError::OperationRejected("Texto de busca inválido".into()));
    }
    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut results = Vec::new();

    for (page_index, page) in document.pages().iter().enumerate() {
        let text = page.text().map_err(|error| SevenError::Operation(error.to_string()))?;
        let options = PdfSearchOptions::new()
            .match_case(match_case)
            .match_whole_word(whole_word);
        let search = text
            .search(query, &options)
            .map_err(|error| SevenError::Operation(error.to_string()))?;

        for segment in search.iter() {
            let bounds = segment.bounds();
            results.push(RedactionArea {
                page_index,
                x: bounds.left().value,
                y: bounds.bottom().value,
                width: bounds.width().value,
                height: bounds.height().value,
                source_text: Some(segment.text()),
            });
            if results.len() >= 10_000 {
                return Err(SevenError::OperationRejected(
                    "Busca excedeu 10.000 ocorrências; refine o termo antes de redigir".into(),
                ));
            }
        }
    }

    Ok(results)
}

fn verify_redacted_text(
    state: &AppState,
    output: &Path,
    areas: &[RedactionArea],
) -> Result<usize, SevenError> {
    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let document = pdfium
        .load_pdf_from_file(output, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;

    let mut verified = 0usize;
    for area in areas {
        let Some(source_text) = area
            .source_text
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let page = document
            .pages()
            .get(area.page_index as PdfPageIndex)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let text = page
            .text()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let search = text
            .search(
                source_text,
                &PdfSearchOptions::new().match_case(true).match_whole_word(false),
            )
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let redacted_rect = area_rect(area)?;
        let still_present = search
            .iter()
            .any(|segment| segment.bounds().does_overlap(&redacted_rect));
        if still_present {
            return Err(SevenError::OperationRejected(format!(
                "Verificação pós-redação falhou na página {}: conteúdo ainda é recuperável na área marcada",
                area.page_index + 1,
            )));
        }
        verified += 1;
    }
    Ok(verified)
}

pub fn apply_redactions(
    state: &AppState,
    input: &Path,
    output: &Path,
    areas: &[RedactionArea],
) -> Result<RedactionReport, SevenError> {
    if areas.is_empty() || areas.len() > 10_000 {
        return Err(SevenError::OperationRejected(
            "Selecione entre 1 e 10.000 áreas de redação".into(),
        ));
    }

    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let mut document = pdfium
        .load_pdf_from_file(input, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;

    let mut objects_removed = 0usize;
    let mut annotations_removed = 0usize;

    for area in areas {
        let rect = area_rect(area)?;
        let mut page = document
            .pages_mut()
            .get(area.page_index as PdfPageIndex)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        page.set_content_regeneration_strategy(PdfPageContentRegenerationStrategy::Manual);

        {
            let objects = page.objects_mut();
            let len = objects.len();
            for index in (0..len).rev() {
                let overlaps = {
                    let object = objects
                        .get(index)
                        .map_err(|error| SevenError::Operation(error.to_string()))?;
                    object.does_overlap_rect(&rect)
                };
                if overlaps {
                    objects
                        .remove_object_at_index(index)
                        .map_err(|error| SevenError::Operation(error.to_string()))?;
                    objects_removed += 1;
                }
            }
            objects
                .create_path_object_rect(rect, None, None, Some(PdfColor::BLACK))
                .map_err(|error| SevenError::Operation(error.to_string()))?;
        }

        {
            let annotations = page.annotations_mut();
            let len = annotations.len();
            for index in (0..len).rev() {
                let overlaps = {
                    let annotation = annotations
                        .get(index)
                        .map_err(|error| SevenError::Operation(error.to_string()))?;
                    annotation
                        .bounds()
                        .map(|bounds| bounds.does_overlap(&rect))
                        .unwrap_or(false)
                };
                if overlaps {
                    let annotation = annotations
                        .get(index)
                        .map_err(|error| SevenError::Operation(error.to_string()))?;
                    annotations
                        .delete_annotation(annotation)
                        .map_err(|error| SevenError::Operation(error.to_string()))?;
                    annotations_removed += 1;
                }
            }
        }

        page.regenerate_content()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
    }

    let temp = output.with_extension("seven-redact.tmp.pdf");
    document
        .save_to_file(&temp)
        .map_err(|error| SevenError::Io(error.to_string()))?;
    lopdf::Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))?;

    let verified_areas = match verify_redacted_text(state, output, areas) {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_file(output);
            return Err(error);
        }
    };

    Ok(RedactionReport {
        areas_applied: areas.len(),
        objects_removed,
        annotations_removed,
        verified_areas,
        verification_passed: true,
        output: output.to_string_lossy().into_owned(),
    })
}
