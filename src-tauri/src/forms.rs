use crate::error::SevenError;
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormFieldInfo {
    pub object_id: String,
    pub name: String,
    pub field_type: String,
    pub value: String,
    pub default_value: String,
    pub tooltip: String,
    pub required: bool,
    pub read_only: bool,
    pub multiline: bool,
    pub max_length: Option<u32>,
    pub page_index: Option<usize>,
    pub rect: Option<[f64; 4]>,
    pub options: Vec<String>,
    pub border_color: Option<[f64; 3]>,
    pub fill_color: Option<[f64; 3]>,
    pub border_width: f64,
    pub border_style: String,
    pub font_size: f64,
    pub text_color: [f64; 3],
    pub rotation: i32,
    pub visibility: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormValue {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFormField {
    pub name: String,
    pub field_type: String,
    pub page_index: usize,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub required: bool,
    pub read_only: bool,
    pub multiline: bool,
    pub max_length: Option<u32>,
    pub tooltip: String,
    pub default_value: String,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormFieldUpdate {
    pub object_id: String,
    pub name: String,
    pub tooltip: String,
    pub default_value: String,
    pub required: bool,
    pub read_only: bool,
    pub multiline: bool,
    pub max_length: Option<u32>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub options: Vec<String>,
    pub border_color: Option<[f64; 3]>,
    pub fill_color: Option<[f64; 3]>,
    pub border_width: f64,
    pub border_style: String,
    pub font_size: f64,
    pub text_color: [f64; 3],
    pub rotation: i32,
    pub visibility: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFieldRequest {
    pub object_id: String,
    pub page_start: usize,
    pub page_end: usize,
    pub rows: u16,
    pub columns: u16,
    pub gap_x: f64,
    pub gap_y: f64,
    pub offset_x: f64,
    pub offset_y: f64,
}

fn object_text(object: &Object) -> String {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        Object::Integer(value) => value.to_string(),
        Object::Boolean(value) => value.to_string(),
        _ => String::new(),
    }
}

fn field_type_name(dictionary: &Dictionary) -> String {
    let flags = dictionary.get(b"Ff").ok().and_then(|value| value.as_i64().ok()).unwrap_or(0);
    dictionary
        .get(b"FT")
        .ok()
        .and_then(|object| object.as_name().ok())
        .map(|name| match name {
            b"Tx" => "text",
            b"Btn" if flags & (1i64 << 16) != 0 => "button",
            b"Btn" if flags & (1i64 << 15) != 0 => "radio",
            b"Btn" => "checkbox",
            b"Ch" if flags & (1i64 << 17) != 0 => "dropdown",
            b"Ch" => "list",
            b"Sig" => "signature",
            _ => "unknown",
        })
        .unwrap_or("unknown")
        .to_owned()
}

fn collect_field_ids(document: &Document, object: &Object, output: &mut Vec<ObjectId>) {
    match object {
        Object::Reference(id) => {
            output.push(*id);
            if let Ok(dictionary) = document.get_object(*id).and_then(Object::as_dict) {
                if let Ok(Object::Array(kids)) = dictionary.get(b"Kids") {
                    for kid in kids {
                        collect_field_ids(document, kid, output);
                    }
                }
            }
        }
        Object::Array(values) => {
            for value in values {
                collect_field_ids(document, value, output);
            }
        }
        _ => {}
    }
}

fn parse_object_id(value: &str) -> Result<ObjectId, SevenError> {
    let (object, generation) = value
        .split_once(':')
        .ok_or_else(|| SevenError::OperationRejected("ID do campo inválido".into()))?;
    Ok((
        object.parse::<u32>().map_err(|_| SevenError::OperationRejected("ID do campo inválido".into()))?,
        generation.parse::<u16>().map_err(|_| SevenError::OperationRejected("ID do campo inválido".into()))?,
    ))
}

fn field_page_index(document: &Document, dictionary: &Dictionary) -> Option<usize> {
    let page_id = dictionary.get(b"P").ok()?.as_reference().ok()?;
    document
        .get_pages()
        .into_iter()
        .find_map(|(number, id)| (id == page_id).then_some(number.saturating_sub(1) as usize))
}

fn rect_value(dictionary: &Dictionary) -> Option<[f64; 4]> {
    let values = dictionary.get(b"Rect").ok()?.as_array().ok()?;
    if values.len() < 4 { return None; }
    let mut rect = [0.0; 4];
    for (index, value) in values.iter().take(4).enumerate() {
        rect[index] = match value {
            Object::Integer(value) => *value as f64,
            Object::Real(value) => f64::from(*value),
            _ => return None,
        };
    }
    Some(rect)
}

fn field_options(dictionary: &Dictionary) -> Vec<String> {
    let Ok(Object::Array(values)) = dictionary.get(b"Opt") else { return Vec::new() };
    values.iter().map(object_text).filter(|value| !value.is_empty()).collect()
}

fn color_array(object: Option<&Object>) -> Option<[f64; 3]> {
    let values = object?.as_array().ok()?;
    if values.len() < 3 { return None; }
    let component = |value: &Object| -> Option<f64> {
        match value {
            Object::Integer(value) => Some(*value as f64),
            Object::Real(value) => Some(f64::from(*value)),
            _ => None,
        }
    };
    Some([
        component(&values[0])?,
        component(&values[1])?,
        component(&values[2])?,
    ])
}

fn appearance_info(dictionary: &Dictionary) -> (
    Option<[f64; 3]>,
    Option<[f64; 3]>,
    f64,
    String,
    f64,
    [f64; 3],
    i32,
    String,
) {
    let mk = dictionary
        .get(b"MK")
        .ok()
        .and_then(|object| object.as_dict().ok());
    let bs = dictionary
        .get(b"BS")
        .ok()
        .and_then(|object| object.as_dict().ok());

    let border_color = mk.and_then(|value| color_array(value.get(b"BC").ok()));
    let fill_color = mk.and_then(|value| color_array(value.get(b"BG").ok()));
    let rotation = mk
        .and_then(|value| value.get(b"R").ok())
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(0) as i32;
    let border_width = bs
        .and_then(|value| value.get(b"W").ok())
        .and_then(|value| match value {
            Object::Integer(value) => Some(*value as f64),
            Object::Real(value) => Some(f64::from(*value)),
            _ => None,
        })
        .unwrap_or(1.0);
    let border_style = bs
        .and_then(|value| value.get(b"S").ok())
        .and_then(|value| value.as_name().ok())
        .map(|name| String::from_utf8_lossy(name).into_owned())
        .unwrap_or_else(|| "S".into());

    let da = dictionary.get(b"DA").ok().map(object_text).unwrap_or_default();
    let font_regex = regex::Regex::new(r"(?P<size>-?\d+(?:\.\d+)?)\s+Tf").ok();
    let rgb_regex = regex::Regex::new(r"(?P<r>-?\d+(?:\.\d+)?)\s+(?P<g>-?\d+(?:\.\d+)?)\s+(?P<b>-?\d+(?:\.\d+)?)\s+rg").ok();
    let gray_regex = regex::Regex::new(r"(?P<g>-?\d+(?:\.\d+)?)\s+g").ok();
    let font_size = font_regex
        .as_ref()
        .and_then(|regex| regex.captures(&da))
        .and_then(|captures| captures.name("size"))
        .and_then(|value| value.as_str().parse::<f64>().ok())
        .unwrap_or(10.0);
    let text_color = rgb_regex
        .as_ref()
        .and_then(|regex| regex.captures(&da))
        .and_then(|captures| {
            Some([
                captures.name("r")?.as_str().parse().ok()?,
                captures.name("g")?.as_str().parse().ok()?,
                captures.name("b")?.as_str().parse().ok()?,
            ])
        })
        .or_else(|| {
            gray_regex
                .as_ref()
                .and_then(|regex| regex.captures(&da))
                .and_then(|captures| captures.name("g"))
                .and_then(|value| value.as_str().parse::<f64>().ok())
                .map(|gray| [gray, gray, gray])
        })
        .unwrap_or([0.0, 0.0, 0.0]);

    let annotation_flags = dictionary
        .get(b"F")
        .ok()
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(4);
    let hidden = annotation_flags & 2 != 0 || annotation_flags & 32 != 0;
    let printable = annotation_flags & 4 != 0;
    let visibility = match (hidden, printable) {
        (false, true) => "visible",
        (false, false) => "visible-no-print",
        (true, true) => "hidden-printable",
        (true, false) => "hidden",
    }.to_owned();

    (
        border_color,
        fill_color,
        border_width,
        border_style,
        font_size,
        text_color,
        rotation,
        visibility,
    )
}

fn form_id(document: &Document) -> Option<ObjectId> {
    document.catalog().ok()?.get(b"AcroForm").ok()?.as_reference().ok()
}

pub fn list_fields(path: &Path) -> Result<Vec<FormFieldInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let Some(acroform_id) = form_id(&document) else { return Ok(Vec::new()) };
    let acroform = document
        .get_object(acroform_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let Ok(fields_object) = acroform.get(b"Fields") else { return Ok(Vec::new()) };
    let mut ids = Vec::new();
    collect_field_ids(&document, fields_object, &mut ids);
    ids.sort_unstable();
    ids.dedup();

    let mut fields = Vec::new();
    for id in ids {
        let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { continue };
        let name = dictionary.get(b"T").ok().map(object_text).unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let value = dictionary.get(b"V").ok().map(object_text).unwrap_or_default();
        let flags = dictionary.get(b"Ff").ok().and_then(|value| value.as_i64().ok()).unwrap_or(0);
        fields.push(FormFieldInfo {
            object_id: format!("{}:{}", id.0, id.1),
            name,
            field_type: field_type_name(dictionary),
            value,
            default_value: dictionary.get(b"DV").ok().map(object_text).unwrap_or_default(),
            tooltip: dictionary.get(b"TU").ok().map(object_text).unwrap_or_default(),
            required: flags & 2 != 0,
            read_only: flags & 1 != 0,
            multiline: flags & (1i64 << 12) != 0,
            max_length: dictionary
                .get(b"MaxLen")
                .ok()
                .and_then(|value| value.as_i64().ok())
                .and_then(|value| u32::try_from(value).ok()),
            page_index: field_page_index(&document, dictionary),
            rect: rect_value(dictionary),
            options: field_options(dictionary),
            border_color: appearance_info(dictionary).0,
            fill_color: appearance_info(dictionary).1,
            border_width: appearance_info(dictionary).2,
            border_style: appearance_info(dictionary).3,
            font_size: appearance_info(dictionary).4,
            text_color: appearance_info(dictionary).5,
            rotation: appearance_info(dictionary).6,
            visibility: appearance_info(dictionary).7,
        });
    }
    Ok(fields)
}

pub fn fill_fields(
    input: &Path,
    output: &Path,
    values: Vec<FormValue>,
) -> Result<usize, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let Some(acroform_id) = form_id(&document) else {
        return Err(SevenError::OperationRejected("O PDF não possui AcroForm".into()));
    };
    let fields_object = document
        .get_object(acroform_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"Fields")
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .clone();
    let mut ids = Vec::new();
    collect_field_ids(&document, &fields_object, &mut ids);
    ids.sort_unstable();
    ids.dedup();

    let requested = values.into_iter().map(|value| (value.name, value.value)).collect::<HashMap<_, _>>();
    let mut changed = 0usize;

    for id in ids {
        let field = document
            .get_object_mut(id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let name = field.get(b"T").ok().map(object_text).unwrap_or_default();
        let Some(value) = requested.get(&name) else { continue };
        let field_type = field_type_name(field);
        if matches!(field_type.as_str(), "button" | "checkbox" | "radio") {
            let name_value = if value.is_empty() { "Off" } else { value.as_str() };
            field.set("V", Object::Name(name_value.as_bytes().to_vec()));
            field.set("AS", Object::Name(name_value.as_bytes().to_vec()));
        } else {
            field.set("V", Object::string_literal(value));
        }
        changed += 1;
    }

    let acroform = document
        .get_object_mut(acroform_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    acroform.set("NeedAppearances", true);
    atomic_save(document, output)?;
    Ok(changed)
}

fn ensure_acroform(document: &mut Document) -> Result<ObjectId, SevenError> {
    if let Some(id) = form_id(document) {
        return Ok(id);
    }

    let font_id = document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });
    let acroform_id = document.add_object(dictionary! {
        "Fields" => Vec::<Object>::new(),
        "NeedAppearances" => true,
        "DA" => Object::string_literal("/Helv 10 Tf 0 g"),
        "DR" => dictionary! {
            "Font" => dictionary! { "Helv" => font_id }
        },
    });
    document
        .catalog_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("AcroForm", acroform_id);
    Ok(acroform_id)
}

pub fn create_field(input: &Path, output: &Path, field: NewFormField) -> Result<(), SevenError> {
    if field.name.trim().is_empty() || field.name.chars().count() > 200 {
        return Err(SevenError::OperationRejected("Nome do campo inválido".into()));
    }
    if field.width <= 0.0 || field.height <= 0.0 {
        return Err(SevenError::OperationRejected("Dimensão do campo inválida".into()));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((field.page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página do campo não existe".into()))?;
    let acroform_id = ensure_acroform(&mut document)?;
    let required_flag = if field.required { 2i64 } else { 0i64 };
    let read_only_flag = if field.read_only { 1i64 } else { 0i64 };
    let multiline_flag = if field.multiline && field.field_type == "text" { 1i64 << 12 } else { 0i64 };

    let (ft, extra_flags) = match field.field_type.as_str() {
        "text" => ("Tx", 0i64),
        "checkbox" => ("Btn", 0i64),
        "radio" => ("Btn", 1i64 << 15),
        "dropdown" => ("Ch", 1i64 << 17),
        "list" => ("Ch", 0i64),
        "button" => ("Btn", 1i64 << 16),
        "signature" => ("Sig", 0i64),
        _ => return Err(SevenError::OperationRejected("Tipo de campo não suportado".into())),
    };

    let mut dictionary = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Widget",
        "FT" => ft,
        "T" => Object::string_literal(field.name.trim()),
        "Rect" => vec![
            field.x.into(),
            field.y.into(),
            (field.x + field.width).into(),
            (field.y + field.height).into()
        ],
        "P" => page_id,
        "F" => 4,
        "Ff" => required_flag | read_only_flag | multiline_flag | extra_flags,
    };
    if ft == "Tx" || ft == "Ch" {
        dictionary.set("DA", Object::string_literal("/Helv 10 Tf 0 g"));
    }
    if !field.tooltip.trim().is_empty() {
        dictionary.set("TU", Object::string_literal(field.tooltip.trim()));
    }
    if !field.default_value.is_empty() {
        dictionary.set("DV", Object::string_literal(&field.default_value));
        if ft != "Btn" {
            dictionary.set("V", Object::string_literal(&field.default_value));
        }
    }
    if ft == "Tx" {
        if let Some(max_length) = field.max_length {
            if max_length == 0 || max_length > 1_000_000 {
                return Err(SevenError::OperationRejected("MaxLen deve ficar entre 1 e 1.000.000".into()));
            }
            dictionary.set("MaxLen", i64::from(max_length));
        }
    }
    if ft == "Ch" && !field.options.is_empty() {
        dictionary.set(
            "Opt",
            field.options
                .iter()
                .map(|value| Object::string_literal(value))
                .collect::<Vec<_>>(),
        );
    }
    if field.field_type == "checkbox" || field.field_type == "radio" {
        dictionary.set("V", Object::Name(b"Off".to_vec()));
        dictionary.set("AS", Object::Name(b"Off".to_vec()));
    }

    let field_id = document.add_object(dictionary);

    {
        let page = document
            .get_object_mut(page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        match page.get_mut(b"Annots") {
            Ok(Object::Array(values)) => values.push(field_id.into()),
            Ok(_) => return Err(SevenError::Operation("Estrutura /Annots inválida".into())),
            Err(_) => page.set("Annots", vec![field_id.into()]),
        }
        page.set("Tabs", "S");
    }

    let acroform = document
        .get_object_mut(acroform_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    match acroform.get_mut(b"Fields") {
        Ok(Object::Array(fields)) => fields.push(field_id.into()),
        Ok(_) => return Err(SevenError::Operation("Estrutura Fields inválida".into())),
        Err(_) => acroform.set("Fields", vec![field_id.into()]),
    }
    acroform.set("NeedAppearances", true);

    atomic_save(document, output)
}

pub fn update_field(
    input: &Path,
    output: &Path,
    update: FormFieldUpdate,
) -> Result<(), SevenError> {
    if update.name.trim().is_empty() || update.name.chars().count() > 200 {
        return Err(SevenError::OperationRejected("Nome do campo inválido".into()));
    }
    if update.width <= 0.0 || update.height <= 0.0 {
        return Err(SevenError::OperationRejected("Dimensão do campo inválida".into()));
    }
    let id = parse_object_id(&update.object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let field = document
        .get_object_mut(id)
        .map_err(|_| SevenError::OperationRejected("Campo não encontrado".into()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    let field_type = field_type_name(field);
    let mut flags = field.get(b"Ff").ok().and_then(|value| value.as_i64().ok()).unwrap_or(0);
    flags &= !(1i64 | 2i64 | (1i64 << 12));
    if update.read_only { flags |= 1; }
    if update.required { flags |= 2; }
    if update.multiline && field_type == "text" { flags |= 1i64 << 12; }

    field.set("T", Object::string_literal(update.name.trim()));
    field.set("Ff", flags);
    field.set("Rect", vec![
        update.x.into(),
        update.y.into(),
        (update.x + update.width).into(),
        (update.y + update.height).into(),
    ]);

    if update.tooltip.trim().is_empty() {
        field.remove(b"TU");
    } else {
        field.set("TU", Object::string_literal(update.tooltip.trim()));
    }
    if update.default_value.is_empty() {
        field.remove(b"DV");
    } else {
        field.set("DV", Object::string_literal(&update.default_value));
    }

    if field_type == "text" {
        match update.max_length {
            Some(value) if value > 0 && value <= 1_000_000 => field.set("MaxLen", i64::from(value)),
            Some(_) => return Err(SevenError::OperationRejected("MaxLen deve ficar entre 1 e 1.000.000".into())),
            None => { field.remove(b"MaxLen"); }
        }
    }

    if matches!(field_type.as_str(), "dropdown" | "list") {
        if update.options.is_empty() {
            field.remove(b"Opt");
        } else {
            field.set(
                "Opt",
                update.options.iter()
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| Object::string_literal(value.trim()))
                    .collect::<Vec<_>>(),
            );
        }
    }

    for component in update.text_color
        .iter()
        .chain(update.border_color.iter().flatten())
        .chain(update.fill_color.iter().flatten())
    {
        if !(0.0..=1.0).contains(component) {
            return Err(SevenError::OperationRejected("Componentes de cor devem ficar entre 0 e 1".into()));
        }
    }
    if !(0.0..=20.0).contains(&update.border_width) {
        return Err(SevenError::OperationRejected("Espessura da borda inválida".into()));
    }
    if !(1.0..=200.0).contains(&update.font_size) {
        return Err(SevenError::OperationRejected("Tamanho da fonte inválido".into()));
    }
    if !matches!(update.border_style.as_str(), "S" | "D" | "B" | "I" | "U") {
        return Err(SevenError::OperationRejected("Estilo de borda inválido".into()));
    }
    if !matches!(update.rotation, 0 | 90 | 180 | 270) {
        return Err(SevenError::OperationRejected("Rotação deve ser 0, 90, 180 ou 270".into()));
    }

    let mut mk = field
        .get(b"MK")
        .ok()
        .and_then(|object| object.as_dict().ok())
        .cloned()
        .unwrap_or_default();
    match update.border_color {
        Some(color) => mk.set("BC", vec![color[0].into(), color[1].into(), color[2].into()]),
        None => { mk.remove(b"BC"); }
    }
    match update.fill_color {
        Some(color) => mk.set("BG", vec![color[0].into(), color[1].into(), color[2].into()]),
        None => { mk.remove(b"BG"); }
    }
    mk.set("R", i64::from(update.rotation));
    field.set("MK", mk);
    field.set("BS", dictionary! {
        "Type" => "Border",
        "W" => update.border_width,
        "S" => Object::Name(update.border_style.as_bytes().to_vec()),
    });
    field.set(
        "DA",
        Object::string_literal(format!(
            "/Helv {:.2} Tf {:.4} {:.4} {:.4} rg",
            update.font_size,
            update.text_color[0],
            update.text_color[1],
            update.text_color[2],
        )),
    );

    let mut annotation_flags = field.get(b"F").ok().and_then(|value| value.as_i64().ok()).unwrap_or(0);
    annotation_flags &= !(2i64 | 4i64 | 32i64);
    match update.visibility.as_str() {
        "visible" => annotation_flags |= 4,
        "visible-no-print" => {}
        "hidden" => annotation_flags |= 2,
        "hidden-printable" => annotation_flags |= 2 | 4,
        _ => return Err(SevenError::OperationRejected("Visibilidade inválida".into())),
    }
    field.set("F", annotation_flags);

    if let Some(acroform_id) = form_id(&document) {
        if let Ok(acroform) = document.get_object_mut(acroform_id).and_then(Object::as_dict_mut) {
            acroform.set("NeedAppearances", true);
        }
    }
    atomic_save(document, output)
}

pub fn delete_field(
    input: &Path,
    output: &Path,
    object_id: &str,
) -> Result<(), SevenError> {
    let id = parse_object_id(object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if !document.objects.contains_key(&id) {
        return Err(SevenError::OperationRejected("Campo não encontrado".into()));
    }

    let page_ids = document.get_pages().values().copied().collect::<Vec<_>>();
    for page_id in page_ids {
        if let Ok(page) = document.get_object_mut(page_id).and_then(Object::as_dict_mut) {
            if let Ok(Object::Array(values)) = page.get_mut(b"Annots") {
                values.retain(|entry| entry.as_reference().ok() != Some(id));
            }
        }
    }

    if let Some(acroform_id) = form_id(&document) {
        if let Ok(acroform) = document.get_object_mut(acroform_id).and_then(Object::as_dict_mut) {
            if let Ok(Object::Array(fields)) = acroform.get_mut(b"Fields") {
                fields.retain(|entry| entry.as_reference().ok() != Some(id));
            }
            acroform.set("NeedAppearances", true);
        }
    }

    document.objects.remove(&id);
    atomic_save(document, output)
}

pub fn duplicate_field(
    input: &Path,
    output: &Path,
    request: DuplicateFieldRequest,
) -> Result<usize, SevenError> {
    if request.rows == 0 || request.columns == 0 || request.rows > 100 || request.columns > 100 {
        return Err(SevenError::OperationRejected(
            "A grade deve conter entre 1 e 100 linhas/colunas".into(),
        ));
    }
    if request.page_start > request.page_end {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }

    let source_id = parse_object_id(&request.object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let source = document
        .get_object(source_id)
        .map_err(|_| SevenError::OperationRejected("Campo de origem não encontrado".into()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .clone();

    let source_name = source.get(b"T").ok().map(object_text).unwrap_or_else(|| "campo".into());
    let source_rect = rect_value(&source)
        .ok_or_else(|| SevenError::OperationRejected("Campo sem /Rect editável".into()))?;
    let width = (source_rect[2] - source_rect[0]).abs().max(1.0);
    let height = (source_rect[3] - source_rect[1]).abs().max(1.0);
    let pages = document.get_pages();
    let page_count = pages.len();

    if page_count == 0 || request.page_end >= page_count {
        return Err(SevenError::OperationRejected(format!(
            "Intervalo ultrapassa as {page_count} páginas do documento"
        )));
    }

    let acroform_id = ensure_acroform(&mut document)?;
    let total_requested =
        (request.page_end - request.page_start + 1)
            .saturating_mul(usize::from(request.rows))
            .saturating_mul(usize::from(request.columns));
    if total_requested > 5_000 {
        return Err(SevenError::OperationRejected(
            "Uma operação pode criar no máximo 5.000 campos".into(),
        ));
    }

    let mut created = Vec::with_capacity(total_requested);
    for page_index in request.page_start..=request.page_end {
        let page_id = pages
            .get(&((page_index + 1) as u32))
            .copied()
            .ok_or_else(|| SevenError::OperationRejected("Página de destino não existe".into()))?;

        for row in 0..request.rows {
            for column in 0..request.columns {
                let mut clone = source.clone();
                clone.remove(b"Kids");
                clone.remove(b"Parent");
                clone.remove(b"V");
                clone.remove(b"AS");
                clone.remove(b"AP");

                let x = source_rect[0]
                    + request.offset_x
                    + f64::from(column) * (width + request.gap_x);
                let y = source_rect[1]
                    + request.offset_y
                    - f64::from(row) * (height + request.gap_y);
                if !x.is_finite() || !y.is_finite() {
                    return Err(SevenError::OperationRejected("Posição calculada inválida".into()));
                }

                let name = format!(
                    "{}_p{}_r{}_c{}",
                    source_name,
                    page_index + 1,
                    row + 1,
                    column + 1
                );
                clone.set("T", Object::string_literal(name));
                clone.set("P", page_id);
                clone.set("Rect", vec![
                    x.into(),
                    y.into(),
                    (x + width).into(),
                    (y + height).into(),
                ]);

                if clone.get(b"FT").ok().and_then(|value| value.as_name().ok()) == Some(b"Sig") {
                    clone.remove(b"V");
                }
                let field_id = document.add_object(clone);
                created.push((page_id, field_id));
            }
        }
    }

    for (page_id, field_id) in &created {
        let page = document
            .get_object_mut(*page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        match page.get_mut(b"Annots") {
            Ok(Object::Array(values)) => values.push((*field_id).into()),
            Ok(_) => return Err(SevenError::Operation("Estrutura /Annots inválida".into())),
            Err(_) => page.set("Annots", vec![(*field_id).into()]),
        }
    }

    let acroform = document
        .get_object_mut(acroform_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    match acroform.get_mut(b"Fields") {
        Ok(Object::Array(fields)) => {
            fields.extend(created.iter().map(|(_, id)| Object::Reference(*id)));
        }
        Ok(_) => return Err(SevenError::Operation("Estrutura Fields inválida".into())),
        Err(_) => {
            acroform.set(
                "Fields",
                created.iter().map(|(_, id)| Object::Reference(*id)).collect::<Vec<_>>(),
            );
        }
    }
    acroform.set("NeedAppearances", true);

    let count = created.len();
    atomic_save(document, output)?;
    Ok(count)
}

pub fn set_page_tab_order(
    input: &Path,
    output: &Path,
    page_index: usize,
    order: &str,
) -> Result<(), SevenError> {
    let value = match order {
        "row" => "R",
        "column" => "C",
        "structure" => "S",
        _ => {
            return Err(SevenError::OperationRejected(
                "Ordem de tabulação deve ser row, column ou structure".into(),
            ))
        }
    };
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Tabs", value);
    atomic_save(document, output)
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn fdf_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
        .replace('\r', "\\r")
        .replace('\n', "\\n")
}

pub fn export_form_data(path: &Path, destination: &Path) -> Result<usize, SevenError> {
    let fields = list_fields(path)?;
    let extension = destination
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "xfdf" => {
            let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<xfdf xmlns=\"http://ns.adobe.com/xfdf/\">\n  <fields>\n");
            for field in &fields {
                xml.push_str(&format!(
                    "    <field name=\"{}\"><value>{}</value></field>\n",
                    xml_escape(&field.name),
                    xml_escape(&field.value),
                ));
            }
            xml.push_str("  </fields>\n</xfdf>\n");
            fs::write(destination, xml).map_err(|error| SevenError::Io(error.to_string()))?;
        }
        "fdf" => {
            let mut fdf = String::from("%FDF-1.2\n1 0 obj\n<< /FDF << /Fields [\n");
            for field in &fields {
                fdf.push_str(&format!(
                    "<< /T ({}) /V ({}) >>\n",
                    fdf_escape(&field.name),
                    fdf_escape(&field.value),
                ));
            }
            fdf.push_str("] >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
            fs::write(destination, fdf).map_err(|error| SevenError::Io(error.to_string()))?;
        }
        other => return Err(SevenError::UnsupportedFormat(other.to_owned())),
    }
    Ok(fields.len())
}

fn decode_fdf_literal(value: &str) -> String {
    let mut output = String::new();
    let mut chars = value.chars();
    while let Some(ch) = chars.next() {
        if ch != '\\' {
            output.push(ch);
            continue;
        }
        match chars.next() {
            Some('n') => output.push('\n'),
            Some('r') => output.push('\r'),
            Some('t') => output.push('\t'),
            Some('(') => output.push('('),
            Some(')') => output.push(')'),
            Some('\\') => output.push('\\'),
            Some(other) => output.push(other),
            None => break,
        }
    }
    output
}

fn parse_xfdf_values(path: &Path) -> Result<Vec<FormValue>, SevenError> {
    use quick_xml::{events::Event, Reader};
    let mut reader = Reader::from_file(path).map_err(|error| SevenError::Operation(error.to_string()))?;
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut current_name: Option<String> = None;
    let mut in_value = false;
    let mut values = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_string();
                if tag == "field" {
                    current_name = event.attributes().flatten().find_map(|attr| {
                        (attr.key.as_ref() == b"name")
                            .then(|| attr.unescape_value().ok().map(|value| value.into_owned()))
                            .flatten()
                    });
                } else if tag == "value" && current_name.is_some() {
                    in_value = true;
                }
            }
            Ok(Event::Text(event)) if in_value => {
                if let Some(name) = current_name.clone() {
                    values.push(FormValue {
                        name,
                        value: event.decode().map(|value| value.into_owned()).unwrap_or_default(),
                    });
                }
            }
            Ok(Event::End(event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_string();
                if tag == "value" { in_value = false; }
                if tag == "field" { current_name = None; }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(SevenError::Operation(format!("XFDF inválido: {error}"))),
            _ => {}
        }
        buf.clear();
    }
    Ok(values)
}

fn parse_fdf_values(path: &Path) -> Result<Vec<FormValue>, SevenError> {
    let text = fs::read_to_string(path).map_err(|error| SevenError::Io(error.to_string()))?;
    let regex = regex::Regex::new(r"/T\s*\(((?:\\.|[^\\)])*)\)\s*/V\s*\(((?:\\.|[^\\)])*)\)")
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    Ok(regex
        .captures_iter(&text)
        .filter_map(|captures| {
            Some(FormValue {
                name: decode_fdf_literal(captures.get(1)?.as_str()),
                value: decode_fdf_literal(captures.get(2)?.as_str()),
            })
        })
        .collect())
}

pub fn import_form_data(
    input: &Path,
    output: &Path,
    data_path: &Path,
) -> Result<usize, SevenError> {
    let extension = data_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let values = match extension.as_str() {
        "xfdf" => parse_xfdf_values(data_path)?,
        "fdf" => parse_fdf_values(data_path)?,
        other => return Err(SevenError::UnsupportedFormat(other.to_owned())),
    };
    if values.is_empty() {
        return Err(SevenError::OperationRejected("Nenhum valor de formulário encontrado no arquivo".into()));
    }
    fill_fields(input, output, values)
}

pub fn reset_form(
    input: &Path,
    output: &Path,
    use_defaults: bool,
) -> Result<usize, SevenError> {
    let fields = list_fields(input)?;
    if fields.is_empty() {
        return Err(SevenError::OperationRejected("O PDF não possui campos AcroForm".into()));
    }
    let values = fields
        .into_iter()
        .map(|field| FormValue {
            name: field.name,
            value: if use_defaults { field.default_value } else { String::new() },
        })
        .collect::<Vec<_>>();
    fill_fields(input, output, values)
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-form.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}
