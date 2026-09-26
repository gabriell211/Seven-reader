use crate::error::SevenError;
use lopdf::{dictionary, content::Content, Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureTagInfo {
    pub object_id: String,
    pub parent_object_id: Option<String>,
    pub tag_type: String,
    pub title: String,
    pub alt_text: String,
    pub actual_text: String,
    pub page_index: Option<usize>,
    pub depth: usize,
    pub child_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureTagUpdate {
    pub object_id: String,
    pub tag_type: String,
    pub title: String,
    pub alt_text: String,
    pub actual_text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityProperties {
    pub language: String,
    pub title: String,
    pub display_document_title: bool,
}

fn object_id_string(id: ObjectId) -> String {
    format!("{}:{}", id.0, id.1)
}

fn parse_object_id(value: &str) -> Result<ObjectId, SevenError> {
    let (object, generation) = value
        .split_once(':')
        .ok_or_else(|| SevenError::OperationRejected("ID de tag inválido".into()))?;
    Ok((
        object.parse::<u32>().map_err(|_| SevenError::OperationRejected("ID de tag inválido".into()))?,
        generation.parse::<u16>().map_err(|_| SevenError::OperationRejected("ID de tag inválido".into()))?,
    ))
}

fn text(object: &Object) -> String {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        _ => String::new(),
    }
}

fn tag_name(dictionary: &Dictionary) -> String {
    dictionary
        .get(b"S")
        .ok()
        .and_then(|object| object.as_name().ok())
        .map(|value| String::from_utf8_lossy(value).into_owned())
        .unwrap_or_else(|| "Unknown".into())
}

fn struct_root_id(document: &Document) -> Option<ObjectId> {
    document
        .catalog()
        .ok()?
        .get(b"StructTreeRoot")
        .ok()?
        .as_reference()
        .ok()
}

fn page_index_for_id(document: &Document, page_id: ObjectId) -> Option<usize> {
    document
        .get_pages()
        .into_iter()
        .find_map(|(number, id)| (id == page_id).then_some(number.saturating_sub(1) as usize))
}

fn child_refs(object: &Object) -> Vec<ObjectId> {
    match object {
        Object::Reference(id) => vec![*id],
        Object::Array(values) => values.iter().filter_map(|value| value.as_reference().ok()).collect(),
        _ => Vec::new(),
    }
}

fn walk_tag(
    document: &Document,
    id: ObjectId,
    parent: Option<ObjectId>,
    depth: usize,
    output: &mut Vec<StructureTagInfo>,
    visited: &mut std::collections::HashSet<ObjectId>,
) {
    if depth > 128 || !visited.insert(id) {
        return;
    }
    let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { return };
    if dictionary
        .get(b"Type")
        .ok()
        .and_then(|value| value.as_name().ok())
        .is_some_and(|value| value != b"StructElem")
    {
        return;
    }

    let children = dictionary.get(b"K").ok().map(child_refs).unwrap_or_default();
    let page_index = dictionary
        .get(b"Pg")
        .ok()
        .and_then(|value| value.as_reference().ok())
        .and_then(|page_id| page_index_for_id(document, page_id));

    output.push(StructureTagInfo {
        object_id: object_id_string(id),
        parent_object_id: parent.map(object_id_string),
        tag_type: tag_name(dictionary),
        title: dictionary.get(b"T").ok().map(text).unwrap_or_default(),
        alt_text: dictionary.get(b"Alt").ok().map(text).unwrap_or_default(),
        actual_text: dictionary.get(b"ActualText").ok().map(text).unwrap_or_default(),
        page_index,
        depth,
        child_count: children.len(),
    });

    for child in children {
        walk_tag(document, child, Some(id), depth + 1, output, visited);
    }
}

pub fn list_tags(path: &Path) -> Result<Vec<StructureTagInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let Some(root_id) = struct_root_id(&document) else { return Ok(Vec::new()) };
    let root = document
        .get_object(root_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let roots = root.get(b"K").ok().map(child_refs).unwrap_or_default();
    let mut output = Vec::new();
    let mut visited = std::collections::HashSet::new();
    for id in roots {
        walk_tag(&document, id, None, 0, &mut output, &mut visited);
    }
    Ok(output)
}

fn valid_tag_type(value: &str) -> bool {
    matches!(
        value,
        "Document" | "Part" | "Art" | "Sect" | "Div"
            | "BlockQuote" | "Caption" | "TOC" | "TOCI"
            | "P" | "H" | "H1" | "H2" | "H3" | "H4" | "H5" | "H6"
            | "L" | "LI" | "Lbl" | "LBody"
            | "Table" | "TR" | "TH" | "TD" | "THead" | "TBody" | "TFoot"
            | "Span" | "Quote" | "Note" | "Reference" | "BibEntry"
            | "Code" | "Link" | "Annot" | "Ruby" | "Warichu"
            | "Figure" | "Formula" | "Form" | "Artifact"
    )
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-accessibility.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}

pub fn update_properties(
    input: &Path,
    output: &Path,
    properties: AccessibilityProperties,
) -> Result<(), SevenError> {
    let language = properties.language.trim();
    if language.is_empty() || language.chars().count() > 64 {
        return Err(SevenError::OperationRejected("Idioma BCP 47 inválido".into()));
    }
    if properties.title.chars().count() > 1024 {
        return Err(SevenError::OperationRejected("Título excede o limite".into()));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let catalog = document
        .catalog_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    catalog.set("Lang", Object::string_literal(language));

    let mut preferences = match catalog.get(b"ViewerPreferences") {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        _ => Dictionary::new(),
    };
    preferences.set("DisplayDocTitle", properties.display_document_title);
    catalog.set("ViewerPreferences", preferences);

    let info_id = document
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|object| object.as_reference().ok())
        .unwrap_or_else(|| {
            let id = document.add_object(Dictionary::new());
            document.trailer.set("Info", id);
            id
        });
    let info = document
        .get_object_mut(info_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if properties.title.trim().is_empty() {
        info.remove(b"Title");
    } else {
        info.set("Title", Object::string_literal(properties.title.trim()));
    }

    atomic_save(document, output)
}

pub fn update_tag(
    input: &Path,
    output: &Path,
    update: StructureTagUpdate,
) -> Result<(), SevenError> {
    if !valid_tag_type(update.tag_type.trim()) {
        return Err(SevenError::OperationRejected("Tipo de tag PDF inválido".into()));
    }
    if update.title.chars().count() > 1024
        || update.alt_text.chars().count() > 10_000
        || update.actual_text.chars().count() > 100_000
    {
        return Err(SevenError::OperationRejected("Conteúdo da tag excede o limite".into()));
    }

    let id = parse_object_id(&update.object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let dictionary = document
        .get_object_mut(id)
        .map_err(|_| SevenError::OperationRejected("Tag não encontrada".into()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    dictionary.set("S", Object::Name(update.tag_type.trim().as_bytes().to_vec()));

    for (key, value) in [
        (b"T".as_slice(), update.title.trim()),
        (b"Alt".as_slice(), update.alt_text.trim()),
        (b"ActualText".as_slice(), update.actual_text.trim()),
    ] {
        if value.is_empty() {
            dictionary.remove(key);
        } else {
            dictionary.set(key, Object::string_literal(value));
        }
    }

    atomic_save(document, output)
}

fn remove_child_reference(dictionary: &mut Dictionary, child: ObjectId) -> bool {
    let Ok(current) = dictionary.get(b"K").cloned() else { return false };
    match current {
        Object::Reference(id) if id == child => {
            dictionary.remove(b"K");
            true
        }
        Object::Array(mut values) => {
            let before = values.len();
            values.retain(|value| value.as_reference().ok() != Some(child));
            if values.is_empty() {
                dictionary.remove(b"K");
            } else {
                dictionary.set("K", values);
            }
            before != dictionary.get(b"K").ok().and_then(|v| v.as_array().ok()).map(Vec::len).unwrap_or(0)
        }
        _ => false,
    }
}

pub fn delete_tag(
    input: &Path,
    output: &Path,
    object_id: &str,
) -> Result<(), SevenError> {
    let id = parse_object_id(object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let dictionary = document
        .get_object(id)
        .map_err(|_| SevenError::OperationRejected("Tag não encontrada".into()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .clone();
    let children = dictionary.get(b"K").ok().map(child_refs).unwrap_or_default();
    if !children.is_empty() {
        return Err(SevenError::OperationRejected(
            "Remova ou mova as tags filhas antes de excluir este nó".into(),
        ));
    }

    let parent = dictionary.get(b"P").ok().and_then(|value| value.as_reference().ok());
    let parent_id = parent.or_else(|| struct_root_id(&document))
        .ok_or_else(|| SevenError::OperationRejected("Tag sem pai estrutural".into()))?;
    let parent_dictionary = document
        .get_object_mut(parent_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if !remove_child_reference(parent_dictionary, id) {
        return Err(SevenError::OperationRejected("Referência da tag não encontrada no pai".into()));
    }
    document.objects.remove(&id);
    atomic_save(document, output)
}

pub fn move_tag(
    input: &Path,
    output: &Path,
    object_id: &str,
    direction: &str,
) -> Result<(), SevenError> {
    if !matches!(direction, "up" | "down") {
        return Err(SevenError::OperationRejected("Direção de tag inválida".into()));
    }
    let id = parse_object_id(object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let tag = document
        .get_object(id)
        .map_err(|_| SevenError::OperationRejected("Tag não encontrada".into()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let parent_id = tag
        .get(b"P")
        .ok()
        .and_then(|value| value.as_reference().ok())
        .or_else(|| struct_root_id(&document))
        .ok_or_else(|| SevenError::OperationRejected("Pai da tag não encontrado".into()))?;

    let parent = document
        .get_object_mut(parent_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let values = parent
        .get_mut(b"K")
        .map_err(|_| SevenError::OperationRejected("Pai não possui lista de filhos".into()))?
        .as_array_mut()
        .map_err(|_| SevenError::OperationRejected("A ordem deste pai não é uma lista editável".into()))?;
    let index = values
        .iter()
        .position(|value| value.as_reference().ok() == Some(id))
        .ok_or_else(|| SevenError::OperationRejected("Tag não encontrada no pai".into()))?;
    let target = if direction == "up" {
        index.checked_sub(1)
    } else if index + 1 < values.len() {
        Some(index + 1)
    } else {
        None
    }
    .ok_or_else(|| SevenError::OperationRejected("Tag já está no limite da ordem".into()))?;
    values.swap(index, target);
    atomic_save(document, output)
}

fn page_has_text(document: &Document, page_id: ObjectId) -> bool {
    let data = document.get_page_content(page_id);
    let Ok(content) = Content::decode(&data) else { return false };
    content.operations.iter().any(|operation| {
        matches!(operation.operator.as_str(), "Tj" | "TJ" | "'" | """)
    })
}

pub fn auto_tag_basic(
    input: &Path,
    output: &Path,
) -> Result<usize, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if struct_root_id(&document).is_some() {
        return Err(SevenError::OperationRejected(
            "O PDF já possui StructTreeRoot; o autotag básico não sobrescreve uma estrutura existente".into(),
        ));
    }
    let pages = document.get_pages();
    if pages.is_empty() {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }

    let root_id = document.new_object_id();
    let document_elem_id = document.new_object_id();
    let parent_tree_id = document.new_object_id();
    let mut page_elements = Vec::new();
    let mut parent_nums = Vec::new();

    for (page_number, page_id) in &pages {
        let page_index = page_number.saturating_sub(1) as usize;
        let has_text = page_has_text(&document, *page_id);
        let tag_type = if has_text { "P" } else { "Figure" };
        let element_id = document.new_object_id();

        let raw_content = document.get_page_content(*page_id);
        let wrapped = if raw_content.is_empty() {
            format!("/{tag_type} << /MCID 0 >> BDC\nEMC\n").into_bytes()
        } else {
            let mut bytes = format!("/{tag_type} << /MCID 0 >> BDC\n").into_bytes();
            bytes.extend_from_slice(&raw_content);
            bytes.extend_from_slice(b"\nEMC\n");
            bytes
        };
        let stream_id = document.add_object(Stream::new(Dictionary::new(), wrapped));
        let page = document
            .get_object_mut(*page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        page.set("Contents", stream_id);
        page.set("StructParents", page_index as i64);
        page.set("Tabs", "S");

        let mut element = dictionary! {
            "Type" => "StructElem",
            "S" => tag_type,
            "P" => document_elem_id,
            "Pg" => *page_id,
            "K" => 0i64,
        };
        if !has_text {
            element.set("Alt", Object::string_literal(format!("Imagem da página {}", page_index + 1)));
        }
        document.objects.insert(element_id, Object::Dictionary(element));
        page_elements.push(Object::Reference(element_id));
        parent_nums.push(Object::Integer(page_index as i64));
        parent_nums.push(Object::Array(vec![Object::Reference(element_id)]));
    }

    document.objects.insert(
        document_elem_id,
        Object::Dictionary(dictionary! {
            "Type" => "StructElem",
            "S" => "Document",
            "P" => root_id,
            "K" => page_elements,
        }),
    );
    document.objects.insert(
        parent_tree_id,
        Object::Dictionary(dictionary! {
            "Nums" => parent_nums,
        }),
    );
    document.objects.insert(
        root_id,
        Object::Dictionary(dictionary! {
            "Type" => "StructTreeRoot",
            "K" => vec![Object::Reference(document_elem_id)],
            "ParentTree" => parent_tree_id,
            "ParentTreeNextKey" => pages.len() as i64,
        }),
    );

    let catalog = document
        .catalog_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    catalog.set("StructTreeRoot", root_id);
    catalog.set("MarkInfo", dictionary! { "Marked" => true });

    atomic_save(document, output)?;
    Ok(pages.len())
}
