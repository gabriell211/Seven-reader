use crate::{error::SevenError, pdf::NormalizedRect};
use encoding_rs::WINDOWS_1252;
use lopdf::{dictionary, Dictionary, Document, Object, Stream};
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StampInput {
    pub page_index: usize,
    pub name: String,
    pub category: String,
    pub text: String,
    pub author: String,
    pub image_path: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub fill_color: [f64; 3],
    pub border_color: [f64; 3],
    pub text_color: [f64; 3],
}

#[derive(Debug, Clone, Deserialize)]
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

pub fn add_markup_annotation_normalized(
    input: &Path,
    output: &Path,
    page_index: usize,
    kind: &str,
    author: &str,
    rect: NormalizedRect,
) -> Result<(), SevenError> {
    if !matches!(kind, "highlight" | "underline" | "strikeout") {
        return Err(SevenError::OperationRejected(
            "Marcação visual não suportada".into(),
        ));
    }
    if author.chars().count() > 256 {
        return Err(SevenError::OperationRejected("Autor excede o limite permitido".into()));
    }
    let rect = rect.validated()?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, page_index)?;
    let media = inherited_box(&document, page_id, b"CropBox")
        .or_else(|| inherited_box(&document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let page_width = (media[2] - media[0]).abs().max(1.0);
    let page_height = (media[3] - media[1]).abs().max(1.0);

    let x1 = media[0] + f64::from(rect.x) * page_width;
    let x2 = media[0] + f64::from(rect.x + rect.width) * page_width;
    let y2 = media[1] + (1.0 - f64::from(rect.y)) * page_height;
    let y1 = media[1] + (1.0 - f64::from(rect.y + rect.height)) * page_height;
    let subtype = annotation_subtype(kind)?;

    let contents = match kind {
        "highlight" => "Destaque",
        "underline" => "Sublinhado",
        _ => "Tachado",
    };
    let mut dictionary = dictionary! {
        "Type" => "Annot",
        "Subtype" => subtype,
        "Rect" => vec![x1.into(), y1.into(), x2.into(), y2.into()],
        "QuadPoints" => vec![
            x1.into(), y2.into(),
            x2.into(), y2.into(),
            x1.into(), y1.into(),
            x2.into(), y1.into(),
        ],
        "Contents" => Object::string_literal(contents),
        "T" => Object::string_literal(author),
        "F" => 4,
        "C" => vec![0.96.into(), 0.78.into(), 0.18.into()],
        "CA" => 0.38,
    };
    if kind != "highlight" {
        dictionary.set("C", vec![0.44.into(), 0.26.into(), 0.94.into()]);
        dictionary.set("CA", 0.9);
    }

    let annotation_id = document.add_object(dictionary);
    append_page_annotation(&mut document, page_id, annotation_id)?;
    atomic_save(document, output)
}

fn pdf_text_hex(value: &str) -> String {
    let (encoded, _, _) = WINDOWS_1252.encode(value);
    hex::encode_upper(encoded)
}

fn validate_rgb(color: [f64; 3]) -> Result<[f64; 3], SevenError> {
    if color.iter().all(|component| component.is_finite() && (0.0..=1.0).contains(component)) {
        Ok(color)
    } else {
        Err(SevenError::OperationRejected("Cor do carimbo inválida".into()))
    }
}

fn stamp_appearance(
    document: &mut Document,
    stamp: &StampInput,
) -> Result<(u32, u16), SevenError> {
    let fill = validate_rgb(stamp.fill_color)?;
    let border = validate_rgb(stamp.border_color)?;
    let text_color = validate_rgb(stamp.text_color)?;
    let width = stamp.width;
    let height = stamp.height;

    let font_id = document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica-Bold",
        "Encoding" => "WinAnsiEncoding",
    });

    let mut resources = dictionary! {
        "Font" => dictionary! { "F1" => font_id },
    };
    let mut content = format!(
        "q\n{:.4} {:.4} {:.4} rg\n{:.4} {:.4} {:.4} RG\n1.5 w\n0.75 0.75 {:.3} {:.3} re B\n",
        fill[0], fill[1], fill[2],
        border[0], border[1], border[2],
        (width - 1.5).max(1.0),
        (height - 1.5).max(1.0),
    );

    if let Some(image_path) = stamp.image_path.as_deref().filter(|value| !value.trim().is_empty()) {
        let path = Path::new(image_path);
        if !path.is_file() {
            return Err(SevenError::NotFound(image_path.to_owned()));
        }
        let image_stream = lopdf::xobject::image(path)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let image_id = document.add_object(image_stream);
        resources.set("XObject", dictionary! { "Im0" => image_id });
        let padding = 6.0;
        let image_height = if stamp.text.trim().is_empty() {
            (height - padding * 2.0).max(1.0)
        } else {
            (height * 0.62).max(1.0)
        };
        content.push_str(&format!(
            "q\n{:.3} 0 0 {:.3} {:.3} {:.3} cm\n/Im0 Do\nQ\n",
            (width - padding * 2.0).max(1.0),
            image_height,
            padding,
            height - padding - image_height,
        ));
    }

    let lines = stamp
        .text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(3)
        .collect::<Vec<_>>();
    if !lines.is_empty() {
        let font_size = (height / (lines.len() as f64 + 1.8)).clamp(7.0, 20.0);
        let leading = font_size * 1.18;
        let total_height = leading * lines.len() as f64;
        let start_y = ((height + total_height) / 2.0 - font_size).max(4.0);
        content.push_str(&format!(
            "BT\n/F1 {:.3} Tf\n{:.4} {:.4} {:.4} rg\n",
            font_size, text_color[0], text_color[1], text_color[2],
        ));
        for (index, line) in lines.iter().enumerate() {
            let approx_width = line.chars().count() as f64 * font_size * 0.54;
            let x = ((width - approx_width) / 2.0).max(4.0);
            let y = start_y - index as f64 * leading;
            content.push_str(&format!(
                "1 0 0 1 {:.3} {:.3} Tm\n<{}> Tj\n",
                x, y, pdf_text_hex(line),
            ));
        }
        content.push_str("ET\n");
    }
    content.push_str("Q\n");

    let stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "FormType" => 1,
            "BBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => resources,
        },
        content.into_bytes(),
    );
    Ok(document.add_object(stream))
}

pub fn add_stamp(
    input: &Path,
    output: &Path,
    stamp: StampInput,
) -> Result<(), SevenError> {
    if stamp.name.trim().is_empty() || stamp.name.chars().count() > 120 {
        return Err(SevenError::OperationRejected("Nome do carimbo inválido".into()));
    }
    if stamp.category.chars().count() > 120
        || stamp.text.chars().count() > 2_000
        || stamp.author.chars().count() > 256
    {
        return Err(SevenError::OperationRejected("Dados do carimbo excedem o limite permitido".into()));
    }
    if !stamp.x.is_finite()
        || !stamp.y.is_finite()
        || !stamp.width.is_finite()
        || !stamp.height.is_finite()
        || stamp.width < 12.0
        || stamp.height < 12.0
        || stamp.width > 5_000.0
        || stamp.height > 5_000.0
    {
        return Err(SevenError::OperationRejected("Geometria do carimbo inválida".into()));
    }

    let mut document = Document::load(input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, stamp.page_index)?;
    let appearance_id = stamp_appearance(&mut document, &stamp)?;
    let x2 = stamp.x + stamp.width;
    let y2 = stamp.y + stamp.height;

    let annotation = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Stamp",
        "Rect" => vec![stamp.x.into(), stamp.y.into(), x2.into(), y2.into()],
        "Name" => Object::Name(stamp.name.as_bytes().to_vec()),
        "Contents" => Object::string_literal(&stamp.text),
        "T" => Object::string_literal(&stamp.author),
        "Subj" => Object::string_literal(&stamp.category),
        "F" => 4,
        "C" => vec![stamp.border_color[0].into(), stamp.border_color[1].into(), stamp.border_color[2].into()],
        "AP" => dictionary! { "N" => appearance_id },
        "NM" => Object::string_literal(uuid::Uuid::new_v4().to_string()),
    };

    let annotation_id = document.add_object(annotation);
    append_page_annotation(&mut document, page_id, annotation_id)?;
    atomic_save(document, output)
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
