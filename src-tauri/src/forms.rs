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
    pub required: bool,
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
    pub options: Vec<String>,
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
    dictionary
        .get(b"FT")
        .ok()
        .and_then(|object| object.as_name().ok())
        .map(|name| match name {
            b"Tx" => "text",
            b"Btn" => "button",
            b"Ch" => "choice",
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
            required: flags & 2 != 0,
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
        if field_type == "button" {
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
        "Ff" => required_flag | extra_flags,
    };
    if ft == "Tx" || ft == "Ch" {
        dictionary.set("DA", Object::string_literal("/Helv 10 Tf 0 g"));
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
