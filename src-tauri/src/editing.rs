use crate::error::SevenError;
use lopdf::{
    content::{Content, Operation},
    dictionary, Dictionary, Document, Object, ObjectId, Stream,
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs, path::Path};

const MAX_PAGE_CONTENT: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPlacement {
    pub page_index: usize,
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub font_size: f64,
    pub rotation: f64,
    pub gray: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePlacement {
    pub page_index: usize,
    pub image_path: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub mirror_x: bool,
    pub mirror_y: bool,
    pub crop_left: f64,
    pub crop_top: f64,
    pub crop_right: f64,
    pub crop_bottom: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageObjectInfo {
    pub page_index: usize,
    pub resource_name: String,
    pub object_id: String,
    pub pixel_width: Option<i64>,
    pub pixel_height: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkPlacement {
    pub page_index: usize,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub target_kind: String,
    pub target: String,
    pub target_page: Option<usize>,
    pub named_destination: Option<String>,
    pub border_width: f64,
    pub border_color: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInfo {
    pub object_id: String,
    pub page_index: usize,
    pub rect: [f64; 4],
    pub target_kind: String,
    pub target: String,
    pub target_page: Option<usize>,
    pub named_destination: Option<String>,
    pub border_width: f64,
    pub border_color: [f64; 3],
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkUpdate {
    pub object_id: String,
    pub page_index: usize,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub target_kind: String,
    pub target: String,
    pub target_page: Option<usize>,
    pub named_destination: Option<String>,
    pub border_width: f64,
    pub border_color: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedDestinationInfo {
    pub name: String,
    pub page_index: Option<usize>,
    pub editable: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayTextOptions {
    pub kind: String,
    pub text: String,
    pub prefix: String,
    pub suffix: String,
    pub start_number: u64,
    pub digits: u8,
    pub font_size: f64,
    pub page_start: usize,
    pub page_end: Option<usize>,
    pub parity: String,
    pub position: String,
    pub margin_x: f64,
    pub margin_y: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub image_path: Option<String>,
    pub image_scale: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageLabelOptions {
    pub page_start: usize,
    pub page_end: Option<usize>,
    pub style: String,
    pub prefix: String,
    pub suffix: String,
    pub start_number: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundOptions {
    pub page_start: usize,
    pub page_end: Option<usize>,
    pub red: f64,
    pub green: f64,
    pub blue: f64,
    pub opacity: f64,
    pub image_path: Option<String>,
    pub image_scale: f64,
    pub position: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedElementInfo {
    pub id: String,
    pub kind: String,
    pub page_indices: Vec<usize>,
    pub options_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceTextReport {
    pub replacements: usize,
    pub pages_changed: usize,
    pub unsupported_text_operators: usize,
}

fn page_id(document: &Document, page_index: usize) -> Result<ObjectId, SevenError> {
    document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected(format!("Página {} não existe", page_index + 1)))
}

fn inherited_object(document: &Document, mut id: ObjectId, key: &[u8]) -> Option<Object> {
    for _ in 0..32 {
        let dictionary = document.get_object(id).ok()?.as_dict().ok()?;
        if let Ok(value) = dictionary.get(key) {
            return Some(value.clone());
        }
        id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn number(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some(f64::from(*value)),
        _ => None,
    }
}

fn page_dimensions(document: &Document, page_id: ObjectId) -> (f64, f64) {
    let Some(Object::Array(values)) = inherited_object(document, page_id, b"MediaBox") else {
        return (612.0, 792.0);
    };
    if values.len() < 4 {
        return (612.0, 792.0);
    }
    let x1 = number(&values[0]).unwrap_or(0.0);
    let y1 = number(&values[1]).unwrap_or(0.0);
    let x2 = number(&values[2]).unwrap_or(612.0);
    let y2 = number(&values[3]).unwrap_or(792.0);
    ((x2 - x1).abs().max(1.0), (y2 - y1).abs().max(1.0))
}

fn effective_resources(document: &Document, page_id: ObjectId) -> Dictionary {
    let Some(value) = inherited_object(document, page_id, b"Resources") else {
        return Dictionary::new();
    };
    match value {
        Object::Dictionary(dictionary) => dictionary,
        Object::Reference(id) => document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    }
}

fn ensure_helvetica(document: &mut Document, page_id: ObjectId) -> Result<Vec<u8>, SevenError> {
    let mut resources = effective_resources(document, page_id);
    let mut fonts = match resources.get(b"Font") {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        Ok(Object::Reference(id)) => document
            .get_object(*id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    };

    for index in 1..1000 {
        let name = format!("SRF{index}");
        if fonts.get(name.as_bytes()).is_err() {
            let font_id = document.add_object(dictionary! {
                "Type" => "Font",
                "Subtype" => "Type1",
                "BaseFont" => "Helvetica",
                "Encoding" => "WinAnsiEncoding",
            });
            fonts.set(name.as_str(), font_id);
            resources.set("Font", fonts);
            document
                .get_object_mut(page_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Resources", resources);
            return Ok(name.into_bytes());
        }
    }

    Err(SevenError::Operation("Não foi possível alocar recurso de fonte".into()))
}

fn ensure_ext_gstate(
    document: &mut Document,
    page_id: ObjectId,
    opacity: f64,
) -> Result<Vec<u8>, SevenError> {
    if !(0.0..=1.0).contains(&opacity) {
        return Err(SevenError::OperationRejected("Opacidade deve ficar entre 0 e 1".into()));
    }
    let mut resources = effective_resources(document, page_id);
    let mut states = match resources.get(b"ExtGState") {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        Ok(Object::Reference(id)) => document
            .get_object(*id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    };

    for index in 1..1000 {
        let name = format!("SRGS{index}");
        if states.get(name.as_bytes()).is_err() {
            let state_id = document.add_object(dictionary! {
                "Type" => "ExtGState",
                "ca" => opacity,
                "CA" => opacity,
            });
            states.set(name.as_str(), state_id);
            resources.set("ExtGState", states);
            document
                .get_object_mut(page_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Resources", resources);
            return Ok(name.into_bytes());
        }
    }
    Err(SevenError::Operation("Não foi possível alocar ExtGState".into()))
}

fn align_x(
    position: &str,
    page_width: f64,
    margin_x: f64,
    text: &str,
    font_size: f64,
) -> Result<f64, SevenError> {
    let approximate_width = text.chars().count() as f64 * font_size * 0.52;
    match position {
        "left" => Ok(margin_x),
        "center" => Ok((page_width - approximate_width) / 2.0),
        "right" => Ok((page_width - margin_x - approximate_width).max(0.0)),
        _ => Err(SevenError::OperationRejected("Posição horizontal inválida".into())),
    }
}

fn render_overlay_template(
    template: &str,
    page: usize,
    total: usize,
) -> String {
    template
        .replace("{page}", &(page + 1).to_string())
        .replace("{total}", &total.to_string())
        .replace("{date}", &Local::now().format("%Y-%m-%d").to_string())
}

fn append_content(document: &mut Document, page_id: ObjectId, content: Content<Vec<Operation>>) -> Result<(), SevenError> {
    document
        .add_to_page_content(page_id, content)
        .map_err(|error| SevenError::Operation(error.to_string()))
}


fn object_string(object: &Object) -> Option<String> {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
        _ => None,
    }
}

fn add_managed_content_stream(
    document: &mut Document,
    page_id: ObjectId,
    bytes: Vec<u8>,
    element_id: &str,
    kind: &str,
    options_json: &str,
    prepend: bool,
) -> Result<(), SevenError> {
    let existing = document
        .get_object(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"Contents")
        .ok()
        .cloned();

    let stream_id = document.add_object(Stream::new(
        dictionary! {
            "SevenReaderElement" => true,
            "SevenElementId" => Object::string_literal(element_id),
            "SevenElementKind" => Object::string_literal(kind),
            "SevenElementOptions" => Object::string_literal(options_json),
        },
        bytes,
    ));
    let managed = Object::Reference(stream_id);

    let contents = match existing {
        Some(Object::Reference(id)) if prepend => vec![managed, Object::Reference(id)],
        Some(Object::Reference(id)) => vec![Object::Reference(id), managed],
        Some(Object::Array(mut values)) if prepend => {
            values.insert(0, managed);
            values
        }
        Some(Object::Array(mut values)) => {
            values.push(managed);
            values
        }
        _ => vec![managed],
    };

    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Contents", contents);
    Ok(())
}

fn managed_stream_metadata(document: &Document, id: ObjectId) -> Option<(String, String, String)> {
    let stream = document.get_object(id).ok()?.as_stream().ok()?;
    let marked = stream
        .dict
        .get(b"SevenReaderElement")
        .ok()
        .and_then(|value| match value { Object::Boolean(value) => Some(*value), _ => None })
        .unwrap_or(false);
    if !marked { return None; }
    Some((
        stream.dict.get(b"SevenElementId").ok().and_then(object_string)?,
        stream.dict.get(b"SevenElementKind").ok().and_then(object_string)?,
        stream.dict.get(b"SevenElementOptions").ok().and_then(object_string).unwrap_or_default(),
    ))
}

pub fn list_managed_elements(input: &Path) -> Result<Vec<ManagedElementInfo>, SevenError> {
    let document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut grouped: HashMap<String, ManagedElementInfo> = HashMap::new();
    for (number, page_id) in document.get_pages() {
        let contents = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|page| page.get(b"Contents").ok())
            .cloned();
        let ids = match contents {
            Some(Object::Reference(id)) => vec![id],
            Some(Object::Array(values)) => values.into_iter().filter_map(|value| value.as_reference().ok()).collect(),
            _ => Vec::new(),
        };
        for id in ids {
            let Some((element_id, kind, options_json)) = managed_stream_metadata(&document, id) else { continue };
            let entry = grouped.entry(element_id.clone()).or_insert_with(|| ManagedElementInfo {
                id: element_id,
                kind,
                page_indices: Vec::new(),
                options_json,
            });
            entry.page_indices.push(number.saturating_sub(1) as usize);
        }
    }
    let mut result = grouped.into_values().collect::<Vec<_>>();
    result.sort_by(|left, right| left.kind.cmp(&right.kind).then_with(|| left.id.cmp(&right.id)));
    Ok(result)
}

fn remove_managed_element_from_document(
    document: &mut Document,
    element_id: &str,
) -> Result<usize, SevenError> {
    let pages = document.get_pages().values().copied().collect::<Vec<_>>();
    let mut removed_ids = HashSet::new();

    for page_id in pages {
        let current = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|page| page.get(b"Contents").ok())
            .cloned();
        let Some(current) = current else { continue };

        let mut retained = Vec::new();
        let values = match current {
            Object::Reference(id) => vec![Object::Reference(id)],
            Object::Array(values) => values,
            other => vec![other],
        };
        for value in values {
            let remove = value
                .as_reference()
                .ok()
                .and_then(|id| managed_stream_metadata(document, id).map(|meta| (id, meta)))
                .is_some_and(|(id, (candidate, _, _))| {
                    if candidate == element_id {
                        removed_ids.insert(id);
                        true
                    } else {
                        false
                    }
                });
            if !remove {
                retained.push(value);
            }
        }

        let page = document
            .get_object_mut(page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        if retained.is_empty() {
            page.remove(b"Contents");
        } else if retained.len() == 1 {
            page.set("Contents", retained.remove(0));
        } else {
            page.set("Contents", retained);
        }
    }

    let count = removed_ids.len();
    for id in removed_ids {
        document.objects.remove(&id);
    }
    Ok(count)
}

pub fn remove_managed_element(
    input: &Path,
    output: &Path,
    element_id: &str,
) -> Result<usize, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let removed = remove_managed_element_from_document(&mut document, element_id)?;
    if removed == 0 {
        return Err(SevenError::OperationRejected("Elemento gerenciado não encontrado".into()));
    }
    atomic_save(document, output)?;
    Ok(removed)
}

fn text_operations(font: Vec<u8>, placement: &TextPlacement) -> Vec<Operation> {
    let radians = placement.rotation.to_radians();
    let cos = radians.cos();
    let sin = radians.sin();
    vec![
        Operation::new("q", vec![]),
        Operation::new("BT", vec![]),
        Operation::new(
            "Tf",
            vec![Object::Name(font), placement.font_size.into()],
        ),
        Operation::new(
            "g",
            vec![placement.gray.clamp(0.0, 1.0).into()],
        ),
        Operation::new(
            "Tm",
            vec![
                cos.into(),
                sin.into(),
                (-sin).into(),
                cos.into(),
                placement.x.into(),
                placement.y.into(),
            ],
        ),
        Operation::new("Tj", vec![Object::string_literal(&placement.text)]),
        Operation::new("ET", vec![]),
        Operation::new("Q", vec![]),
    ]
}

pub fn add_text(input: &Path, output: &Path, placement: TextPlacement) -> Result<(), SevenError> {
    if placement.text.trim().is_empty() || placement.text.chars().count() > 20_000 {
        return Err(SevenError::OperationRejected("Texto inválido".into()));
    }
    if !(1.0..=300.0).contains(&placement.font_size) {
        return Err(SevenError::OperationRejected("Tamanho de fonte inválido".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, placement.page_index)?;
    let font = ensure_helvetica(&mut document, page_id)?;
    append_content(&mut document, page_id, Content { operations: text_operations(font, &placement) })?;
    atomic_save(document, output)
}

fn replace_in_object(object: &mut Object, find: &str, replacement: &str) -> usize {
    match object {
        Object::String(bytes, _) => {
            let current = String::from_utf8_lossy(bytes).into_owned();
            let count = current.matches(find).count();
            if count > 0 {
                *bytes = current.replace(find, replacement).into_bytes();
            }
            count
        }
        _ => 0,
    }
}

fn replace_nth_in_object(
    object: &mut Object,
    find: &str,
    replacement: &str,
    target_occurrence: usize,
    seen: &mut usize,
) -> bool {
    let Object::String(bytes, _) = object else { return false };
    let current = String::from_utf8_lossy(bytes).into_owned();
    for (start, _) in current.match_indices(find) {
        if *seen == target_occurrence {
            let end = start + find.len();
            let mut updated = String::with_capacity(
                current.len().saturating_sub(find.len()) + replacement.len(),
            );
            updated.push_str(&current[..start]);
            updated.push_str(replacement);
            updated.push_str(&current[end..]);
            *bytes = updated.into_bytes();
            return true;
        }
        *seen += 1;
    }
    false
}

pub fn replace_text_occurrence(
    input: &Path,
    output: &Path,
    find: &str,
    replacement: &str,
    page_index: usize,
    occurrence: usize,
) -> Result<(), SevenError> {
    if find.is_empty() || find.chars().count() > 1_000 || replacement.chars().count() > 4_000 {
        return Err(SevenError::OperationRejected("Correção OCR inválida".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let target = page_id(&document, page_index)?;
    let data = document.get_page_content(target);
    if data.len() > MAX_PAGE_CONTENT {
        return Err(SevenError::OperationRejected(
            "Página excede o limite seguro de edição".into(),
        ));
    }
    let mut content = Content::decode(&data)
        .map_err(|error| SevenError::Operation(format!("Content stream: {error}")))?;
    let mut seen = 0usize;
    let mut changed = false;

    'operations: for operation in &mut content.operations {
        match operation.operator.as_str() {
            "Tj" | "'" | "\"" => {
                if let Some(object) = operation.operands.last_mut() {
                    if replace_nth_in_object(object, find, replacement, occurrence, &mut seen) {
                        changed = true;
                        break 'operations;
                    }
                }
            }
            "TJ" => {
                if let Some(Object::Array(values)) = operation.operands.first_mut() {
                    for value in values {
                        if replace_nth_in_object(value, find, replacement, occurrence, &mut seen) {
                            changed = true;
                            break 'operations;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if !changed {
        return Err(SevenError::OperationRejected(
            "A ocorrência OCR selecionada não está em operadores Tj/TJ editáveis. O Seven não alterou o PDF.".into(),
        ));
    }

    let encoded = content.encode().map_err(|error| SevenError::Operation(error.to_string()))?;
    let stream_id = document.add_object(Stream::new(Dictionary::new(), encoded));
    document
        .get_object_mut(target)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Contents", stream_id);
    atomic_save(document, output)
}

pub fn replace_text(
    input: &Path,
    output: &Path,
    find: &str,
    replacement: &str,
    all_pages: bool,
    page_index: usize,
) -> Result<ReplaceTextReport, SevenError> {
    if find.is_empty() || find.chars().count() > 4_000 || replacement.chars().count() > 20_000 {
        return Err(SevenError::OperationRejected("Busca/substituição inválida".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let pages = document.get_pages();
    let targets = if all_pages {
        pages.values().copied().collect::<Vec<_>>()
    } else {
        vec![page_id(&document, page_index)?]
    };
    let mut replacements = 0usize;
    let mut pages_changed = 0usize;
    let mut unsupported_text_operators = 0usize;

    for target in targets {
        let data = document.get_page_content(target);
        if data.len() > MAX_PAGE_CONTENT {
            return Err(SevenError::OperationRejected(
                "Página excede o limite seguro de 64 MiB de conteúdo descomprimido".into(),
            ));
        }
        let mut content = Content::decode(&data)
            .map_err(|error| SevenError::Operation(format!("Content stream: {error}")))?;
        let mut page_replacements = 0usize;

        for operation in &mut content.operations {
            match operation.operator.as_str() {
                "Tj" | "'" | "\"" => {
                    if let Some(object) = operation.operands.last_mut() {
                        page_replacements += replace_in_object(object, find, replacement);
                    }
                }
                "TJ" => {
                    if let Some(Object::Array(values)) = operation.operands.first_mut() {
                        for value in values {
                            page_replacements += replace_in_object(value, find, replacement);
                        }
                    }
                }
                "Do" => unsupported_text_operators += 1,
                _ => {}
            }
        }

        if page_replacements > 0 {
            let encoded = content
                .encode()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let stream_id = document.add_object(Stream::new(Dictionary::new(), encoded));
            document
                .get_object_mut(target)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Contents", stream_id);
            replacements += page_replacements;
            pages_changed += 1;
        }
    }

    if replacements == 0 {
        return Err(SevenError::OperationRejected(
            "Texto não encontrado em operadores editáveis Tj/TJ; a página pode usar CID, glifos, outlines ou XObjects".into(),
        ));
    }

    atomic_save(document, output)?;
    Ok(ReplaceTextReport { replacements, pages_changed, unsupported_text_operators })
}

fn xobject_dictionary(document: &Document, resources: &Dictionary) -> Dictionary {
    match resources.get(b"XObject") {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        Ok(Object::Reference(id)) => document
            .get_object(*id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    }
}

pub fn list_image_objects(input: &Path, page_index: usize) -> Result<Vec<ImageObjectInfo>, SevenError> {
    let document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, page_index)?;
    let resources = effective_resources(&document, page_id);
    let xobjects = xobject_dictionary(&document, &resources);
    let mut output = Vec::new();

    for (name, object) in xobjects.iter() {
        let Ok(id) = object.as_reference() else { continue };
        let Ok(stream) = document.get_object(id).and_then(Object::as_stream) else { continue };
        let subtype = stream.dict.get(b"Subtype").ok().and_then(|value| value.as_name().ok());
        if subtype != Some(b"Image") {
            continue;
        }
        let pixel_width = stream.dict.get(b"Width").ok().and_then(|value| value.as_i64().ok());
        let pixel_height = stream.dict.get(b"Height").ok().and_then(|value| value.as_i64().ok());
        output.push(ImageObjectInfo {
            page_index,
            resource_name: String::from_utf8_lossy(name).into_owned(),
            object_id: format!("{}:{}", id.0, id.1),
            pixel_width,
            pixel_height,
        });
    }

    output.sort_by(|left, right| left.resource_name.cmp(&right.resource_name));
    Ok(output)
}

fn localize_xobjects(
    document: &mut Document,
    page_id: ObjectId,
) -> Result<(Dictionary, Dictionary), SevenError> {
    let mut resources = effective_resources(document, page_id);
    let xobjects = xobject_dictionary(document, &resources);
    resources.set("XObject", xobjects.clone());
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Resources", resources.clone());
    Ok((resources, xobjects))
}

pub fn replace_image_object(
    input: &Path,
    output: &Path,
    page_index: usize,
    resource_name: &str,
    image_path: &str,
) -> Result<(), SevenError> {
    if resource_name.is_empty() || resource_name.len() > 256 {
        return Err(SevenError::OperationRejected("Nome do recurso de imagem inválido".into()));
    }
    let image_path = Path::new(image_path);
    if !image_path.is_file() {
        return Err(SevenError::NotFound(image_path.to_string_lossy().into_owned()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, page_index)?;
    let (mut resources, mut xobjects) = localize_xobjects(&mut document, page_id)?;
    if xobjects.get(resource_name.as_bytes()).is_err() {
        return Err(SevenError::OperationRejected("Recurso de imagem não encontrado nesta página".into()));
    }
    let stream = lopdf::xobject::image(image_path)
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let id = document.add_object(stream);
    xobjects.set(resource_name, id);
    resources.set("XObject", xobjects);
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Resources", resources);
    atomic_save(document, output)
}

pub fn remove_image_object(
    input: &Path,
    output: &Path,
    page_index: usize,
    resource_name: &str,
) -> Result<usize, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, page_index)?;
    let data = document.get_page_content(page_id);
    if data.len() > MAX_PAGE_CONTENT {
        return Err(SevenError::OperationRejected("Página excede o limite seguro de edição".into()));
    }
    let mut content = Content::decode(&data)
        .map_err(|error| SevenError::Operation(format!("Content stream: {error}")))?;
    let before = content.operations.len();
    content.operations.retain(|operation| {
        if operation.operator != "Do" {
            return true;
        }
        let Some(Object::Name(name)) = operation.operands.first() else { return true };
        name.as_slice() != resource_name.as_bytes()
    });
    let removed = before.saturating_sub(content.operations.len());
    if removed == 0 {
        return Err(SevenError::OperationRejected(
            "A imagem existe nos recursos, mas não há uso direto editável nesta página; ela pode estar dentro de um Form XObject".into(),
        ));
    }
    let encoded = content.encode().map_err(|error| SevenError::Operation(error.to_string()))?;
    let stream_id = document.add_object(Stream::new(Dictionary::new(), encoded));
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Contents", stream_id);

    let (mut resources, mut xobjects) = localize_xobjects(&mut document, page_id)?;
    xobjects.remove(resource_name.as_bytes());
    resources.set("XObject", xobjects);
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Resources", resources);
    atomic_save(document, output)?;
    Ok(removed)
}

pub fn add_image(input: &Path, output: &Path, placement: ImagePlacement) -> Result<(), SevenError> {
    if placement.width <= 0.0 || placement.height <= 0.0 {
        return Err(SevenError::OperationRejected("Dimensões da imagem inválidas".into()));
    }
    if !(0.0..=1.0).contains(&placement.opacity) {
        return Err(SevenError::OperationRejected("Opacidade deve ficar entre 0 e 1".into()));
    }
    for crop in [placement.crop_left, placement.crop_top, placement.crop_right, placement.crop_bottom] {
        if !(0.0..=0.95).contains(&crop) {
            return Err(SevenError::OperationRejected("Recorte deve ficar entre 0 e 95%".into()));
        }
    }
    if placement.crop_left + placement.crop_right >= 0.98 || placement.crop_top + placement.crop_bottom >= 0.98 {
        return Err(SevenError::OperationRejected("O recorte remove quase toda a imagem".into()));
    }

    let image_path = Path::new(&placement.image_path);
    if !image_path.is_file() {
        return Err(SevenError::NotFound(placement.image_path));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, placement.page_index)?;

    let decoded = image::open(image_path).map_err(|error| SevenError::Operation(error.to_string()))?;
    let iw = decoded.width();
    let ih = decoded.height();
    let left = (f64::from(iw) * placement.crop_left).round() as u32;
    let top = (f64::from(ih) * placement.crop_top).round() as u32;
    let right = (f64::from(iw) * placement.crop_right).round() as u32;
    let bottom = (f64::from(ih) * placement.crop_bottom).round() as u32;
    let cw = iw.saturating_sub(left + right).max(1);
    let ch = ih.saturating_sub(top + bottom).max(1);

    let temp_image = output.with_extension(format!("seven-image-{}.png", uuid::Uuid::new_v4()));
    decoded.crop_imm(left, top, cw, ch)
        .save(&temp_image)
        .map_err(|error| SevenError::Io(error.to_string()))?;

    let image_stream = lopdf::xobject::image(&temp_image)
        .map_err(|error| SevenError::Operation(error.to_string()));
    let _ = fs::remove_file(&temp_image);
    let image_stream = image_stream?;
    let image_id = document.add_object(image_stream);
    let name = format!("SRI{}", image_id.0);

    document
        .add_xobject(page_id, name.as_bytes(), image_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    let mut resources = effective_resources(&document, page_id);
    let mut ext_gstates = match resources.get(b"ExtGState") {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        Ok(Object::Reference(id)) => document.get_object(*id).ok().and_then(|object| object.as_dict().ok()).cloned().unwrap_or_default(),
        _ => Dictionary::new(),
    };
    let gs_name = format!("SRGS{}", image_id.0);
    let gs_id = document.add_object(dictionary! {
        "Type" => "ExtGState",
        "ca" => placement.opacity,
        "CA" => placement.opacity,
    });
    ext_gstates.set(gs_name.as_str(), gs_id);
    resources.set("ExtGState", ext_gstates);
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Resources", resources);

    let radians = placement.rotation.to_radians();
    let cos = radians.cos();
    let sin = radians.sin();
    let sx = if placement.mirror_x { -1.0 } else { 1.0 };
    let sy = if placement.mirror_y { -1.0 } else { 1.0 };
    let a = sx * placement.width * cos;
    let b = sx * placement.width * sin;
    let c_matrix = -sy * placement.height * sin;
    let d = sy * placement.height * cos;
    let e = placement.x
        + if placement.mirror_x { placement.width * cos } else { 0.0 }
        + if placement.mirror_y { -placement.height * sin } else { 0.0 };
    let f = placement.y
        + if placement.mirror_x { placement.width * sin } else { 0.0 }
        + if placement.mirror_y { placement.height * cos } else { 0.0 };

    append_content(
        &mut document,
        page_id,
        Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new("gs", vec![Object::Name(gs_name.into_bytes())]),
                Operation::new("cm", vec![
                    a.into(), b.into(), c_matrix.into(), d.into(),
                    e.into(), f.into(),
                ]),
                Operation::new("Do", vec![Object::Name(name.into_bytes())]),
                Operation::new("Q", vec![]),
            ],
        },
    )?;

    atomic_save(document, output)
}

fn parse_object_id(value: &str) -> Result<ObjectId, SevenError> {
    let (object, generation) = value
        .split_once(':')
        .ok_or_else(|| SevenError::OperationRejected("Object ID inválido".into()))?;
    Ok((
        object.parse::<u32>().map_err(|_| SevenError::OperationRejected("Object ID inválido".into()))?,
        generation.parse::<u16>().map_err(|_| SevenError::OperationRejected("Object ID inválido".into()))?,
    ))
}

fn rect_array(dictionary: &Dictionary) -> Option<[f64; 4]> {
    let values = dictionary.get(b"Rect").ok()?.as_array().ok()?;
    if values.len() < 4 { return None; }
    Some([
        number(&values[0])?,
        number(&values[1])?,
        number(&values[2])?,
        number(&values[3])?,
    ])
}

fn page_index_for_id(document: &Document, id: ObjectId) -> Option<usize> {
    document
        .get_pages()
        .into_iter()
        .find_map(|(number, page_id)| (page_id == id).then_some(number.saturating_sub(1) as usize))
}

fn link_action_dictionary<'a>(document: &'a Document, annotation: &'a Dictionary) -> Option<&'a Dictionary> {
    match annotation.get(b"A").ok()? {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Reference(id) => document.get_object(*id).ok()?.as_dict().ok(),
        _ => None,
    }
}

fn link_target_info(
    document: &Document,
    annotation: &Dictionary,
) -> (String, String, Option<usize>, Option<String>) {
    if let Ok(dest) = annotation.get(b"Dest") {
        match dest {
            Object::Array(values) => {
                if let Some(Object::Reference(page_id)) = values.first() {
                    return ("page".into(), String::new(), page_index_for_id(document, *page_id), None);
                }
            }
            Object::Name(name) | Object::String(name, _) => {
                let value = String::from_utf8_lossy(name).into_owned();
                return ("named".into(), String::new(), None, Some(value));
            }
            _ => {}
        }
    }

    let Some(action) = link_action_dictionary(document, annotation) else {
        return ("unknown".into(), String::new(), None, None);
    };
    let action_type = action
        .get(b"S")
        .ok()
        .and_then(|value| value.as_name().ok())
        .unwrap_or_default();
    match action_type {
        b"URI" => (
            "url".into(),
            action.get(b"URI").ok().map(|value| match value {
                Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
                _ => String::new(),
            }).unwrap_or_default(),
            None,
            None,
        ),
        b"Launch" => (
            "file".into(),
            action.get(b"F").ok().map(|value| match value {
                Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
                _ => String::new(),
            }).unwrap_or_default(),
            None,
            None,
        ),
        b"GoTo" => {
            if let Ok(destination) = action.get(b"D") {
                match destination {
                    Object::Array(values) => {
                        if let Some(Object::Reference(page_id)) = values.first() {
                            return ("page".into(), String::new(), page_index_for_id(document, *page_id), None);
                        }
                    }
                    Object::Name(name) | Object::String(name, _) => {
                        return (
                            "named".into(),
                            String::new(),
                            None,
                            Some(String::from_utf8_lossy(name).into_owned()),
                        );
                    }
                    _ => {}
                }
            }
            ("unknown".into(), String::new(), None, None)
        }
        _ => ("unknown".into(), String::new(), None, None),
    }
}

fn link_border(dictionary: &Dictionary) -> (f64, [f64; 3]) {
    let width = dictionary
        .get(b"Border")
        .ok()
        .and_then(|value| value.as_array().ok())
        .and_then(|values| values.get(2))
        .and_then(number)
        .unwrap_or(0.0);
    let color = dictionary
        .get(b"C")
        .ok()
        .and_then(|value| value.as_array().ok())
        .and_then(|values| {
            if values.len() < 3 { return None; }
            Some([number(&values[0])?, number(&values[1])?, number(&values[2])?])
        })
        .unwrap_or([0.0, 0.0, 1.0]);
    (width, color)
}

fn validate_link_style(width: f64, color: [f64; 3]) -> Result<(), SevenError> {
    if !(0.0..=20.0).contains(&width) {
        return Err(SevenError::OperationRejected("Espessura da borda do link inválida".into()));
    }
    if color.iter().any(|component| !(0.0..=1.0).contains(component)) {
        return Err(SevenError::OperationRejected("Cor da borda do link inválida".into()));
    }
    Ok(())
}

fn configure_link_target(
    document: &Document,
    annotation: &mut Dictionary,
    target_kind: &str,
    target: &str,
    target_page: Option<usize>,
    named_destination: Option<&str>,
) -> Result<(), SevenError> {
    annotation.remove(b"A");
    annotation.remove(b"Dest");
    match target_kind {
        "url" => {
            let uri = target.trim();
            if uri.len() > 4096 || !(uri.starts_with("https://") || uri.starts_with("http://")) {
                return Err(SevenError::OperationRejected("URL deve usar HTTP ou HTTPS".into()));
            }
            annotation.set("A", dictionary! {
                "S" => "URI",
                "URI" => Object::string_literal(uri),
            });
        }
        "page" => {
            let page = target_page.ok_or_else(|| SevenError::OperationRejected("Página de destino ausente".into()))?;
            let target_id = page_id(document, page)?;
            annotation.set("Dest", vec![target_id.into(), Object::Name(b"Fit".to_vec())]);
        }
        "file" => {
            let path = target.trim();
            if path.is_empty() || path.chars().count() > 4096 {
                return Err(SevenError::OperationRejected("Arquivo de destino inválido".into()));
            }
            annotation.set("A", dictionary! {
                "S" => "Launch",
                "F" => Object::string_literal(path),
            });
        }
        "named" => {
            let name = named_destination.unwrap_or_default().trim();
            if name.is_empty() || name.chars().count() > 500 {
                return Err(SevenError::OperationRejected("Destino nomeado inválido".into()));
            }
            annotation.set("Dest", Object::string_literal(name));
        }
        _ => return Err(SevenError::OperationRejected("Tipo de destino de link inválido".into())),
    }
    Ok(())
}

pub fn list_links(input: &Path) -> Result<Vec<LinkInfo>, SevenError> {
    let document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut output = Vec::new();
    for (number, page_id) in document.get_pages() {
        let annotations = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|page| page.get(b"Annots").ok())
            .and_then(|value| value.as_array().ok())
            .cloned()
            .unwrap_or_default();
        for annotation in annotations {
            let Ok(id) = annotation.as_reference() else { continue };
            let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { continue };
            if dictionary.get(b"Subtype").ok().and_then(|value| value.as_name().ok()) != Some(b"Link") {
                continue;
            }
            let Some(rect) = rect_array(dictionary) else { continue };
            let (target_kind, target, target_page, named_destination) = link_target_info(&document, dictionary);
            let (border_width, border_color) = link_border(dictionary);
            output.push(LinkInfo {
                object_id: format!("{}:{}", id.0, id.1),
                page_index: number.saturating_sub(1) as usize,
                rect,
                target_kind,
                target,
                target_page,
                named_destination,
                border_width,
                border_color,
            });
        }
    }
    Ok(output)
}

pub fn update_link(input: &Path, output: &Path, update: LinkUpdate) -> Result<(), SevenError> {
    if update.width <= 0.0 || update.height <= 0.0 {
        return Err(SevenError::OperationRejected("Área do link inválida".into()));
    }
    validate_link_style(update.border_width, update.border_color)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_object_id(&update.object_id)?;
    let mut annotation = document
        .get_object(id)
        .map_err(|_| SevenError::OperationRejected("Link não encontrado".into()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .clone();
    if annotation.get(b"Subtype").ok().and_then(|value| value.as_name().ok()) != Some(b"Link") {
        return Err(SevenError::OperationRejected("Objeto não é uma anotação Link".into()));
    }
    configure_link_target(
        &document,
        &mut annotation,
        &update.target_kind,
        &update.target,
        update.target_page,
        update.named_destination.as_deref(),
    )?;
    annotation.set("Rect", vec![
        update.x.into(),
        update.y.into(),
        (update.x + update.width).into(),
        (update.y + update.height).into(),
    ]);
    annotation.set("Border", vec![0.into(), 0.into(), update.border_width.into()]);
    annotation.set("C", vec![
        update.border_color[0].into(),
        update.border_color[1].into(),
        update.border_color[2].into(),
    ]);
    document.objects.insert(id, Object::Dictionary(annotation));
    atomic_save(document, output)
}

pub fn remove_link(
    input: &Path,
    output: &Path,
    page_index: usize,
    object_id: &str,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_object_id(object_id)?;
    let page_id = page_id(&document, page_index)?;
    let page = document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let annotations = page
        .get_mut(b"Annots")
        .map_err(|_| SevenError::OperationRejected("Página não possui anotações".into()))?
        .as_array_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let before = annotations.len();
    annotations.retain(|value| value.as_reference().ok() != Some(id));
    if annotations.len() == before {
        return Err(SevenError::OperationRejected("Link não encontrado na página".into()));
    }
    document.objects.remove(&id);
    atomic_save(document, output)
}

fn destination_page_index(document: &Document, object: &Object) -> Option<usize> {
    let resolved = match object {
        Object::Reference(id) => document.get_object(*id).ok()?,
        other => other,
    };
    let destination = match resolved {
        Object::Array(values) => Some(values),
        Object::Dictionary(dictionary) => dictionary.get(b"D").ok()?.as_array().ok(),
        _ => None,
    }?;
    let page_id = destination.first()?.as_reference().ok()?;
    page_index_for_id(document, page_id)
}

fn collect_destination_name_tree(
    document: &Document,
    object: &Object,
    output: &mut Vec<NamedDestinationInfo>,
    visited: &mut std::collections::HashSet<ObjectId>,
) {
    match object {
        Object::Reference(id) => {
            if !visited.insert(*id) { return; }
            if let Ok(value) = document.get_object(*id) {
                collect_destination_name_tree(document, value, output, visited);
            }
        }
        Object::Dictionary(dictionary) => {
            if let Ok(Object::Array(names)) = dictionary.get(b"Names") {
                for pair in names.chunks(2) {
                    if pair.len() != 2 { continue; }
                    let name = match &pair[0] {
                        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
                        _ => continue,
                    };
                    output.push(NamedDestinationInfo {
                        name,
                        page_index: destination_page_index(document, &pair[1]),
                        editable: false,
                    });
                }
            }
            if let Ok(Object::Array(kids)) = dictionary.get(b"Kids") {
                for kid in kids {
                    collect_destination_name_tree(document, kid, output, visited);
                }
            }
        }
        _ => {}
    }
}

pub fn list_named_destinations(input: &Path) -> Result<Vec<NamedDestinationInfo>, SevenError> {
    let document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let catalog = document.catalog().map_err(|error| SevenError::Operation(error.to_string()))?;
    let mut output = Vec::new();

    if let Ok(dests_object) = catalog.get(b"Dests") {
        let dests = match dests_object {
            Object::Dictionary(dictionary) => Some(dictionary),
            Object::Reference(id) => document.get_object(*id).ok().and_then(|object| object.as_dict().ok()),
            _ => None,
        };
        if let Some(dests) = dests {
            for (name, value) in dests.iter() {
                output.push(NamedDestinationInfo {
                    name: String::from_utf8_lossy(name).into_owned(),
                    page_index: destination_page_index(&document, value),
                    editable: true,
                });
            }
        }
    }

    if let Ok(names_object) = catalog.get(b"Names") {
        let names = match names_object {
            Object::Dictionary(dictionary) => Some(dictionary),
            Object::Reference(id) => document.get_object(*id).ok().and_then(|object| object.as_dict().ok()),
            _ => None,
        };
        if let Some(names) = names {
            if let Ok(dests) = names.get(b"Dests") {
                collect_destination_name_tree(
                    &document,
                    dests,
                    &mut output,
                    &mut std::collections::HashSet::new(),
                );
            }
        }
    }

    output.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    output.dedup_by(|left, right| left.name == right.name);
    Ok(output)
}

fn ensure_legacy_dests_id(document: &mut Document) -> Result<ObjectId, SevenError> {
    let root_id = document
        .trailer
        .get(b"Root")
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_reference()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let existing = document
        .get_object(root_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"Dests")
        .ok()
        .cloned();

    match existing {
        Some(Object::Reference(id)) => Ok(id),
        Some(Object::Dictionary(dictionary)) => {
            let id = document.add_object(dictionary);
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Dests", id);
            Ok(id)
        }
        Some(_) => Err(SevenError::Operation("Catálogo /Dests inválido".into())),
        None => {
            let id = document.add_object(Dictionary::new());
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Dests", id);
            Ok(id)
        }
    }
}

pub fn upsert_named_destination(
    input: &Path,
    output: &Path,
    old_name: Option<&str>,
    name: &str,
    page_index: usize,
) -> Result<(), SevenError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Nome do destino inválido".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let target_page = page_id(&document, page_index)?;
    let dests_id = ensure_legacy_dests_id(&mut document)?;

    let dests = document
        .get_object_mut(dests_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if let Some(old_name) = old_name.map(str::trim).filter(|value| !value.is_empty()) {
        if old_name != name {
            if dests.remove(old_name.as_bytes()).is_none() {
                return Err(SevenError::OperationRejected(
                    "Destino pertence a uma name tree externa e não pode ser renomeado por este editor".into(),
                ));
            }
        }
    }
    dests.set(
        name,
        vec![Object::Reference(target_page), Object::Name(b"Fit".to_vec())],
    );
    atomic_save(document, output)
}

pub fn remove_named_destination(
    input: &Path,
    output: &Path,
    name: &str,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let dests_id = ensure_legacy_dests_id(&mut document)?;
    let removed = document
        .get_object_mut(dests_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .remove(name.as_bytes())
        .is_some();
    if !removed {
        return Err(SevenError::OperationRejected(
            "Destino não pertence ao dicionário editável /Dests".into(),
        ));
    }
    atomic_save(document, output)
}

pub fn add_link(input: &Path, output: &Path, link: LinkPlacement) -> Result<(), SevenError> {
    if link.width <= 0.0 || link.height <= 0.0 {
        return Err(SevenError::OperationRejected("Área do link inválida".into()));
    }
    validate_link_style(link.border_width, link.border_color)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, link.page_index)?;
    let mut annotation = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Link",
        "Rect" => vec![
            link.x.into(),
            link.y.into(),
            (link.x + link.width).into(),
            (link.y + link.height).into(),
        ],
        "Border" => vec![0.into(), 0.into(), link.border_width.into()],
        "C" => vec![
            link.border_color[0].into(),
            link.border_color[1].into(),
            link.border_color[2].into(),
        ],
        "H" => "I",
        "F" => 4,
    };
    configure_link_target(
        &document,
        &mut annotation,
        &link.target_kind,
        &link.target,
        link.target_page,
        link.named_destination.as_deref(),
    )?;
    let annotation_id = document.add_object(annotation);
    let page = document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    match page.get_mut(b"Annots") {
        Ok(Object::Array(values)) => values.push(annotation_id.into()),
        Ok(_) => return Err(SevenError::Operation("Estrutura /Annots inválida".into())),
        Err(_) => page.set("Annots", vec![annotation_id.into()]),
    }
    atomic_save(document, output)
}

fn apply_overlay_text_to_document(
    document: &mut Document,
    options: &OverlayTextOptions,
    element_id: &str,
) -> Result<(), SevenError> {
    if options.font_size < 1.0 || options.font_size > 200.0 {
        return Err(SevenError::OperationRejected("Fonte inválida".into()));
    }
    if options.digits == 0 || options.digits > 20 {
        return Err(SevenError::OperationRejected("Quantidade de dígitos inválida".into()));
    }
    if !(0.0..=1.0).contains(&options.opacity) {
        return Err(SevenError::OperationRejected("Opacidade inválida".into()));
    }
    if !(0.01..=10.0).contains(&options.image_scale) {
        return Err(SevenError::OperationRejected("Escala da imagem inválida".into()));
    }
    if !matches!(options.parity.as_str(), "all" | "odd" | "even") {
        return Err(SevenError::OperationRejected("Paridade inválida".into()));
    }

    let total = document.get_pages().len();
    if total == 0 {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }
    let start = options.page_start.min(total.saturating_sub(1));
    let end = options.page_end.unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));
    if start > end {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }

    let image_object = if options.kind == "watermark" {
        if let Some(path) = options.image_path.as_ref().filter(|value| !value.trim().is_empty()) {
            let path = Path::new(path);
            if !path.is_file() {
                return Err(SevenError::NotFound(path.to_string_lossy().into_owned()));
            }
            let stream = lopdf::xobject::image(path)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let dimensions = image::image_dimensions(path)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            Some((document.add_object(stream), dimensions))
        } else {
            None
        }
    } else {
        None
    };

    let options_json = serde_json::to_string(options)
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    for index in start..=end {
        let page_number = index + 1;
        let should_apply = match options.parity.as_str() {
            "all" => true,
            "odd" => page_number % 2 == 1,
            "even" => page_number % 2 == 0,
            _ => false,
        };
        if !should_apply {
            continue;
        }

        let id = page_id(document, index)?;
        let (page_width, page_height) = page_dimensions(document, id);
        let gs = ensure_ext_gstate(document, id, options.opacity)?;

        if let Some((image_id, (pixel_width, pixel_height))) = image_object {
            let name = format!("SRWM{}", image_id.0);
            document
                .add_xobject(id, name.as_bytes(), image_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?;

            let aspect = if pixel_height == 0 { 1.0 } else { f64::from(pixel_width) / f64::from(pixel_height) };
            let base_width = page_width * 0.35 * options.image_scale;
            let width = base_width.min(page_width * 0.95);
            let height = (width / aspect.max(0.001)).min(page_height * 0.95);
            let x = match options.position.as_str() {
                "left" => options.margin_x,
                "center" => (page_width - width) / 2.0,
                "right" => (page_width - options.margin_x - width).max(0.0),
                _ => return Err(SevenError::OperationRejected("Posição inválida".into())),
            };
            let y = (page_height - height) / 2.0;
            let radians = options.rotation.to_radians();
            let cos = radians.cos();
            let sin = radians.sin();

            let bytes = Content {
                operations: vec![
                    Operation::new("q", vec![]),
                    Operation::new("gs", vec![Object::Name(gs)]),
                    Operation::new("cm", vec![
                        (width * cos).into(),
                        (width * sin).into(),
                        (-height * sin).into(),
                        (height * cos).into(),
                        x.into(),
                        y.into(),
                    ]),
                    Operation::new("Do", vec![Object::Name(name.into_bytes())]),
                    Operation::new("Q", vec![]),
                ],
            }
            .encode()
            .map_err(|error| SevenError::Operation(error.to_string()))?;

            add_managed_content_stream(
                document,
                id,
                bytes,
                element_id,
                &options.kind,
                &options_json,
                false,
            )?;
            continue;
        }

        let template = match options.kind.as_str() {
            "page-number" => {
                let number = options.start_number + (index - start) as u64;
                format!("{}{}{}", options.prefix, number, options.suffix)
            }
            "bates" => {
                let number = options.start_number + (index - start) as u64;
                format!(
                    "{}{:0width$}{}",
                    options.prefix,
                    number,
                    options.suffix,
                    width = options.digits as usize
                )
            }
            _ => render_overlay_template(&options.text, index, total),
        };

        let x = align_x(
            &options.position,
            page_width,
            options.margin_x,
            &template,
            options.font_size,
        )?;
        let y = match options.kind.as_str() {
            "header" => (page_height - options.margin_y - options.font_size).max(0.0),
            "footer" | "page-number" | "bates" => options.margin_y,
            "watermark" => page_height * 0.5,
            _ => return Err(SevenError::OperationRejected("Tipo de overlay inválido".into())),
        };
        let font = ensure_helvetica(document, id)?;
        let mut operations = vec![
            Operation::new("q", vec![]),
            Operation::new("gs", vec![Object::Name(gs)]),
        ];
        operations.extend(text_operations(
            font,
            &TextPlacement {
                page_index: index,
                text: template,
                x,
                y,
                font_size: options.font_size,
                rotation: options.rotation,
                gray: if options.kind == "watermark" { 0.55 } else { 0.2 },
            },
        ));
        operations.push(Operation::new("Q", vec![]));

        let bytes = Content { operations }
            .encode()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        add_managed_content_stream(
            document,
            id,
            bytes,
            element_id,
            &options.kind,
            &options_json,
            false,
        )?;
    }
    Ok(())
}

pub fn add_overlay_text(
    input: &Path,
    output: &Path,
    options: OverlayTextOptions,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let element_id = uuid::Uuid::new_v4().to_string();
    apply_overlay_text_to_document(&mut document, &options, &element_id)?;
    atomic_save(document, output)
}

pub fn update_overlay_text(
    input: &Path,
    output: &Path,
    element_id: &str,
    options: OverlayTextOptions,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let removed = remove_managed_element_from_document(&mut document, element_id)?;
    if removed == 0 {
        return Err(SevenError::OperationRejected("Overlay gerenciado não encontrado".into()));
    }
    apply_overlay_text_to_document(&mut document, &options, element_id)?;
    atomic_save(document, output)
}

fn apply_background_to_document(
    document: &mut Document,
    options: &BackgroundOptions,
    element_id: &str,
) -> Result<(), SevenError> {
    for component in [options.red, options.green, options.blue, options.opacity] {
        if !(0.0..=1.0).contains(&component) {
            return Err(SevenError::OperationRejected("Cor/opacidade de fundo inválida".into()));
        }
    }
    if !(0.01..=10.0).contains(&options.image_scale) {
        return Err(SevenError::OperationRejected("Escala de imagem de fundo inválida".into()));
    }
    if !matches!(options.position.as_str(), "center" | "stretch" | "tile") {
        return Err(SevenError::OperationRejected("Posição do fundo inválida".into()));
    }

    let total = document.get_pages().len();
    if total == 0 {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }
    let start = options.page_start.min(total.saturating_sub(1));
    let end = options.page_end.unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));
    if start > end {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }

    let image_object = if let Some(path) = options.image_path.as_ref().filter(|value| !value.trim().is_empty()) {
        let path = Path::new(path);
        if !path.is_file() {
            return Err(SevenError::NotFound(path.to_string_lossy().into_owned()));
        }
        let stream = lopdf::xobject::image(path)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let dimensions = image::image_dimensions(path)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        Some((document.add_object(stream), dimensions))
    } else {
        None
    };

    let options_json = serde_json::to_string(options)
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    for index in start..=end {
        let id = page_id(document, index)?;
        let (width, height) = page_dimensions(document, id);
        let gs = ensure_ext_gstate(document, id, options.opacity)?;
        let mut operations = vec![
            Operation::new("q", vec![]),
            Operation::new("gs", vec![Object::Name(gs.clone())]),
            Operation::new("rg", vec![options.red.into(), options.green.into(), options.blue.into()]),
            Operation::new("re", vec![0.into(), 0.into(), width.into(), height.into()]),
            Operation::new("f", vec![]),
        ];

        if let Some((image_id, (pixel_width, pixel_height))) = image_object {
            let name = format!("SRBG{}", image_id.0);
            document
                .add_xobject(id, name.as_bytes(), image_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let aspect = if pixel_height == 0 { 1.0 } else { f64::from(pixel_width) / f64::from(pixel_height) };

            match options.position.as_str() {
                "stretch" => {
                    operations.push(Operation::new("cm", vec![
                        width.into(), 0.into(), 0.into(), height.into(), 0.into(), 0.into(),
                    ]));
                    operations.push(Operation::new("Do", vec![Object::Name(name.into_bytes())]));
                }
                "center" => {
                    let target_width = (width * 0.6 * options.image_scale).min(width);
                    let target_height = (target_width / aspect.max(0.001)).min(height);
                    let x = (width - target_width) / 2.0;
                    let y = (height - target_height) / 2.0;
                    operations.push(Operation::new("cm", vec![
                        target_width.into(), 0.into(), 0.into(), target_height.into(), x.into(), y.into(),
                    ]));
                    operations.push(Operation::new("Do", vec![Object::Name(name.into_bytes())]));
                }
                "tile" => {
                    let tile_width = (width * 0.25 * options.image_scale).max(24.0).min(width);
                    let tile_height = (tile_width / aspect.max(0.001)).max(24.0).min(height);
                    let mut y = 0.0;
                    while y < height {
                        let mut x = 0.0;
                        while x < width {
                            operations.push(Operation::new("q", vec![]));
                            operations.push(Operation::new("cm", vec![
                                tile_width.into(), 0.into(), 0.into(), tile_height.into(), x.into(), y.into(),
                            ]));
                            operations.push(Operation::new("Do", vec![Object::Name(name.as_bytes().to_vec())]));
                            operations.push(Operation::new("Q", vec![]));
                            x += tile_width;
                        }
                        y += tile_height;
                    }
                }
                _ => unreachable!(),
            }
        }

        operations.push(Operation::new("Q", vec![]));
        let bytes = Content { operations }
            .encode()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        add_managed_content_stream(
            document,
            id,
            bytes,
            element_id,
            "background",
            &options_json,
            true,
        )?;
    }
    Ok(())
}

fn roman(mut value: u64, upper: bool) -> String {
    let values = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ];
    let mut output = String::new();
    for (number, glyph) in values {
        while value >= number {
            output.push_str(glyph);
            value -= number;
        }
    }
    if upper { output } else { output.to_ascii_lowercase() }
}

fn letters(mut value: u64, upper: bool) -> String {
    let mut chars = Vec::new();
    while value > 0 {
        value -= 1;
        chars.push((b'A' + (value % 26) as u8) as char);
        value /= 26;
    }
    chars.reverse();
    let output: String = chars.into_iter().collect();
    if upper { output } else { output.to_ascii_lowercase() }
}

fn page_label_number(style: &str, value: u64) -> Result<String, SevenError> {
    if value == 0 {
        return Err(SevenError::OperationRejected("Número de page label deve ser maior que zero".into()));
    }
    match style {
        "decimal" => Ok(value.to_string()),
        "roman-lower" => Ok(roman(value, false)),
        "roman-upper" => Ok(roman(value, true)),
        "letters-lower" => Ok(letters(value, false)),
        "letters-upper" => Ok(letters(value, true)),
        _ => Err(SevenError::OperationRejected("Estilo de page label inválido".into())),
    }
}

pub fn set_page_labels(
    input: &Path,
    output: &Path,
    options: PageLabelOptions,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let total = document.get_pages().len();
    if total == 0 {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }
    let start = options.page_start.min(total.saturating_sub(1));
    let end = options.page_end.unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));
    if start > end || options.start_number == 0 {
        return Err(SevenError::OperationRejected("Intervalo/numeração inválidos".into()));
    }

    let mut nums = Vec::new();
    for page_index in start..=end {
        let sequence = options.start_number + (page_index - start) as u64;
        let number = page_label_number(&options.style, sequence)?;
        let label = format!("{}{}{}", options.prefix, number, options.suffix);
        nums.push((page_index as i64).into());
        nums.push(Object::Dictionary(dictionary! {
            "P" => Object::string_literal(label),
        }));
    }

    if end + 1 < total {
        nums.push(((end + 1) as i64).into());
        nums.push(Object::Dictionary(dictionary! {
            "S" => "D",
            "St" => (end + 2) as i64,
        }));
    }

    document
        .catalog_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("PageLabels", dictionary! { "Nums" => nums });
    atomic_save(document, output)
}


pub fn set_background(
    input: &Path,
    output: &Path,
    options: BackgroundOptions,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let element_id = uuid::Uuid::new_v4().to_string();
    apply_background_to_document(&mut document, &options, &element_id)?;
    atomic_save(document, output)
}

pub fn update_background(
    input: &Path,
    output: &Path,
    element_id: &str,
    options: BackgroundOptions,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let removed = remove_managed_element_from_document(&mut document, element_id)?;
    if removed == 0 {
        return Err(SevenError::OperationRejected("Plano de fundo gerenciado não encontrado".into()));
    }
    apply_background_to_document(&mut document, &options, element_id)?;
    atomic_save(document, output)
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-edit.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}
