use crate::error::SevenError;
use lopdf::{dictionary, Dictionary, Document, Object};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationInput {
    pub page_index: usize,
    pub kind: String,
    pub text: String,
    pub author: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InkAnnotationInput {
    pub page_index: usize,
    pub author: String,
    pub points: Vec<[f64; 2]>,
    pub line_width: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationInfo {
    pub object_id: String,
    pub page_index: usize,
    pub kind: String,
    pub text: String,
    pub author: String,
    pub rect: [f64; 4],
}

fn page_id(document: &Document, page_index: usize) -> Result<(u32, u16), SevenError> {
    document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected(format!("Página {} não existe", page_index + 1)))
}

fn text_value(object: &Object) -> String {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        _ => String::new(),
    }
}

fn number_value(object: &Object) -> f64 {
    match object {
        Object::Integer(value) => *value as f64,
        Object::Real(value) => f64::from(*value),
        _ => 0.0,
    }
}

fn annotation_subtype(kind: &str) -> Result<&'static str, SevenError> {
    match kind {
        "note" => Ok("Text"),
        "highlight" => Ok("Highlight"),
        "underline" => Ok("Underline"),
        "strikeout" => Ok("StrikeOut"),
        "stamp" => Ok("Stamp"),
        "freetext" => Ok("FreeText"),
        _ => Err(SevenError::OperationRejected("Tipo de comentário não suportado".into())),
    }
}

pub fn add_annotation(input: &Path, output: &Path, annotation: AnnotationInput) -> Result<(), SevenError> {
    if annotation.text.chars().count() > 10_000 || annotation.author.chars().count() > 256 {
        return Err(SevenError::OperationRejected("Comentário excede o limite permitido".into()));
    }
    if annotation.width <= 0.0 || annotation.height <= 0.0 {
        return Err(SevenError::OperationRejected("Área do comentário inválida".into()));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, annotation.page_index)?;
    let subtype = annotation_subtype(&annotation.kind)?;
    let x2 = annotation.x + annotation.width;
    let y2 = annotation.y + annotation.height;

    let mut dictionary = dictionary! {
        "Type" => "Annot",
        "Subtype" => subtype,
        "Rect" => vec![annotation.x.into(), annotation.y.into(), x2.into(), y2.into()],
        "Contents" => Object::string_literal(annotation.text),
        "T" => Object::string_literal(annotation.author),
        "F" => 4,
        "C" => vec![0.44.into(), 0.26.into(), 0.94.into()],
    };

    if matches!(annotation.kind.as_str(), "highlight" | "underline" | "strikeout") {
        dictionary.set(
            "QuadPoints",
            vec![
                annotation.x.into(), y2.into(),
                x2.into(), y2.into(),
                annotation.x.into(), annotation.y.into(),
                x2.into(), annotation.y.into(),
            ],
        );
    }
    if annotation.kind == "stamp" {
        dictionary.set("Name", "Approved");
    }
    if annotation.kind == "freetext" {
        dictionary.set("DA", Object::string_literal("/Helv 10 Tf 0.2 0.2 0.2 rg"));
    }

    let annotation_id = document.add_object(dictionary);
    append_page_annotation(&mut document, page_id, annotation_id)?;
    atomic_save(document, output)
}

fn inherited_box(document: &Document, mut id: (u32, u16), key: &[u8]) -> Option<[f64; 4]> {
    for _ in 0..32 {
        let dictionary = document.get_object(id).ok()?.as_dict().ok()?;
        if let Ok(Object::Array(values)) = dictionary.get(key) {
            if values.len() >= 4 {
                let mut result = [0.0; 4];
                for (index, value) in values.iter().take(4).enumerate() {
                    result[index] = number_value(value);
                }
                return Some(result);
            }
        }
        id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

pub fn add_ink_annotation(
    input: &Path,
    output: &Path,
    ink: InkAnnotationInput,
) -> Result<(), SevenError> {
    if ink.author.chars().count() > 256 {
        return Err(SevenError::OperationRejected("Autor excede o limite permitido".into()));
    }
    if ink.points.len() < 2 || ink.points.len() > 20_000 {
        return Err(SevenError::OperationRejected(
            "O traço deve conter entre 2 e 20.000 pontos".into(),
        ));
    }
    if !(0.5..=24.0).contains(&ink.line_width) {
        return Err(SevenError::OperationRejected(
            "Espessura do traço deve ficar entre 0,5 e 24 pontos".into(),
        ));
    }
    if ink.points.iter().any(|point| {
        !point[0].is_finite()
            || !point[1].is_finite()
            || !(0.0..=1.0).contains(&point[0])
            || !(0.0..=1.0).contains(&point[1])
    }) {
        return Err(SevenError::OperationRejected(
            "Coordenadas normalizadas do desenho são inválidas".into(),
        ));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, ink.page_index)?;
    let media = inherited_box(&document, page_id, b"CropBox")
        .or_else(|| inherited_box(&document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let page_width = (media[2] - media[0]).abs().max(1.0);
    let page_height = (media[3] - media[1]).abs().max(1.0);

    let mut mapped = Vec::with_capacity(ink.points.len() * 2);
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;

    for [nx, ny] in ink.points {
        let x = media[0] + nx * page_width;
        let y = media[1] + (1.0 - ny) * page_height;
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
        mapped.push(Object::Real(x as f32));
        mapped.push(Object::Real(y as f32));
    }

    let padding = ink.line_width.max(2.0);
    let annotation = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Ink",
        "Rect" => vec![
            (min_x - padding).into(),
            (min_y - padding).into(),
            (max_x + padding).into(),
            (max_y + padding).into(),
        ],
        "InkList" => vec![Object::Array(mapped)],
        "T" => Object::string_literal(ink.author),
        "Contents" => Object::string_literal("Desenho à mão livre"),
        "F" => 4,
        "C" => vec![0.44.into(), 0.26.into(), 0.94.into()],
        "BS" => dictionary! {
            "Type" => "Border",
            "W" => ink.line_width,
            "S" => "S",
        },
    };

    let annotation_id = document.add_object(annotation);
    append_page_annotation(&mut document, page_id, annotation_id)?;
    atomic_save(document, output)
}

fn append_page_annotation(
    document: &mut Document,
    page_id: (u32, u16),
    annotation_id: (u32, u16),
) -> Result<(), SevenError> {
    let page = document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    match page.get_mut(b"Annots") {
        Ok(Object::Array(values)) => values.push(annotation_id.into()),
        Ok(_) => return Err(SevenError::Operation("Estrutura /Annots não suportada".into())),
        Err(_) => page.set("Annots", vec![annotation_id.into()]),
    }
    Ok(())
}

pub fn list_annotations(path: &Path) -> Result<Vec<AnnotationInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let pages = document.get_pages();
    let mut output = Vec::new();

    for (page_number, page_id) in pages {
        let page = document
            .get_object(page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let Ok(Object::Array(annots)) = page.get(b"Annots") else { continue };

        for entry in annots {
            let Ok(id) = entry.as_reference() else { continue };
            let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { continue };
            let kind = dictionary
                .get(b"Subtype")
                .ok()
                .and_then(|object| object.as_name().ok())
                .map(|value| String::from_utf8_lossy(value).into_owned())
                .unwrap_or_else(|| "Unknown".into());
            let text = dictionary.get(b"Contents").ok().map(text_value).unwrap_or_default();
            let author = dictionary.get(b"T").ok().map(text_value).unwrap_or_default();
            let rect = dictionary
                .get(b"Rect")
                .ok()
                .and_then(|object| object.as_array().ok())
                .map(|values| {
                    let mut rect = [0.0; 4];
                    for (index, value) in values.iter().take(4).enumerate() {
                        rect[index] = number_value(value);
                    }
                    rect
                })
                .unwrap_or([0.0; 4]);

            output.push(AnnotationInfo {
                object_id: format!("{}:{}", id.0, id.1),
                page_index: page_number.saturating_sub(1) as usize,
                kind,
                text,
                author,
                rect,
            });
        }
    }
    Ok(output)
}

pub fn delete_annotation(input: &Path, output: &Path, object_id: &str) -> Result<(), SevenError> {
    let (object_number, generation) = object_id
        .split_once(':')
        .ok_or_else(|| SevenError::OperationRejected("ID de comentário inválido".into()))?;
    let target = (
        object_number.parse::<u32>().map_err(|_| SevenError::OperationRejected("ID inválido".into()))?,
        generation.parse::<u16>().map_err(|_| SevenError::OperationRejected("ID inválido".into()))?,
    );

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_ids = document.get_pages().values().copied().collect::<Vec<_>>();
    for page_id in page_ids {
        let page = document
            .get_object_mut(page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        if let Ok(Object::Array(values)) = page.get_mut(b"Annots") {
            values.retain(|entry| entry.as_reference().ok() != Some(target));
        }
    }
    document.objects.remove(&target);
    atomic_save(document, output)
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-annotation.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}
