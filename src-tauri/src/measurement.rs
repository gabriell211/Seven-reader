use crate::error::SevenError;
use encoding_rs::WINDOWS_1252;
use lopdf::{dictionary, Dictionary, Document, Object, Stream};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasurementInput {
    pub page_index: usize,
    pub kind: String,
    pub points: Vec<[f64; 2]>,
    pub points_per_unit: f64,
    pub unit: String,
    pub label: String,
    pub comment: String,
    pub author: String,
    pub line_width: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasurementInfo {
    pub object_id: String,
    pub page_index: usize,
    pub kind: String,
    pub value: f64,
    pub unit: String,
    pub label: String,
    pub comment: String,
    pub author: String,
    pub points: Vec<[f64; 2]>,
}

fn object_text(object: &Object) -> String {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        _ => String::new(),
    }
}

fn number(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some(f64::from(*value)),
        _ => None,
    }
}

fn page_id(document: &Document, page_index: usize) -> Result<(u32, u16), SevenError> {
    document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected(format!("Página {} não existe", page_index + 1)))
}

fn inherited_box(document: &Document, mut id: (u32, u16), key: &[u8]) -> Option<[f64; 4]> {
    for _ in 0..32 {
        let dictionary = document.get_object(id).ok()?.as_dict().ok()?;
        if let Ok(Object::Array(values)) = dictionary.get(key) {
            if values.len() >= 4 {
                return Some([
                    number(&values[0])?,
                    number(&values[1])?,
                    number(&values[2])?,
                    number(&values[3])?,
                ]);
            }
        }
        id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn map_points(
    document: &Document,
    page_id: (u32, u16),
    points: &[[f64; 2]],
) -> Result<Vec<[f64; 2]>, SevenError> {
    let media = inherited_box(document, page_id, b"CropBox")
        .or_else(|| inherited_box(document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let width = (media[2] - media[0]).abs().max(1.0);
    let height = (media[3] - media[1]).abs().max(1.0);
    points
        .iter()
        .map(|point| {
            if !point[0].is_finite()
                || !point[1].is_finite()
                || !(0.0..=1.0).contains(&point[0])
                || !(0.0..=1.0).contains(&point[1])
            {
                return Err(SevenError::OperationRejected(
                    "Ponto normalizado da medição é inválido".into(),
                ));
            }
            Ok([
                media[0] + point[0] * width,
                media[1] + (1.0 - point[1]) * height,
            ])
        })
        .collect()
}

fn distance(points: &[[f64; 2]]) -> f64 {
    points
        .windows(2)
        .map(|pair| {
            let dx = pair[1][0] - pair[0][0];
            let dy = pair[1][1] - pair[0][1];
            (dx * dx + dy * dy).sqrt()
        })
        .sum()
}

fn polygon_area(points: &[[f64; 2]]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    let mut sum = 0.0;
    for index in 0..points.len() {
        let next = (index + 1) % points.len();
        sum += points[index][0] * points[next][1] - points[next][0] * points[index][1];
    }
    sum.abs() * 0.5
}

fn formatted_value(value: f64, unit: &str, area: bool) -> String {
    if area {
        format!("{value:.3} {unit}²")
    } else {
        format!("{value:.3} {unit}")
    }
}

fn number_format(unit: &str, conversion: f64) -> Object {
    Object::Dictionary(dictionary! {
        "Type" => "NumberFormat",
        "U" => Object::string_literal(unit),
        "C" => conversion,
        "D" => 3,
        "FD" => true,
    })
}

fn measure_dictionary(points_per_unit: f64, unit: &str) -> Dictionary {
    let conversion = 1.0 / points_per_unit;
    let area_unit = format!("{unit}²");
    dictionary! {
        "Type" => "Measure",
        "Subtype" => "RL",
        "R" => Object::string_literal(format!("{points_per_unit:.6} pt = 1 {unit}")),
        "X" => vec![number_format(unit, conversion)],
        "D" => vec![number_format(unit, conversion)],
        "A" => vec![number_format(&area_unit, conversion * conversion)],
        "O" => vec![0.into(), 0.into()],
    }
}

fn pdf_text_hex(value: &str) -> String {
    let (encoded, _, _) = WINDOWS_1252.encode(value);
    hex::encode_upper(encoded)
}

fn appearance_stream(
    document: &mut Document,
    points: &[[f64; 2]],
    rect: [f64; 4],
    kind: &str,
    label: &str,
    line_width: f64,
) -> (u32, u16) {
    let width = (rect[2] - rect[0]).max(1.0);
    let height = (rect[3] - rect[1]).max(1.0);
    let local = points
        .iter()
        .map(|point| [point[0] - rect[0], point[1] - rect[1]])
        .collect::<Vec<_>>();

    let font_id = document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });

    let mut content = format!(
        "q\n0.35 0.20 0.85 RG\n{:.3} w\n",
        line_width
    );
    if kind == "area" {
        content.push_str("0.91 0.88 1 rg\n");
    }
    if let Some(first) = local.first() {
        content.push_str(&format!("{:.3} {:.3} m\n", first[0], first[1]));
        for point in local.iter().skip(1) {
            content.push_str(&format!("{:.3} {:.3} l\n", point[0], point[1]));
        }
        if kind == "area" {
            content.push_str("h B\n");
        } else {
            content.push_str("S\n");
        }
    }

    if !label.trim().is_empty() {
        let font_size = 9.0;
        let approx = label.chars().count() as f64 * font_size * 0.5;
        let x = ((width - approx) / 2.0).max(3.0);
        let y = (height - 12.0).max(3.0);
        content.push_str(&format!(
            "BT\n/F1 {font_size:.1} Tf\n0.22 0.18 0.35 rg\n1 0 0 1 {x:.3} {y:.3} Tm\n<{}> Tj\nET\n",
            pdf_text_hex(label)
        ));
    }
    content.push_str("Q\n");

    document.add_object(Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "FormType" => 1,
            "BBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } },
        },
        content.into_bytes(),
    ))
}

fn append_annotation(
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

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-measure.tmp.pdf");
    document.compress();
    document
        .save(&temp)
        .map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}

pub fn add_measurement(
    input: &Path,
    output: &Path,
    measurement: MeasurementInput,
) -> Result<f64, SevenError> {
    if !matches!(measurement.kind.as_str(), "distance" | "perimeter" | "area") {
        return Err(SevenError::OperationRejected("Tipo de medição inválido".into()));
    }
    let minimum = if measurement.kind == "distance" { 2 } else { 3 };
    if measurement.points.len() < minimum || measurement.points.len() > 10_000 {
        return Err(SevenError::OperationRejected(format!(
            "A medição exige entre {minimum} e 10.000 pontos"
        )));
    }
    if measurement.kind == "distance" && measurement.points.len() != 2 {
        return Err(SevenError::OperationRejected(
            "Distância exige exatamente dois pontos".into(),
        ));
    }
    if !measurement.points_per_unit.is_finite()
        || measurement.points_per_unit <= 0.0
        || measurement.points_per_unit > 1_000_000_000.0
        || measurement.unit.trim().is_empty()
        || measurement.unit.chars().count() > 16
    {
        return Err(SevenError::OperationRejected("Escala/unidade inválida".into()));
    }
    if !(0.5..=24.0).contains(&measurement.line_width)
        || measurement.author.chars().count() > 256
        || measurement.label.chars().count() > 512
        || measurement.comment.chars().count() > 4_000
    {
        return Err(SevenError::OperationRejected("Propriedades da medição inválidas".into()));
    }

    let mut document = Document::load(input)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, measurement.page_index)?;
    let points = map_points(&document, page_id, &measurement.points)?;

    let user_space_value = if measurement.kind == "area" {
        polygon_area(&points)
    } else if measurement.kind == "perimeter" {
        distance(&points)
            + {
                let first = points.first().unwrap();
                let last = points.last().unwrap();
                let dx = first[0] - last[0];
                let dy = first[1] - last[1];
                (dx * dx + dy * dy).sqrt()
            }
    } else {
        distance(&points)
    };
    let value = if measurement.kind == "area" {
        user_space_value / (measurement.points_per_unit * measurement.points_per_unit)
    } else {
        user_space_value / measurement.points_per_unit
    };

    let display_value = formatted_value(
        value,
        measurement.unit.trim(),
        measurement.kind == "area",
    );
    let label = if measurement.label.trim().is_empty() {
        display_value.clone()
    } else {
        format!("{} · {}", measurement.label.trim(), display_value)
    };

    let padding = 12.0;
    let min_x = points.iter().map(|p| p[0]).fold(f64::MAX, f64::min);
    let min_y = points.iter().map(|p| p[1]).fold(f64::MAX, f64::min);
    let max_x = points.iter().map(|p| p[0]).fold(f64::MIN, f64::max);
    let max_y = points.iter().map(|p| p[1]).fold(f64::MIN, f64::max);
    let rect = [
        min_x - padding,
        min_y - padding,
        max_x + padding,
        max_y + padding + 14.0,
    ];
    let appearance = appearance_stream(
        &mut document,
        &points,
        rect,
        &measurement.kind,
        &label,
        measurement.line_width,
    );
    let measure = Object::Dictionary(measure_dictionary(
        measurement.points_per_unit,
        measurement.unit.trim(),
    ));
    let vertices = points
        .iter()
        .flat_map(|point| [Object::Real(point[0] as f32), Object::Real(point[1] as f32)])
        .collect::<Vec<_>>();

    let mut annotation = dictionary! {
        "Type" => "Annot",
        "Rect" => rect.into_iter().map(Object::from).collect::<Vec<_>>(),
        "Contents" => Object::string_literal(if measurement.comment.trim().is_empty() { &label } else { measurement.comment.trim() }),
        "T" => Object::string_literal(&measurement.author),
        "Subj" => Object::string_literal("SevenMeasurement"),
        "F" => 4,
        "C" => vec![0.35.into(), 0.20.into(), 0.85.into()],
        "BS" => dictionary! { "Type" => "Border", "W" => measurement.line_width, "S" => "S" },
        "Measure" => measure,
        "AP" => dictionary! { "N" => appearance },
        "NM" => Object::string_literal(uuid::Uuid::new_v4().to_string()),
        "SevenMeasureKind" => Object::string_literal(&measurement.kind),
        "SevenMeasureValue" => value,
        "SevenMeasureUnit" => Object::string_literal(measurement.unit.trim()),
        "SevenMeasureLabel" => Object::string_literal(measurement.label.trim()),
        "SevenMeasureComment" => Object::string_literal(measurement.comment.trim()),
    };

    if measurement.kind == "distance" {
        annotation.set("Subtype", "Line");
        annotation.set("L", vertices);
        annotation.set("IT", "LineDimension");
        annotation.set("Cap", true);
        annotation.set("CP", "Top");
        annotation.set("LE", vec![Object::Name(b"None".to_vec()), Object::Name(b"None".to_vec())]);
    } else {
        annotation.set("Subtype", if measurement.kind == "area" { "Polygon" } else { "PolyLine" });
        annotation.set("Vertices", vertices);
        annotation.set(
            "IT",
            if measurement.kind == "area" { "PolygonDimension" } else { "PolyLineDimension" },
        );
        if measurement.kind == "area" {
            annotation.set("IC", vec![0.91.into(), 0.88.into(), 1.0.into()]);
            annotation.set("CA", 0.35);
        }
    }

    let annotation_id = document.add_object(annotation);
    append_annotation(&mut document, page_id, annotation_id)?;
    atomic_save(document, output)?;
    Ok(value)
}

pub fn list_measurements(path: &Path) -> Result<Vec<MeasurementInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut output = Vec::new();
    for (page_number, page_id) in document.get_pages() {
        let Ok(page) = document.get_object(page_id).and_then(Object::as_dict) else { continue };
        let Ok(Object::Array(annots)) = page.get(b"Annots") else { continue };
        for entry in annots {
            let Ok(id) = entry.as_reference() else { continue };
            let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { continue };
            if dictionary.get(b"Subj").ok().map(object_text).as_deref() != Some("SevenMeasurement") {
                continue;
            }
            let kind = dictionary.get(b"SevenMeasureKind").ok().map(object_text).unwrap_or_default();
            let value = dictionary.get(b"SevenMeasureValue").ok().and_then(number).unwrap_or(0.0);
            let unit = dictionary.get(b"SevenMeasureUnit").ok().map(object_text).unwrap_or_default();
            let label = dictionary.get(b"SevenMeasureLabel").ok().map(object_text).unwrap_or_default();
            let comment = dictionary.get(b"SevenMeasureComment").ok().map(object_text).unwrap_or_default();
            let author = dictionary.get(b"T").ok().map(object_text).unwrap_or_default();
            let coordinates = if kind == "distance" {
                dictionary.get(b"L").ok().and_then(|value| value.as_array().ok()).cloned()
            } else {
                dictionary.get(b"Vertices").ok().and_then(|value| value.as_array().ok()).cloned()
            }.unwrap_or_default();
            let mut points = Vec::new();
            for pair in coordinates.chunks(2) {
                if pair.len() == 2 {
                    if let (Some(x), Some(y)) = (number(&pair[0]), number(&pair[1])) {
                        points.push([x, y]);
                    }
                }
            }
            output.push(MeasurementInfo {
                object_id: format!("{}:{}", id.0, id.1),
                page_index: page_number.saturating_sub(1) as usize,
                kind,
                value,
                unit,
                label,
                comment,
                author,
                points,
            });
        }
    }
    Ok(output)
}

fn csv_cell(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

pub fn export_measurements(path: &Path, destination: &Path) -> Result<usize, SevenError> {
    let values = list_measurements(path)?;
    let mut csv = String::from("page,kind,value,unit,label,comment,author\n");
    for item in &values {
        csv.push_str(&format!(
            "{},{},{:.6},{},{},{},{}\n",
            item.page_index + 1,
            csv_cell(&item.kind),
            item.value,
            csv_cell(&item.unit),
            csv_cell(&item.label),
            csv_cell(&item.comment),
            csv_cell(&item.author),
        ));
    }
    fs::write(destination, csv).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(values.len())
}
