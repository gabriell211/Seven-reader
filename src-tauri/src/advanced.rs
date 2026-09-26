use crate::error::SevenError;
use lopdf::{content::{Content, Operation}, dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs, path::{Path, PathBuf}};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkInfo {
    pub object_id: String,
    pub parent_object_id: Option<String>,
    pub title: String,
    pub depth: usize,
    pub page_index: Option<usize>,
    pub open: bool,
    pub has_children: bool,
    pub bold: bool,
    pub italic: bool,
    pub color: [f64; 3],
    pub action_type: String,
    pub action_target: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkInput {
    pub title: String,
    pub page_index: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkUpdate {
    pub object_id: String,
    pub title: String,
    pub action_type: String,
    pub target_page: Option<usize>,
    pub target: String,
    pub bold: bool,
    pub italic: bool,
    pub color: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInfo {
    pub name: String,
    pub description: String,
    pub size: Option<usize>,
    pub mime: String,
    pub sha256: String,
    pub object_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerInfo {
    pub object_id: String,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub depth: usize,
    pub view_state: String,
    pub print_state: String,
    pub export_state: String,
    pub intent: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerPropertiesUpdate {
    pub object_id: String,
    pub name: String,
    pub locked: bool,
    pub view_state: String,
    pub print_state: String,
    pub export_state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfActionInfo {
    pub object_id: String,
    pub action_type: String,
    pub target: String,
    pub blocked: bool,
    pub automatic: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedPdfReport {
    pub bookmarks: Vec<BookmarkInfo>,
    pub attachments: Vec<AttachmentInfo>,
    pub layers: Vec<LayerInfo>,
    pub is_portfolio: bool,
    pub portfolio_view: Option<String>,
    pub has_rich_media: bool,
    pub has_three_d: bool,
    pub has_geospatial: bool,
    pub has_articles: bool,
    pub has_javascript: bool,
    pub has_launch_actions: bool,
    pub has_open_action: bool,
    pub suspicious_actions: usize,
}

fn object_text(object: &Object) -> String {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        _ => String::new(),
    }
}

fn parse_id(value: &str) -> Result<ObjectId, SevenError> {
    let (a, b) = value
        .split_once(':')
        .ok_or_else(|| SevenError::OperationRejected("Object ID inválido".into()))?;
    Ok((
        a.parse().map_err(|_| SevenError::OperationRejected("Object ID inválido".into()))?,
        b.parse().map_err(|_| SevenError::OperationRejected("Object ID inválido".into()))?,
    ))
}

fn id_string(id: ObjectId) -> String {
    format!("{}:{}", id.0, id.1)
}

fn page_index_for_id(document: &Document, page_id: ObjectId) -> Option<usize> {
    document
        .get_pages()
        .values()
        .position(|candidate| *candidate == page_id)
}

fn bookmark_target(document: &Document, dictionary: &Dictionary) -> Option<usize> {
    if let Ok(Object::Array(dest)) = dictionary.get(b"Dest") {
        if let Some(Object::Reference(page_id)) = dest.first() {
            return page_index_for_id(document, *page_id);
        }
    }
    if let Ok(Object::Dictionary(action)) = dictionary.get(b"A") {
        if matches!(action.get(b"S"), Ok(Object::Name(name)) if name.as_slice() == b"GoTo") {
            if let Ok(Object::Array(dest)) = action.get(b"D") {
                if let Some(Object::Reference(page_id)) = dest.first() {
                    return page_index_for_id(document, *page_id);
                }
            }
        }
    }
    None
}

fn bookmark_style(dictionary: &Dictionary) -> (bool, bool, [f64; 3]) {
    let flags = dictionary
        .get(b"F")
        .ok()
        .and_then(|value| value.as_i64().ok())
        .unwrap_or(0);
    let color = dictionary
        .get(b"C")
        .ok()
        .and_then(|value| value.as_array().ok())
        .and_then(|values| {
            if values.len() < 3 { return None; }
            let component = |value: &Object| match value {
                Object::Integer(value) => Some(*value as f64),
                Object::Real(value) => Some(f64::from(*value)),
                _ => None,
            };
            Some([
                component(&values[0])?,
                component(&values[1])?,
                component(&values[2])?,
            ])
        })
        .unwrap_or([0.0, 0.0, 0.0]);
    (flags & 2 != 0, flags & 1 != 0, color)
}

fn bookmark_action_info(document: &Document, dictionary: &Dictionary) -> (String, String) {
    if let Ok(Object::Array(_)) = dictionary.get(b"Dest") {
        return ("goto".into(), bookmark_target(document, dictionary)
            .map(|page| format!("{}", page + 1))
            .unwrap_or_default());
    }
    let action = match dictionary.get(b"A") {
        Ok(Object::Dictionary(action)) => Some(action),
        Ok(Object::Reference(id)) => document.get_object(*id).ok().and_then(|value| value.as_dict().ok()),
        _ => None,
    };
    let Some(action) = action else { return ("none".into(), String::new()) };
    let kind = action
        .get(b"S")
        .ok()
        .and_then(|value| value.as_name().ok())
        .unwrap_or_default();
    match kind {
        b"GoTo" => ("goto".into(), bookmark_target(document, dictionary)
            .map(|page| format!("{}", page + 1))
            .unwrap_or_default()),
        b"URI" => ("uri".into(), action.get(b"URI").ok().map(object_text).unwrap_or_default()),
        b"GoToR" => ("file".into(), action.get(b"F").ok().map(object_text).unwrap_or_default()),
        _ => (String::from_utf8_lossy(kind).to_lowercase(), String::new()),
    }
}

fn walk_bookmarks(
    document: &Document,
    first: Option<ObjectId>,
    parent: Option<ObjectId>,
    depth: usize,
    output: &mut Vec<BookmarkInfo>,
    visited: &mut HashSet<ObjectId>,
) {
    let mut current = first;
    while let Some(id) = current {
        if !visited.insert(id) || visited.len() > 50_000 {
            break;
        }
        let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { break };
        let child = dictionary.get(b"First").ok().and_then(|value| value.as_reference().ok());
        let (bold, italic, color) = bookmark_style(dictionary);
        let (action_type, action_target) = bookmark_action_info(document, dictionary);
        output.push(BookmarkInfo {
            object_id: id_string(id),
            parent_object_id: parent.map(id_string),
            title: dictionary.get(b"Title").ok().map(object_text).unwrap_or_default(),
            depth,
            page_index: bookmark_target(document, dictionary),
            open: dictionary.get(b"Count").ok().and_then(|value| value.as_i64().ok()).unwrap_or(0) >= 0,
            has_children: child.is_some(),
            bold,
            italic,
            color,
            action_type,
            action_target,
        });
        if child.is_some() {
            walk_bookmarks(document, child, Some(id), depth + 1, output, visited);
        }
        current = dictionary.get(b"Next").ok().and_then(|value| value.as_reference().ok());
    }
}

fn bookmark_list(document: &Document) -> Vec<BookmarkInfo> {
    let Some(outlines_id) = document
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"Outlines").ok())
        .and_then(|value| value.as_reference().ok())
    else {
        return Vec::new();
    };
    let first = document
        .get_object(outlines_id)
        .ok()
        .and_then(|value| value.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"First").ok())
        .and_then(|value| value.as_reference().ok());
    let mut output = Vec::new();
    let mut visited = HashSet::new();
    walk_bookmarks(document, first, None, 0, &mut output, &mut visited);
    output
}

fn name_tree_pairs(document: &Document, root: &Object, output: &mut Vec<(String, ObjectId)>, visited: &mut HashSet<ObjectId>) {
    match root {
        Object::Reference(id) => {
            if !visited.insert(*id) { return; }
            if let Ok(object) = document.get_object(*id) {
                name_tree_pairs(document, object, output, visited);
            }
        }
        Object::Dictionary(dictionary) => {
            if let Ok(Object::Array(names)) = dictionary.get(b"Names") {
                for pair in names.chunks(2) {
                    if pair.len() != 2 { continue; }
                    let name = object_text(&pair[0]);
                    if let Ok(id) = pair[1].as_reference() {
                        output.push((name, id));
                    }
                }
            }
            if let Ok(Object::Array(kids)) = dictionary.get(b"Kids") {
                for kid in kids {
                    name_tree_pairs(document, kid, output, visited);
                }
            }
        }
        _ => {}
    }
}

fn attachment_mime_from_name(name: &str) -> String {
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        "xml" => "application/xml",
        "html" | "htm" => "text/html",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "tif" | "tiff" => "image/tiff",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .to_owned()
}

fn attachment_is_dangerous(name: &str) -> bool {
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "exe" | "dll" | "com" | "bat" | "cmd" | "ps1" | "psm1" | "vbs" | "vbe"
            | "js" | "jse" | "wsf" | "wsh" | "scr" | "msi" | "msp" | "reg" | "lnk"
            | "hta" | "cpl" | "jar"
    )
}

fn attachment_stream<'a>(document: &'a Document, spec: &'a Dictionary) -> Option<&'a Stream> {
    let ef = spec.get(b"EF").ok()?.as_dict().ok()?;
    let stream_id = ef
        .get(b"UF")
        .or_else(|_| ef.get(b"F"))
        .ok()?
        .as_reference()
        .ok()?;
    document.get_object(stream_id).ok()?.as_stream().ok()
}

fn embedded_files_root_id(document: &Document) -> Option<ObjectId> {
    let names = document.catalog().ok()?.get(b"Names").ok()?;
    let names = match names {
        Object::Reference(id) => document.get_object(*id).ok()?.as_dict().ok()?,
        Object::Dictionary(dictionary) => dictionary,
        _ => return None,
    };
    let embedded = names.get(b"EmbeddedFiles").ok()?;
    match embedded {
        Object::Reference(id) => Some(*id),
        _ => None,
    }
}

fn collect_name_tree_node_ids(
    document: &Document,
    id: ObjectId,
    output: &mut Vec<ObjectId>,
    visited: &mut HashSet<ObjectId>,
) {
    if !visited.insert(id) {
        return;
    }
    output.push(id);
    let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { return };
    if let Ok(Object::Array(kids)) = dictionary.get(b"Kids") {
        for kid in kids {
            if let Ok(kid_id) = kid.as_reference() {
                collect_name_tree_node_ids(document, kid_id, output, visited);
            }
        }
    }
}

fn find_attachment_name_entry(document: &Document, spec_id: ObjectId) -> Option<(ObjectId, usize)> {
    let root = embedded_files_root_id(document)?;
    let mut nodes = Vec::new();
    collect_name_tree_node_ids(document, root, &mut nodes, &mut HashSet::new());
    for node_id in nodes {
        let dictionary = document.get_object(node_id).ok()?.as_dict().ok()?;
        let Ok(Object::Array(names)) = dictionary.get(b"Names") else { continue };
        for index in (0..names.len()).step_by(2) {
            if index + 1 >= names.len() { break; }
            if names[index + 1].as_reference().ok() == Some(spec_id) {
                return Some((node_id, index));
            }
        }
    }
    None
}

fn attachment_list(document: &Document) -> Vec<AttachmentInfo> {
    let Some(names) = document.catalog().ok().and_then(|c| c.get(b"Names").ok()) else { return Vec::new() };
    let names_dict = match names {
        Object::Dictionary(d) => Some(d),
        Object::Reference(id) => document.get_object(*id).ok().and_then(|o| o.as_dict().ok()),
        _ => None,
    };
    let Some(embedded) = names_dict.and_then(|d| d.get(b"EmbeddedFiles").ok()) else { return Vec::new() };
    let mut pairs = Vec::new();
    name_tree_pairs(document, embedded, &mut pairs, &mut HashSet::new());
    pairs
        .into_iter()
        .filter_map(|(name, id)| {
            let spec = document.get_object(id).ok()?.as_dict().ok()?;
            let description = spec.get(b"Desc").ok().map(object_text).unwrap_or_default();
            let stream = attachment_stream(document, spec)?;
            let data = stream.decompressed_content().unwrap_or_else(|_| stream.content.clone());
            let size = Some(data.len());
            let mime = stream
                .dict
                .get(b"Subtype")
                .ok()
                .map(object_text)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| attachment_mime_from_name(&name));
            let sha256 = hex::encode(Sha256::digest(&data));
            Some(AttachmentInfo { name, description, size, mime, sha256, object_id: id_string(id) })
        })
        .collect()
}

fn resolved_dictionary<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Reference(id) => document.get_object(*id).ok()?.as_dict().ok(),
        _ => None,
    }
}

fn usage_state(dictionary: &Dictionary, category: &[u8], key: &[u8]) -> String {
    dictionary
        .get(b"Usage")
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|usage| usage.get(category).ok())
        .and_then(|object| object.as_dict().ok())
        .and_then(|category| category.get(key).ok())
        .and_then(|object| object.as_name().ok())
        .map(|value| String::from_utf8_lossy(value).to_ascii_lowercase())
        .filter(|value| matches!(value.as_str(), "on" | "off"))
        .unwrap_or_else(|| "unchanged".into())
}

fn collect_layer_depths(object: &Object, depth: usize, output: &mut HashMap<ObjectId, usize>) {
    match object {
        Object::Reference(id) => {
            output.entry(*id).or_insert(depth);
        }
        Object::Array(values) => {
            let mut first = true;
            for value in values {
                if first && matches!(value, Object::String(_, _) | Object::Name(_)) {
                    first = false;
                    continue;
                }
                collect_layer_depths(value, depth + usize::from(!first), output);
                first = false;
            }
        }
        _ => {}
    }
}

fn layer_list(document: &Document) -> Vec<LayerInfo> {
    let Some(oc) = document.catalog().ok().and_then(|catalog| catalog.get(b"OCProperties").ok()) else {
        return Vec::new();
    };
    let Some(oc_dict) = resolved_dictionary(document, oc) else { return Vec::new() };
    let default = oc_dict.get(b"D").ok().and_then(|object| resolved_dictionary(document, object));

    let on_ids = default
        .and_then(|dictionary| dictionary.get(b"ON").ok())
        .and_then(|object| object.as_array().ok())
        .map(|values| values.iter().filter_map(|object| object.as_reference().ok()).collect::<HashSet<_>>())
        .unwrap_or_default();
    let off_ids = default
        .and_then(|dictionary| dictionary.get(b"OFF").ok())
        .and_then(|object| object.as_array().ok())
        .map(|values| values.iter().filter_map(|object| object.as_reference().ok()).collect::<HashSet<_>>())
        .unwrap_or_default();
    let locked_ids = default
        .and_then(|dictionary| dictionary.get(b"Locked").ok())
        .and_then(|object| object.as_array().ok())
        .map(|values| values.iter().filter_map(|object| object.as_reference().ok()).collect::<HashSet<_>>())
        .unwrap_or_default();
    let base_on = default
        .and_then(|dictionary| dictionary.get(b"BaseState").ok())
        .and_then(|object| object.as_name().ok())
        .map(|name| name != b"OFF")
        .unwrap_or(true);

    let mut depths = HashMap::new();
    if let Some(order) = default.and_then(|dictionary| dictionary.get(b"Order").ok()) {
        collect_layer_depths(order, 0, &mut depths);
    }

    oc_dict
        .get(b"OCGs")
        .ok()
        .and_then(|object| object.as_array().ok())
        .map(|values| {
            values
                .iter()
                .filter_map(|entry| {
                    let id = entry.as_reference().ok()?;
                    let dictionary = document.get_object(id).ok()?.as_dict().ok()?;
                    let name = dictionary.get(b"Name").ok().map(object_text).unwrap_or_else(|| id_string(id));
                    let intent = dictionary
                        .get(b"Intent")
                        .ok()
                        .map(|object| match object {
                            Object::Name(value) => vec![String::from_utf8_lossy(value).into_owned()],
                            Object::Array(values) => values.iter().map(object_text).filter(|value| !value.is_empty()).collect(),
                            _ => Vec::new(),
                        })
                        .unwrap_or_default();
                    let visible = if on_ids.contains(&id) {
                        true
                    } else if off_ids.contains(&id) {
                        false
                    } else {
                        base_on
                    };
                    Some(LayerInfo {
                        object_id: id_string(id),
                        name,
                        visible,
                        locked: locked_ids.contains(&id),
                        depth: depths.get(&id).copied().unwrap_or(0),
                        view_state: usage_state(dictionary, b"View", b"ViewState"),
                        print_state: usage_state(dictionary, b"Print", b"PrintState"),
                        export_state: usage_state(dictionary, b"Export", b"ExportState"),
                        intent,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn scan_active_content(document: &Document) -> (bool, bool, bool, bool, bool, usize) {
    let mut rich = false;
    let mut three_d = false;
    let mut geo = false;
    let mut js = false;
    let mut launch = false;
    let mut suspicious = 0usize;
    for object in document.objects.values() {
        let Ok(dictionary) = object.as_dict() else { continue };
        let subtype = dictionary.get(b"Subtype").ok().map(object_text).unwrap_or_default();
        if matches!(subtype.as_str(), "RichMedia" | "Movie" | "Sound" | "Screen") {
            rich = true;
        }
        if subtype == "3D" || dictionary.get(b"3DD").is_ok() {
            three_d = true;
        }
        if dictionary.get(b"Measure").is_ok() || dictionary.get(b"VP").is_ok() || dictionary.get(b"GPTS").is_ok() || dictionary.get(b"LPTS").is_ok() {
            geo = true;
        }
        let action = dictionary.get(b"S").ok().map(object_text).unwrap_or_default();
        if action == "JavaScript" || dictionary.get(b"JS").is_ok() {
            js = true;
            suspicious += 1;
        }
        if action == "Launch" {
            launch = true;
            suspicious += 1;
        }
    }
    let articles = document.catalog().ok().is_some_and(|c| c.get(b"Threads").is_ok());
    (rich, three_d, geo, js, launch, suspicious + usize::from(articles && false))
}

fn resolved_text(document: &Document, object: &Object, max_chars: usize) -> String {
    let value = match object {
        Object::String(bytes, _) | Object::Name(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        Object::Reference(id) => match document.get_object(*id) {
            Ok(Object::String(bytes, _)) | Ok(Object::Name(bytes)) => String::from_utf8_lossy(bytes).into_owned(),
            Ok(Object::Stream(stream)) => String::from_utf8_lossy(
                &stream.decompressed_content().unwrap_or_else(|_| stream.content.clone()),
            ).into_owned(),
            _ => String::new(),
        },
        _ => String::new(),
    };
    value.chars().take(max_chars).collect()
}

pub fn list_actions(path: &Path) -> Result<Vec<PdfActionInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let open_action = document
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"OpenAction").ok())
        .and_then(|object| object.as_reference().ok());

    let mut actions = Vec::new();
    for (id, object) in &document.objects {
        let Ok(dictionary) = object.as_dict() else { continue };
        let action_type = dictionary
            .get(b"S")
            .ok()
            .and_then(|value| value.as_name().ok())
            .map(|value| String::from_utf8_lossy(value).into_owned());
        let Some(action_type) = action_type else { continue };
        if !matches!(
            action_type.as_str(),
            "JavaScript" | "Launch" | "URI" | "GoTo" | "GoToR" | "Named"
                | "SubmitForm" | "ResetForm" | "ImportData" | "Hide" | "SetOCGState"
        ) {
            continue;
        }

        let target = match action_type.as_str() {
            "JavaScript" => dictionary
                .get(b"JS")
                .ok()
                .map(|value| resolved_text(&document, value, 320))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "JavaScript sem conteúdo textual inspecionável".into()),
            "URI" => dictionary
                .get(b"URI")
                .ok()
                .map(|value| resolved_text(&document, value, 1024))
                .unwrap_or_default(),
            "Launch" | "GoToR" | "SubmitForm" | "ImportData" => dictionary
                .get(b"F")
                .ok()
                .map(|value| resolved_text(&document, value, 1024))
                .unwrap_or_default(),
            "Named" => dictionary
                .get(b"N")
                .ok()
                .map(|value| resolved_text(&document, value, 200))
                .unwrap_or_default(),
            _ => dictionary
                .get(b"D")
                .ok()
                .map(|value| format!("{value:?}"))
                .unwrap_or_default()
                .chars()
                .take(320)
                .collect(),
        };

        actions.push(PdfActionInfo {
            object_id: id_string(*id),
            blocked: matches!(action_type.as_str(), "JavaScript" | "Launch" | "ImportData"),
            automatic: open_action == Some(*id),
            action_type,
            target,
        });
    }

    actions.sort_by(|left, right| {
        right
            .automatic
            .cmp(&left.automatic)
            .then_with(|| left.action_type.cmp(&right.action_type))
            .then_with(|| left.object_id.cmp(&right.object_id))
    });
    Ok(actions)
}

pub fn inspect(path: &Path) -> Result<AdvancedPdfReport, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let catalog = document.catalog().map_err(|error| SevenError::Operation(error.to_string()))?;
    let (rich, three_d, geo, js, launch, suspicious) = scan_active_content(&document);
    let is_portfolio = catalog.get(b"Collection").is_ok();
    let portfolio_view = catalog
        .get(b"Collection")
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"View").ok())
        .map(object_text);
    Ok(AdvancedPdfReport {
        bookmarks: bookmark_list(&document),
        attachments: attachment_list(&document),
        layers: layer_list(&document),
        is_portfolio,
        portfolio_view,
        has_rich_media: rich,
        has_three_d: three_d,
        has_geospatial: geo,
        has_articles: catalog.get(b"Threads").is_ok(),
        has_javascript: js,
        has_launch_actions: launch,
        has_open_action: catalog.get(b"OpenAction").is_ok(),
        suspicious_actions: suspicious,
    })
}

pub fn add_attachment(
    input: &Path,
    output: &Path,
    file_path: &Path,
    display_name: &str,
    description: &str,
) -> Result<(), SevenError> {
    if !file_path.is_file() {
        return Err(SevenError::NotFound(file_path.to_string_lossy().into_owned()));
    }
    let data = fs::read(file_path).map_err(|error| SevenError::Io(error.to_string()))?;
    if data.len() > 1024 * 1024 * 1024 {
        return Err(SevenError::OperationRejected("Anexo excede 1 GiB".into()));
    }
    let name = if display_name.trim().is_empty() {
        file_path.file_name().and_then(|v| v.to_str()).unwrap_or("attachment.bin").to_owned()
    } else {
        display_name.trim().to_owned()
    };
    if attachment_is_dangerous(&name) || attachment_is_dangerous(file_path.to_string_lossy().as_ref()) {
        return Err(SevenError::OperationRejected(
            "Extensão de anexo bloqueada pela política de segurança".into(),
        ));
    }
    let mime = attachment_mime_from_name(&name);
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;

    let embedded_stream = Stream::new(
        dictionary! {
            "Type" => "EmbeddedFile",
            "Subtype" => Object::Name(mime.as_bytes().to_vec()),
            "Params" => dictionary! {
                "Size" => data.len() as i64,
                "CheckSum" => Object::String(md5::compute(&data).0.to_vec(), StringFormat::Hexadecimal),
            },
        },
        data,
    );
    let stream_id = document.add_object(embedded_stream);
    let spec_id = document.add_object(dictionary! {
        "Type" => "Filespec",
        "F" => Object::string_literal(&name),
        "UF" => Object::string_literal(&name),
        "Desc" => Object::string_literal(description),
        "EF" => dictionary! { "F" => stream_id, "UF" => stream_id },
    });

    let catalog_id = document.trailer.get(b"Root").map_err(|e| SevenError::Operation(e.to_string()))?.as_reference().map_err(|e| SevenError::Operation(e.to_string()))?;
    let existing_names = document
        .catalog()
        .ok()
        .and_then(|c| c.get(b"Names").ok())
        .cloned();

    let names_id = match existing_names {
        Some(Object::Reference(id)) => id,
        Some(Object::Dictionary(dictionary)) => {
            let id = document.add_object(dictionary);
            document.get_object_mut(catalog_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?.set("Names", id);
            id
        }
        _ => {
            let id = document.add_object(Dictionary::new());
            document.get_object_mut(catalog_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?.set("Names", id);
            id
        }
    };

    let current_embedded = document
        .get_object(names_id).ok()
        .and_then(|o| o.as_dict().ok())
        .and_then(|d| d.get(b"EmbeddedFiles").ok())
        .cloned();

    let embedded_id = match current_embedded {
        Some(Object::Reference(id)) => id,
        Some(Object::Dictionary(dictionary)) => {
            let id = document.add_object(dictionary);
            document.get_object_mut(names_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?.set("EmbeddedFiles", id);
            id
        }
        _ => {
            let id = document.add_object(dictionary! { "Names" => Vec::<Object>::new() });
            document.get_object_mut(names_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?.set("EmbeddedFiles", id);
            id
        }
    };

    let tree = document.get_object_mut(embedded_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?;
    let names = match tree.get_mut(b"Names") {
        Ok(Object::Array(values)) => values,
        _ => {
            tree.set("Names", Vec::<Object>::new());
            match tree.get_mut(b"Names") {
                Ok(Object::Array(values)) => values,
                _ => return Err(SevenError::Operation("Falha ao criar name tree de anexos".into())),
            }
        }
    };
    names.push(Object::string_literal(&name));
    names.push(Object::Reference(spec_id));
    atomic_save(document, output)
}

pub fn update_attachment(
    input: &Path,
    output: &Path,
    object_id: &str,
    name: &str,
    description: &str,
) -> Result<(), SevenError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Nome do anexo inválido".into()));
    }
    if attachment_is_dangerous(name) {
        return Err(SevenError::OperationRejected(
            "Extensão de anexo bloqueada pela política de segurança".into(),
        ));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let spec_id = parse_id(object_id)?;
    let (node_id, key_index) = find_attachment_name_entry(&document, spec_id)
        .ok_or_else(|| SevenError::OperationRejected("Anexo não encontrado na name tree".into()))?;

    {
        let spec = document
            .get_object_mut(spec_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        spec.set("F", Object::string_literal(name));
        spec.set("UF", Object::string_literal(name));
        if description.trim().is_empty() {
            spec.remove(b"Desc");
        } else {
            spec.set("Desc", Object::string_literal(description.trim()));
        }
    }

    if let Ok(node) = document.get_object_mut(node_id).and_then(Object::as_dict_mut) {
        if let Ok(Object::Array(names)) = node.get_mut(b"Names") {
            if key_index < names.len() {
                names[key_index] = Object::string_literal(name);
            }
        }
    }

    atomic_save(document, output)
}

pub fn remove_attachment(
    input: &Path,
    output: &Path,
    object_id: &str,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let spec_id = parse_id(object_id)?;
    let (node_id, key_index) = find_attachment_name_entry(&document, spec_id)
        .ok_or_else(|| SevenError::OperationRejected("Anexo não encontrado na name tree".into()))?;

    let stream_ids = document
        .get_object(spec_id)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|spec| spec.get(b"EF").ok())
        .and_then(|object| object.as_dict().ok())
        .map(|ef| {
            [b"F".as_slice(), b"UF".as_slice()]
                .into_iter()
                .filter_map(|key| ef.get(key).ok().and_then(|value| value.as_reference().ok()))
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();

    if let Ok(node) = document.get_object_mut(node_id).and_then(Object::as_dict_mut) {
        if let Ok(Object::Array(names)) = node.get_mut(b"Names") {
            if key_index + 1 < names.len() {
                names.drain(key_index..=key_index + 1);
            }
        }
    }
    document.objects.remove(&spec_id);
    for id in stream_ids {
        document.objects.remove(&id);
    }

    atomic_save(document, output)
}

pub fn extract_attachment(path: &Path, object_id: &str, destination: &Path) -> Result<(), SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_id(object_id)?;
    let spec = document.get_object(id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict().map_err(|e| SevenError::Operation(e.to_string()))?;
    let ef = spec.get(b"EF").map_err(|e| SevenError::Operation(e.to_string()))?.as_dict().map_err(|e| SevenError::Operation(e.to_string()))?;
    let stream_id = ef.get(b"F").map_err(|e| SevenError::Operation(e.to_string()))?.as_reference().map_err(|e| SevenError::Operation(e.to_string()))?;
    let stream = document.get_object(stream_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_stream().map_err(|e| SevenError::Operation(e.to_string()))?;
    let data = stream.decompressed_content().unwrap_or_else(|_| stream.content.clone());
    fs::write(destination, data).map_err(|error| SevenError::Io(error.to_string()))
}

fn ensure_outlines_id(document: &mut Document) -> Result<ObjectId, SevenError> {
    if let Ok(id) = outlines_id(document) {
        return Ok(id);
    }
    let root_id = document
        .trailer
        .get(b"Root")
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_reference()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let id = document.add_object(dictionary! { "Type" => "Outlines", "Count" => 0 });
    document
        .get_object_mut(root_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Outlines", id);
    Ok(id)
}

fn outlines_id(document: &Document) -> Result<ObjectId, SevenError> {
    document
        .catalog()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"Outlines")
        .map_err(|_| SevenError::OperationRejected("Documento sem árvore de marcadores".into()))?
        .as_reference()
        .map_err(|error| SevenError::Operation(error.to_string()))
}

fn outline_links(
    document: &Document,
    id: ObjectId,
) -> Result<(ObjectId, Option<ObjectId>, Option<ObjectId>), SevenError> {
    let dictionary = document
        .get_object(id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let parent = dictionary
        .get(b"Parent")
        .map_err(|_| SevenError::OperationRejected("Marcador sem Parent".into()))?
        .as_reference()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let prev = dictionary.get(b"Prev").ok().and_then(|value| value.as_reference().ok());
    let next = dictionary.get(b"Next").ok().and_then(|value| value.as_reference().ok());
    Ok((parent, prev, next))
}

fn set_or_remove_ref(dictionary: &mut Dictionary, key: &str, value: Option<ObjectId>) {
    if let Some(value) = value {
        dictionary.set(key, value);
    } else {
        dictionary.remove(key.as_bytes());
    }
}

fn detach_outline_item(document: &mut Document, id: ObjectId) -> Result<ObjectId, SevenError> {
    let (parent, prev, next) = outline_links(document, id)?;

    if let Some(prev_id) = prev {
        let previous = document
            .get_object_mut(prev_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        set_or_remove_ref(previous, "Next", next);
    } else {
        let parent_dict = document
            .get_object_mut(parent)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        set_or_remove_ref(parent_dict, "First", next);
    }

    if let Some(next_id) = next {
        let following = document
            .get_object_mut(next_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        set_or_remove_ref(following, "Prev", prev);
    } else {
        let parent_dict = document
            .get_object_mut(parent)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        set_or_remove_ref(parent_dict, "Last", prev);
    }

    let item = document
        .get_object_mut(id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    item.remove(b"Prev");
    item.remove(b"Next");
    Ok(parent)
}

fn insert_outline_after(
    document: &mut Document,
    id: ObjectId,
    parent: ObjectId,
    after: Option<ObjectId>,
) -> Result<(), SevenError> {
    if let Some(after_id) = after {
        let after_parent = document
            .get_object(after_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict()
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .get(b"Parent")
            .ok()
            .and_then(|value| value.as_reference().ok());
        if after_parent != Some(parent) {
            return Err(SevenError::OperationRejected(
                "Marcador de referência não pertence ao mesmo nível".into(),
            ));
        }
        let next = document
            .get_object(after_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Next").ok())
            .and_then(|value| value.as_reference().ok());

        {
            let after_dict = document
                .get_object_mut(after_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            after_dict.set("Next", id);
        }
        {
            let item = document
                .get_object_mut(id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            item.set("Parent", parent);
            item.set("Prev", after_id);
            set_or_remove_ref(item, "Next", next);
        }
        if let Some(next_id) = next {
            document
                .get_object_mut(next_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Prev", id);
        } else {
            document
                .get_object_mut(parent)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Last", id);
        }
    } else {
        let first = document
            .get_object(parent)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"First").ok())
            .and_then(|value| value.as_reference().ok());
        {
            let item = document
                .get_object_mut(id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            item.set("Parent", parent);
            item.remove(b"Prev");
            set_or_remove_ref(item, "Next", first);
        }
        if let Some(first_id) = first {
            document
                .get_object_mut(first_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Prev", id);
        } else {
            document
                .get_object_mut(parent)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Last", id);
        }
        document
            .get_object_mut(parent)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .set("First", id);
    }
    Ok(())
}

fn outline_children(document: &Document, parent: ObjectId) -> Vec<ObjectId> {
    let mut result = Vec::new();
    let mut current = document
        .get_object(parent)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"First").ok())
        .and_then(|value| value.as_reference().ok());
    let mut visited = HashSet::new();
    while let Some(id) = current {
        if !visited.insert(id) {
            break;
        }
        result.push(id);
        current = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Next").ok())
            .and_then(|value| value.as_reference().ok());
    }
    result
}

fn outline_descendant_count(document: &Document, parent: ObjectId, visited: &mut HashSet<ObjectId>) -> i64 {
    let mut count = 0i64;
    for child in outline_children(document, parent) {
        if !visited.insert(child) {
            continue;
        }
        count += 1 + outline_descendant_count(document, child, visited);
    }
    count
}

fn recompute_outline_counts(document: &mut Document) -> Result<(), SevenError> {
    let root = outlines_id(document)?;
    let mut stack = outline_children(document, root);
    let mut all = Vec::new();
    while let Some(id) = stack.pop() {
        all.push(id);
        stack.extend(outline_children(document, id));
    }

    for id in all {
        let descendants = outline_descendant_count(document, id, &mut HashSet::new());
        let was_closed = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Count").ok())
            .and_then(|value| value.as_i64().ok())
            .is_some_and(|value| value < 0);
        let dictionary = document
            .get_object_mut(id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        if descendants == 0 {
            dictionary.remove(b"Count");
        } else {
            dictionary.set("Count", if was_closed { -descendants } else { descendants });
        }
    }

    let total = outline_descendant_count(document, root, &mut HashSet::new());
    document
        .get_object_mut(root)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Count", total);
    Ok(())
}

fn collect_outline_subtree(document: &Document, id: ObjectId, output: &mut Vec<ObjectId>) {
    output.push(id);
    for child in outline_children(document, id) {
        collect_outline_subtree(document, child, output);
    }
}

pub fn delete_bookmark(
    input: &Path,
    output: &Path,
    object_id: &str,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_id(object_id)?;
    detach_outline_item(&mut document, id)?;
    let mut subtree = Vec::new();
    collect_outline_subtree(&document, id, &mut subtree);
    for object_id in subtree {
        document.objects.remove(&object_id);
    }
    recompute_outline_counts(&mut document)?;
    atomic_save(document, output)
}

pub fn set_bookmark_open(
    input: &Path,
    output: &Path,
    object_id: &str,
    open: bool,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_id(object_id)?;
    let descendants = outline_descendant_count(&document, id, &mut HashSet::new());
    if descendants == 0 {
        return Err(SevenError::OperationRejected("Marcador não possui filhos".into()));
    }
    document
        .get_object_mut(id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Count", if open { descendants } else { -descendants });
    atomic_save(document, output)
}

pub fn move_bookmark(
    input: &Path,
    output: &Path,
    object_id: &str,
    direction: &str,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_id(object_id)?;
    let root = outlines_id(&document)?;
    let (parent, prev, next) = outline_links(&document, id)?;

    match direction {
        "up" => {
            let previous = prev.ok_or_else(|| SevenError::OperationRejected("Marcador já é o primeiro deste nível".into()))?;
            let before_previous = document
                .get_object(previous)
                .ok()
                .and_then(|object| object.as_dict().ok())
                .and_then(|dictionary| dictionary.get(b"Prev").ok())
                .and_then(|value| value.as_reference().ok());
            detach_outline_item(&mut document, id)?;
            insert_outline_after(&mut document, id, parent, before_previous)?;
        }
        "down" => {
            let following = next.ok_or_else(|| SevenError::OperationRejected("Marcador já é o último deste nível".into()))?;
            detach_outline_item(&mut document, id)?;
            insert_outline_after(&mut document, id, parent, Some(following))?;
        }
        "indent" => {
            let new_parent = prev.ok_or_else(|| SevenError::OperationRejected("É necessário um marcador anterior para criar hierarquia".into()))?;
            let after = document
                .get_object(new_parent)
                .ok()
                .and_then(|object| object.as_dict().ok())
                .and_then(|dictionary| dictionary.get(b"Last").ok())
                .and_then(|value| value.as_reference().ok());
            detach_outline_item(&mut document, id)?;
            insert_outline_after(&mut document, id, new_parent, after)?;
        }
        "outdent" => {
            if parent == root {
                return Err(SevenError::OperationRejected("Marcador já está no nível raiz".into()));
            }
            let grand_parent = document
                .get_object(parent)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .get(b"Parent")
                .map_err(|_| SevenError::OperationRejected("Hierarquia inválida".into()))?
                .as_reference()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            detach_outline_item(&mut document, id)?;
            insert_outline_after(&mut document, id, grand_parent, Some(parent))?;
        }
        _ => return Err(SevenError::OperationRejected("Direção de marcador inválida".into())),
    }

    recompute_outline_counts(&mut document)?;
    atomic_save(document, output)
}

pub fn set_all_bookmarks_open(
    input: &Path,
    output: &Path,
    open: bool,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let root = outlines_id(&document)?;
    let mut stack = outline_children(&document, root);
    let mut changed = 0usize;
    while let Some(id) = stack.pop() {
        let children = outline_children(&document, id);
        stack.extend(children.iter().copied());
        if children.is_empty() {
            continue;
        }
        let descendants = outline_descendant_count(&document, id, &mut HashSet::new());
        document
            .get_object_mut(id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .set("Count", if open { descendants } else { -descendants });
        changed += 1;
    }
    if changed == 0 {
        return Err(SevenError::OperationRejected("Não há grupos de marcadores para alterar".into()));
    }
    atomic_save(document, output)
}

pub fn update_bookmark(
    input: &Path,
    output: &Path,
    update: BookmarkUpdate,
) -> Result<(), SevenError> {
    if update.title.trim().is_empty() || update.title.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Título do marcador inválido".into()));
    }
    if update.color.iter().any(|component| !(0.0..=1.0).contains(component)) {
        return Err(SevenError::OperationRejected("Cor do marcador deve ficar entre 0 e 1".into()));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let id = parse_id(&update.object_id)?;
    let action = match update.action_type.as_str() {
        "goto" => {
            let page_index = update.target_page.ok_or_else(|| SevenError::OperationRejected("Página de destino ausente".into()))?;
            let page_id = document
                .get_pages()
                .get(&((page_index + 1) as u32))
                .copied()
                .ok_or_else(|| SevenError::OperationRejected("Página de destino não existe".into()))?;
            Some(dictionary! {
                "S" => "GoTo",
                "D" => vec![Object::Reference(page_id), Object::Name(b"Fit".to_vec())],
            })
        }
        "uri" => {
            let target = update.target.trim();
            if !(target.starts_with("https://") || target.starts_with("http://")) || target.len() > 4096 {
                return Err(SevenError::OperationRejected("URL do marcador deve usar HTTP ou HTTPS".into()));
            }
            Some(dictionary! {
                "S" => "URI",
                "URI" => Object::string_literal(target),
            })
        }
        "named" => {
            let target = update.target.trim();
            if target.is_empty() || target.chars().count() > 500 {
                return Err(SevenError::OperationRejected("Destino nomeado inválido".into()));
            }
            let dictionary = document
                .get_object_mut(id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            dictionary.set("Title", Object::string_literal(update.title.trim()));
            dictionary.remove(b"A");
            dictionary.set("Dest", Object::Name(target.as_bytes().to_vec()));
            dictionary.set("F", (if update.italic { 1i64 } else { 0 }) | (if update.bold { 2i64 } else { 0 }));
            dictionary.set("C", vec![update.color[0].into(), update.color[1].into(), update.color[2].into()]);
            return atomic_save(document, output);
        }
        "none" => None,
        _ => return Err(SevenError::OperationRejected("Ação de marcador inválida".into())),
    };

    let dictionary = document
        .get_object_mut(id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    dictionary.set("Title", Object::string_literal(update.title.trim()));
    dictionary.remove(b"Dest");
    if let Some(action) = action {
        dictionary.set("A", Object::Dictionary(action));
    } else {
        dictionary.remove(b"A");
    }
    dictionary.set("F", (if update.italic { 1i64 } else { 0 }) | (if update.bold { 2i64 } else { 0 }));
    dictionary.set("C", vec![update.color[0].into(), update.color[1].into(), update.color[2].into()]);
    atomic_save(document, output)
}

fn struct_heading_entries(
    document: &Document,
    object: &Object,
    output: &mut Vec<(usize, String, usize)>,
    visited: &mut HashSet<ObjectId>,
) {
    let resolved = match object {
        Object::Reference(id) => {
            if !visited.insert(*id) { return; }
            document.get_object(*id).ok()
        }
        other => Some(other),
    };
    let Some(Object::Dictionary(dictionary)) = resolved else { return };

    let role = dictionary.get(b"S").ok().and_then(|value| value.as_name().ok()).unwrap_or_default();
    let depth = match role {
        b"H1" => Some(0),
        b"H2" => Some(1),
        b"H3" => Some(2),
        b"H4" => Some(3),
        b"H5" => Some(4),
        b"H6" => Some(5),
        _ => None,
    };
    if let Some(depth) = depth {
        let title = [b"T".as_slice(), b"ActualText".as_slice(), b"Alt".as_slice()]
            .into_iter()
            .find_map(|key| dictionary.get(key).ok().map(object_text))
            .unwrap_or_default();
        let page_index = dictionary
            .get(b"Pg")
            .ok()
            .and_then(|value| value.as_reference().ok())
            .and_then(|page_id| page_index_for_id(document, page_id));
        if let Some(page_index) = page_index {
            if !title.trim().is_empty() {
                output.push((page_index, title.trim().to_owned(), depth));
            }
        }
    }

    if let Ok(kids) = dictionary.get(b"K") {
        match kids {
            Object::Array(values) => {
                for value in values {
                    struct_heading_entries(document, value, output, visited);
                }
            }
            Object::Reference(_) | Object::Dictionary(_) => {
                struct_heading_entries(document, kids, output, visited);
            }
            _ => {}
        }
    }
}

pub fn generate_bookmarks_from_structure(
    input: &Path,
    output: &Path,
) -> Result<usize, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let struct_root = document
        .catalog()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"StructTreeRoot")
        .map_err(|_| SevenError::OperationRejected("O PDF não possui StructTreeRoot para gerar marcadores".into()))?
        .clone();

    let mut headings = Vec::new();
    struct_heading_entries(&document, &struct_root, &mut headings, &mut HashSet::new());
    if headings.is_empty() {
        return Err(SevenError::OperationRejected(
            "Nenhum heading H1–H6 com texto e página foi encontrado na estrutura Tagged PDF".into(),
        ));
    }

    // Replace only when there is no existing outline, avoiding accidental destructive merges.
    if !bookmark_list(&document).is_empty() {
        return Err(SevenError::OperationRejected(
            "O documento já possui marcadores. Remova ou edite-os antes de gerar a partir da estrutura".into(),
        ));
    }

    let root_id = document
        .trailer
        .get(b"Root")
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_reference()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let outlines_id = document.add_object(dictionary! { "Type" => "Outlines", "Count" => 0 });
    document
        .get_object_mut(root_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Outlines", outlines_id);

    let pages = document.get_pages();
    let mut parents: Vec<ObjectId> = vec![outlines_id];
    let mut last_at_depth: Vec<Option<ObjectId>> = vec![None; 7];
    let mut created = 0usize;

    for (page_index, title, depth) in headings {
        let normalized_depth = depth.min(5);
        while parents.len() <= normalized_depth + 1 {
            let parent = last_at_depth[parents.len() - 1].unwrap_or(outlines_id);
            parents.push(parent);
        }
        parents.truncate(normalized_depth + 1);
        let parent = *parents.last().unwrap_or(&outlines_id);
        let page_id = pages
            .get(&((page_index + 1) as u32))
            .copied()
            .ok_or_else(|| SevenError::OperationRejected("Página estrutural não existe".into()))?;
        let after = document
            .get_object(parent)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Last").ok())
            .and_then(|value| value.as_reference().ok());
        let item_id = document.add_object(dictionary! {
            "Title" => Object::string_literal(title),
            "Parent" => parent,
            "A" => dictionary! {
                "S" => "GoTo",
                "D" => vec![Object::Reference(page_id), Object::Name(b"Fit".to_vec())],
            },
        });
        insert_outline_after(&mut document, item_id, parent, after)?;
        last_at_depth[normalized_depth] = Some(item_id);
        if parents.len() == normalized_depth + 1 {
            parents.push(item_id);
        } else {
            parents[normalized_depth + 1] = item_id;
        }
        created += 1;
    }

    recompute_outline_counts(&mut document)?;
    atomic_save(document, output)?;
    Ok(created)
}

pub fn append_bookmarks_from_sources(
    combined: &Path,
    sources: &[(PathBuf, usize)],
) -> Result<usize, SevenError> {
    let mut document = Document::load(combined).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let root = ensure_outlines_id(&mut document)?;
    let combined_pages = document.get_pages();
    let mut created = 0usize;

    for (source_path, page_offset) in sources {
        let source = Document::load(source_path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
        let bookmarks = bookmark_list(&source);
        if bookmarks.is_empty() {
            continue;
        }

        let mut mapping = HashMap::<String, ObjectId>::new();
        for bookmark in bookmarks {
            let parent = bookmark
                .parent_object_id
                .as_ref()
                .and_then(|parent| mapping.get(parent).copied())
                .unwrap_or(root);

            let after = document
                .get_object(parent)
                .ok()
                .and_then(|object| object.as_dict().ok())
                .and_then(|dictionary| dictionary.get(b"Last").ok())
                .and_then(|value| value.as_reference().ok());

            let mut item = dictionary! {
                "Title" => Object::string_literal(bookmark.title),
                "Parent" => parent,
                "F" => (if bookmark.italic { 1i64 } else { 0 }) | (if bookmark.bold { 2i64 } else { 0 }),
                "C" => vec![bookmark.color[0].into(), bookmark.color[1].into(), bookmark.color[2].into()],
            };

            match bookmark.action_type.as_str() {
                "goto" => {
                    if let Some(page_index) = bookmark.page_index {
                        let target = page_offset.saturating_add(page_index);
                        if let Some(page_id) = combined_pages.get(&((target + 1) as u32)).copied() {
                            item.set("A", dictionary! {
                                "S" => "GoTo",
                                "D" => vec![Object::Reference(page_id), Object::Name(b"Fit".to_vec())],
                            });
                        }
                    }
                }
                "uri" if !bookmark.action_target.is_empty() => {
                    item.set("A", dictionary! {
                        "S" => "URI",
                        "URI" => Object::string_literal(bookmark.action_target),
                    });
                }
                _ => {}
            }

            let id = document.add_object(item);
            insert_outline_after(&mut document, id, parent, after)?;
            if bookmark.has_children && !bookmark.open {
                document
                    .get_object_mut(id)
                    .map_err(|error| SevenError::Operation(error.to_string()))?
                    .as_dict_mut()
                    .map_err(|error| SevenError::Operation(error.to_string()))?
                    .set("Count", -1i64);
            }
            mapping.insert(bookmark.object_id, id);
            created += 1;
        }
    }

    if created > 0 {
        recompute_outline_counts(&mut document)?;
        atomic_save(document, combined)?;
    }
    Ok(created)
}

pub fn add_bookmark(input: &Path, output: &Path, bookmark: BookmarkInput) -> Result<(), SevenError> {
    if bookmark.title.trim().is_empty() || bookmark.title.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Título do marcador inválido".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document.get_pages().get(&((bookmark.page_index + 1) as u32)).copied().ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    let root_id = document.trailer.get(b"Root").map_err(|e| SevenError::Operation(e.to_string()))?.as_reference().map_err(|e| SevenError::Operation(e.to_string()))?;
    let outlines_id = document
        .catalog().ok()
        .and_then(|c| c.get(b"Outlines").ok())
        .and_then(|o| o.as_reference().ok())
        .unwrap_or_else(|| {
            let id = document.add_object(dictionary! { "Type" => "Outlines", "Count" => 0 });
            document.get_object_mut(root_id).ok().and_then(|o| o.as_dict_mut().ok()).map(|c| c.set("Outlines", id));
            id
        });

    let (first, last, count) = {
        let outlines = document.get_object(outlines_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict().map_err(|e| SevenError::Operation(e.to_string()))?;
        (
            outlines.get(b"First").ok().and_then(|o| o.as_reference().ok()),
            outlines.get(b"Last").ok().and_then(|o| o.as_reference().ok()),
            outlines.get(b"Count").ok().and_then(|o| o.as_i64().ok()).unwrap_or(0),
        )
    };
    let mut item = dictionary! {
        "Title" => Object::string_literal(bookmark.title.trim()),
        "Parent" => outlines_id,
        "Dest" => vec![Object::Reference(page_id), Object::Name(b"Fit".to_vec())],
    };
    if let Some(last) = last {
        item.set("Prev", last);
    }
    let item_id = document.add_object(item);
    if let Some(last) = last {
        if let Ok(last_dict) = document.get_object_mut(last).and_then(Object::as_dict_mut) {
            last_dict.set("Next", item_id);
        }
    }
    let outlines = document.get_object_mut(outlines_id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?;
    if first.is_none() { outlines.set("First", item_id); }
    outlines.set("Last", item_id);
    outlines.set("Count", count.abs() + 1);
    recompute_outline_counts(&mut document)?;
    atomic_save(document, output)
}

pub fn rename_bookmark(input: &Path, output: &Path, object_id: &str, title: &str) -> Result<(), SevenError> {
    if title.trim().is_empty() || title.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Título inválido".into()));
    }
    let mut document = Document::load(input).map_err(|e| SevenError::PdfOpen(e.to_string()))?;
    let id = parse_id(object_id)?;
    document.get_object_mut(id).map_err(|e| SevenError::Operation(e.to_string()))?.as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?.set("Title", Object::string_literal(title.trim()));
    atomic_save(document, output)
}

fn ensure_oc_config_ids(document: &mut Document) -> Result<(ObjectId, ObjectId), SevenError> {
    let root_id = document
        .trailer
        .get(b"Root")
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_reference()
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    let existing_oc = document
        .get_object(root_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"OCProperties")
        .ok()
        .cloned();

    let oc_id = match existing_oc {
        Some(Object::Reference(id)) => id,
        Some(Object::Dictionary(dictionary)) => {
            let id = document.add_object(dictionary);
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("OCProperties", id);
            id
        }
        Some(_) => return Err(SevenError::Operation("OCProperties inválido".into())),
        None => {
            let default_id = document.add_object(dictionary! {
                "BaseState" => "ON",
                "Order" => Vec::<Object>::new(),
            });
            let oc_id = document.add_object(dictionary! {
                "OCGs" => Vec::<Object>::new(),
                "D" => default_id,
            });
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("OCProperties", oc_id);
            return Ok((oc_id, default_id));
        }
    };

    let existing_default = document
        .get_object(oc_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"D")
        .ok()
        .cloned();

    let default_id = match existing_default {
        Some(Object::Reference(id)) => id,
        Some(Object::Dictionary(dictionary)) => {
            let id = document.add_object(dictionary);
            document
                .get_object_mut(oc_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("D", id);
            id
        }
        _ => {
            let id = document.add_object(dictionary! { "BaseState" => "ON" });
            document
                .get_object_mut(oc_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("D", id);
            id
        }
    };

    Ok((oc_id, default_id))
}

fn set_usage_state(
    usage: &mut Dictionary,
    category_key: &str,
    state_key: &str,
    state: &str,
) -> Result<(), SevenError> {
    if !matches!(state, "on" | "off" | "unchanged") {
        return Err(SevenError::OperationRejected("Override de camada inválido".into()));
    }
    let mut category = usage
        .get(category_key.as_bytes())
        .ok()
        .and_then(|object| object.as_dict().ok())
        .cloned()
        .unwrap_or_default();
    if state == "unchanged" {
        category.remove(state_key.as_bytes());
    } else {
        category.set(
            state_key,
            Object::Name(state.to_ascii_uppercase().into_bytes()),
        );
    }
    if category.is_empty() {
        usage.remove(category_key.as_bytes());
    } else {
        usage.set(category_key, category);
    }
    Ok(())
}


fn inherited_resources(document: &Document, mut page_id: ObjectId) -> Dictionary {
    for _ in 0..64 {
        let Ok(page) = document.get_object(page_id).and_then(Object::as_dict) else { break };
        if let Ok(resources) = page.get(b"Resources") {
            match resources {
                Object::Dictionary(dictionary) => return dictionary.clone(),
                Object::Reference(id) => {
                    if let Ok(dictionary) = document.get_object(*id).and_then(Object::as_dict) {
                        return dictionary.clone();
                    }
                }
                _ => {}
            }
        }
        let Ok(parent) = page.get(b"Parent").and_then(Object::as_reference) else { break };
        page_id = parent;
    }
    Dictionary::new()
}

fn resolved_subdictionary(document: &Document, dictionary: &Dictionary, key: &[u8]) -> Dictionary {
    match dictionary.get(key) {
        Ok(Object::Dictionary(value)) => value.clone(),
        Ok(Object::Reference(id)) => document
            .get_object(*id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    }
}

fn append_page_stream(
    document: &mut Document,
    page_id: ObjectId,
    content: Content,
) -> Result<(), SevenError> {
    let bytes = content
        .encode()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let new_id = document.add_object(Stream::new(Dictionary::new(), bytes));
    let existing = document
        .get_object(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"Contents")
        .ok()
        .cloned();

    let replacement = match existing {
        None => Object::Reference(new_id),
        Some(Object::Reference(id)) => Object::Array(vec![Object::Reference(id), Object::Reference(new_id)]),
        Some(Object::Array(mut values)) => {
            values.push(Object::Reference(new_id));
            Object::Array(values)
        }
        Some(Object::Stream(stream)) => {
            let old_id = document.add_object(stream);
            Object::Array(vec![Object::Reference(old_id), Object::Reference(new_id)])
        }
        Some(other) => {
            return Err(SevenError::Operation(format!(
                "Estrutura /Contents não suportada: {other:?}"
            )))
        }
    };

    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Contents", replacement);
    Ok(())
}

pub fn import_image_as_layer(
    input: &Path,
    output: &Path,
    page_index: usize,
    image_path: &Path,
    name: &str,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
    locked: bool,
) -> Result<(), SevenError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Nome da camada inválido".into()));
    }
    if !image_path.is_file() || width <= 0.0 || height <= 0.0 {
        return Err(SevenError::OperationRejected("Imagem ou dimensões inválidas".into()));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    let (oc_id, default_id) = ensure_oc_config_ids(&mut document)?;

    let layer_id = document.add_object(dictionary! {
        "Type" => "OCG",
        "Name" => Object::string_literal(name),
        "Intent" => vec![Object::Name(b"View".to_vec()), Object::Name(b"Design".to_vec())],
    });

    {
        let oc = document
            .get_object_mut(oc_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        match oc.get_mut(b"OCGs") {
            Ok(Object::Array(values)) => values.push(Object::Reference(layer_id)),
            _ => oc.set("OCGs", vec![Object::Reference(layer_id)]),
        }
    }
    {
        let default = document
            .get_object_mut(default_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        match default.get_mut(b"Order") {
            Ok(Object::Array(values)) => values.push(Object::Reference(layer_id)),
            _ => default.set("Order", vec![Object::Reference(layer_id)]),
        }
        set_visibility_arrays(default, layer_id, visible);
        if locked {
            match default.get_mut(b"Locked") {
                Ok(Object::Array(values)) => values.push(Object::Reference(layer_id)),
                _ => default.set("Locked", vec![Object::Reference(layer_id)]),
            }
        }
    }

    let image_stream = lopdf::xobject::image(image_path)
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let image_id = document.add_object(image_stream);
    let property_name = format!("SRLayer{}", layer_id.0);
    let image_name = format!("SRImage{}", image_id.0);

    let mut resources = inherited_resources(&document, page_id);
    let mut properties = resolved_subdictionary(&document, &resources, b"Properties");
    let mut xobjects = resolved_subdictionary(&document, &resources, b"XObject");
    properties.set(property_name.as_str(), layer_id);
    xobjects.set(image_name.as_str(), image_id);
    resources.set("Properties", properties);
    resources.set("XObject", xobjects);
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Resources", resources);

    append_page_stream(
        &mut document,
        page_id,
        Content {
            operations: vec![
                Operation::new("BDC", vec![
                    Object::Name(b"OC".to_vec()),
                    Object::Name(property_name.into_bytes()),
                ]),
                Operation::new("q", vec![]),
                Operation::new("cm", vec![
                    width.into(), 0.into(), 0.into(), height.into(), x.into(), y.into(),
                ]),
                Operation::new("Do", vec![Object::Name(image_name.into_bytes())]),
                Operation::new("Q", vec![]),
                Operation::new("EMC", vec![]),
            ],
        },
    )?;

    atomic_save(document, output)
}

fn move_reference_in_order(value: &mut Object, target: ObjectId, direction: i32) -> bool {
    let Object::Array(values) = value else { return false };
    if let Some(index) = values.iter().position(|value| value.as_reference().ok() == Some(target)) {
        let min_index = usize::from(values.first().is_some_and(|value| matches!(value, Object::String(_, _) | Object::Name(_))));
        let new_index = if direction < 0 {
            index.saturating_sub(1).max(min_index)
        } else {
            (index + 1).min(values.len().saturating_sub(1))
        };
        if new_index != index {
            values.swap(index, new_index);
        }
        return true;
    }
    for child in values.iter_mut() {
        if move_reference_in_order(child, target, direction) {
            return true;
        }
    }
    false
}

pub fn reorder_layer(
    input: &Path,
    output: &Path,
    object_id: &str,
    direction: &str,
) -> Result<(), SevenError> {
    let target = parse_id(object_id)?;
    let direction = match direction {
        "up" => -1,
        "down" => 1,
        _ => return Err(SevenError::OperationRejected("Direção de layer inválida".into())),
    };
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let (_, default_id) = ensure_oc_config_ids(&mut document)?;
    let default = document
        .get_object_mut(default_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let order = default
        .get_mut(b"Order")
        .map_err(|_| SevenError::OperationRejected("Documento não possui ordem de layers editável".into()))?;
    if !move_reference_in_order(order, target, direction) {
        return Err(SevenError::OperationRejected("Layer não encontrada na ordem atual".into()));
    }
    atomic_save(document, output)
}

fn replace_ocg_reference_in_object(object: &mut Object, source: ObjectId, target: ObjectId) {
    match object {
        Object::Reference(id) if *id == source => *id = target,
        Object::Array(values) => {
            for value in values {
                replace_ocg_reference_in_object(value, source, target);
            }
        }
        Object::Dictionary(dictionary) => {
            for (_, value) in dictionary.iter_mut() {
                replace_ocg_reference_in_object(value, source, target);
            }
        }
        Object::Stream(stream) => {
            for (_, value) in stream.dict.iter_mut() {
                replace_ocg_reference_in_object(value, source, target);
            }
        }
        _ => {}
    }
}

fn remove_reference_recursive(object: &mut Object, target: ObjectId) {
    match object {
        Object::Array(values) => {
            values.retain(|value| value.as_reference().ok() != Some(target));
            for value in values {
                remove_reference_recursive(value, target);
            }
        }
        Object::Dictionary(dictionary) => {
            for (_, value) in dictionary.iter_mut() {
                remove_reference_recursive(value, target);
            }
        }
        Object::Stream(stream) => {
            for (_, value) in stream.dict.iter_mut() {
                remove_reference_recursive(value, target);
            }
        }
        _ => {}
    }
}

pub fn merge_layers(
    input: &Path,
    output: &Path,
    source_id: &str,
    target_id: &str,
) -> Result<(), SevenError> {
    let source = parse_id(source_id)?;
    let target = parse_id(target_id)?;
    if source == target {
        return Err(SevenError::OperationRejected("Escolha duas layers diferentes".into()));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let source_is_ocg = document
        .get_object(source)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"Type").ok())
        .and_then(|value| value.as_name().ok())
        == Some(b"OCG");
    let target_is_ocg = document
        .get_object(target)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"Type").ok())
        .and_then(|value| value.as_name().ok())
        == Some(b"OCG");
    if !source_is_ocg || !target_is_ocg {
        return Err(SevenError::OperationRejected("Objeto de layer inválido".into()));
    }

    for object in document.objects.values_mut() {
        replace_ocg_reference_in_object(object, source, target);
        dedup_reference_arrays(object, target);
    }
    if let Ok(catalog) = document.catalog_mut() {
        if let Ok(oc) = catalog.get_mut(b"OCProperties") {
            remove_reference_recursive(oc, source);
        }
    }
    document.objects.remove(&source);
    atomic_save(document, output)
}

fn layer_visibility_map(document: &Document) -> HashMap<ObjectId, bool> {
    layer_list(document)
        .into_iter()
        .filter_map(|layer| parse_id(&layer.object_id).ok().map(|id| (id, layer.visible)))
        .collect()
}

fn property_layer_map(document: &Document, page_id: ObjectId) -> HashMap<Vec<u8>, ObjectId> {
    let resources = inherited_resources(document, page_id);
    let properties = resolved_subdictionary(document, &resources, b"Properties");
    let mut output = HashMap::new();
    for (name, value) in properties.iter() {
        let id = match value {
            Object::Reference(id) => Some(*id),
            Object::Dictionary(dictionary) => dictionary
                .get(b"OCGs")
                .ok()
                .and_then(|value| value.as_reference().ok()),
            _ => None,
        };
        if let Some(id) = id {
            output.insert(name.clone(), id);
        }
    }
    output
}

fn xobject_layer_map(document: &Document, page_id: ObjectId) -> HashMap<Vec<u8>, ObjectId> {
    let resources = inherited_resources(document, page_id);
    let xobjects = resolved_subdictionary(document, &resources, b"XObject");
    let mut output = HashMap::new();
    for (name, value) in xobjects.iter() {
        let Some(id) = value.as_reference().ok() else { continue };
        let Some(layer_id) = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_stream().ok())
            .and_then(|stream| stream.dict.get(b"OC").ok())
            .and_then(|value| value.as_reference().ok())
        else { continue };
        output.insert(name.clone(), layer_id);
    }
    output
}

fn flatten_page_annotations(
    document: &mut Document,
    page_id: ObjectId,
    visibility: &HashMap<ObjectId, bool>,
) -> Result<(), SevenError> {
    let annots = document
        .get_object(page_id)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|page| page.get(b"Annots").ok())
        .and_then(|value| value.as_array().ok())
        .cloned()
        .unwrap_or_default();

    if annots.is_empty() {
        return Ok(());
    }

    let mut keep = Vec::with_capacity(annots.len());
    for entry in annots {
        let Some(id) = entry.as_reference().ok() else {
            keep.push(entry);
            continue;
        };
        let layer_id = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"OC").ok())
            .and_then(|value| value.as_reference().ok());

        match layer_id {
            Some(layer) if !visibility.get(&layer).copied().unwrap_or(true) => {}
            Some(_) => {
                if let Ok(dictionary) = document.get_object_mut(id).and_then(Object::as_dict_mut) {
                    dictionary.remove(b"OC");
                }
                keep.push(Object::Reference(id));
            }
            None => keep.push(Object::Reference(id)),
        }
    }

    let page = document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if keep.is_empty() {
        page.remove(b"Annots");
    } else {
        page.set("Annots", keep);
    }
    Ok(())
}

fn dedup_reference_arrays(object: &mut Object, target: ObjectId) {
    match object {
        Object::Array(values) => {
            let mut seen_target = false;
            values.retain(|value| {
                if value.as_reference().ok() == Some(target) {
                    if seen_target {
                        false
                    } else {
                        seen_target = true;
                        true
                    }
                } else {
                    true
                }
            });
            for value in values {
                dedup_reference_arrays(value, target);
            }
        }
        Object::Dictionary(dictionary) => {
            for (_, value) in dictionary.iter_mut() {
                dedup_reference_arrays(value, target);
            }
        }
        Object::Stream(stream) => {
            for (_, value) in stream.dict.iter_mut() {
                dedup_reference_arrays(value, target);
            }
        }
        _ => {}
    }
}

#[derive(Clone, Copy)]
struct MarkedFrame {
    hidden: bool,
    omit_wrapper: bool,
}

pub fn flatten_layers(input: &Path, output: &Path) -> Result<usize, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let visibility = layer_visibility_map(&document);
    if visibility.is_empty() {
        return Err(SevenError::OperationRejected("Documento não possui OCGs".into()));
    }

    let page_ids = document.get_pages().values().copied().collect::<Vec<_>>();
    let mut changed_pages = 0usize;
    for page_id in page_ids {
        let properties = property_layer_map(&document, page_id);
        let xobject_layers = xobject_layer_map(&document, page_id);
        flatten_page_annotations(&mut document, page_id, &visibility)?;
        let data = document.get_page_content(page_id);
        if data.is_empty() {
            continue;
        }
        let content = Content::decode(&data)
            .map_err(|error| SevenError::Operation(format!("Content stream inválido: {error}")))?;
        let mut output_ops = Vec::with_capacity(content.operations.len());
        let mut stack: Vec<MarkedFrame> = Vec::new();

        for operation in content.operations {
            if operation.operator == "BDC" {
                let parent_hidden = stack.last().is_some_and(|frame| frame.hidden);
                let layer_id = match operation.operands.as_slice() {
                    [Object::Name(tag), Object::Name(property)] if tag.as_slice() == b"OC" => {
                        properties.get(property).copied()
                    }
                    _ => None,
                };
                if let Some(layer_id) = layer_id {
                    let hidden = parent_hidden || !visibility.get(&layer_id).copied().unwrap_or(true);
                    stack.push(MarkedFrame { hidden, omit_wrapper: true });
                    continue;
                }
                stack.push(MarkedFrame { hidden: parent_hidden, omit_wrapper: false });
                if !parent_hidden {
                    output_ops.push(operation);
                }
                continue;
            }

            if operation.operator == "BMC" {
                let hidden = stack.last().is_some_and(|frame| frame.hidden);
                stack.push(MarkedFrame { hidden, omit_wrapper: false });
                if !hidden {
                    output_ops.push(operation);
                }
                continue;
            }

            if operation.operator == "EMC" {
                let frame = stack.pop().unwrap_or(MarkedFrame { hidden: false, omit_wrapper: false });
                let parent_hidden = stack.last().is_some_and(|value| value.hidden);
                if !frame.omit_wrapper && !parent_hidden {
                    output_ops.push(operation);
                }
                continue;
            }

            if !stack.last().is_some_and(|frame| frame.hidden) {
                if operation.operator == "Do" {
                    let hidden_xobject = operation.operands.first()
                        .and_then(|value| value.as_name().ok())
                        .and_then(|name| xobject_layers.get(name))
                        .is_some_and(|layer| !visibility.get(layer).copied().unwrap_or(true));
                    if hidden_xobject {
                        continue;
                    }
                }
                output_ops.push(operation);
            }
        }

        let encoded = Content { operations: output_ops }
            .encode()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let stream_id = document.add_object(Stream::new(Dictionary::new(), encoded));
        document
            .get_object_mut(page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .set("Contents", stream_id);
        changed_pages += 1;
    }

    for object in document.objects.values_mut() {
        if let Ok(dictionary) = object.as_dict_mut() {
            dictionary.remove(b"OC");
        } else if let Object::Stream(stream) = object {
            stream.dict.remove(b"OC");
        }
    }
    if let Ok(catalog) = document.catalog_mut() {
        catalog.remove(b"OCProperties");
    }
    atomic_save(document, output)?;
    Ok(changed_pages)
}

pub fn update_layer_properties(
    input: &Path,
    output: &Path,
    update: LayerPropertiesUpdate,
) -> Result<(), SevenError> {
    let name = update.name.trim();
    if name.is_empty() || name.chars().count() > 500 {
        return Err(SevenError::OperationRejected("Nome da camada inválido".into()));
    }
    let target = parse_id(&update.object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let (_, default_id) = ensure_oc_config_ids(&mut document)?;

    {
        let layer = document
            .get_object_mut(target)
            .map_err(|_| SevenError::OperationRejected("OCG não encontrada".into()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        layer.set("Name", Object::string_literal(name));
        let mut usage = layer
            .get(b"Usage")
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned()
            .unwrap_or_default();
        set_usage_state(&mut usage, "View", "ViewState", &update.view_state)?;
        set_usage_state(&mut usage, "Print", "PrintState", &update.print_state)?;
        set_usage_state(&mut usage, "Export", "ExportState", &update.export_state)?;
        if usage.is_empty() {
            layer.remove(b"Usage");
        } else {
            layer.set("Usage", usage);
        }
    }

    let default = document
        .get_object_mut(default_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    let mut locked = default
        .get(b"Locked")
        .ok()
        .and_then(|object| object.as_array().ok())
        .cloned()
        .unwrap_or_default();
    locked.retain(|value| value.as_reference().ok() != Some(target));
    if update.locked {
        locked.push(Object::Reference(target));
    }
    if locked.is_empty() {
        default.remove(b"Locked");
    } else {
        default.set("Locked", locked);
    }

    atomic_save(document, output)
}

pub fn apply_layer_usage_overrides(
    input: &Path,
    output: &Path,
    context: &str,
) -> Result<usize, SevenError> {
    let (category, state_key) = match context {
        "view" => (b"View".as_slice(), b"ViewState".as_slice()),
        "print" => (b"Print".as_slice(), b"PrintState".as_slice()),
        "export" => (b"Export".as_slice(), b"ExportState".as_slice()),
        _ => return Err(SevenError::OperationRejected("Contexto de layer inválido".into())),
    };

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let (oc_id, default_id) = ensure_oc_config_ids(&mut document)?;
    let layer_ids = document
        .get_object(oc_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"OCGs")
        .ok()
        .and_then(|object| object.as_array().ok())
        .map(|values| values.iter().filter_map(|value| value.as_reference().ok()).collect::<Vec<_>>())
        .unwrap_or_default();

    let mut changes = Vec::new();
    for id in layer_ids {
        let state = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|layer| layer.get(b"Usage").ok())
            .and_then(|object| object.as_dict().ok())
            .and_then(|usage| usage.get(category).ok())
            .and_then(|object| object.as_dict().ok())
            .and_then(|usage_category| usage_category.get(state_key).ok())
            .and_then(|object| object.as_name().ok())
            .map(|value| value.to_vec());
        match state.as_deref() {
            Some(b"ON") => changes.push((id, true)),
            Some(b"OFF") => changes.push((id, false)),
            _ => {}
        }
    }

    let default = document
        .get_object_mut(default_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    for (id, visible) in &changes {
        set_visibility_arrays(default, *id, *visible);
    }
    let count = changes.len();
    atomic_save(document, output)?;
    Ok(count)
}

pub fn reset_layer_visibility_to_base(
    input: &Path,
    output: &Path,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let (_, default_id) = ensure_oc_config_ids(&mut document)?;
    let default = document
        .get_object_mut(default_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    default.remove(b"ON");
    default.remove(b"OFF");
    atomic_save(document, output)
}

pub fn set_layer_visibility(input: &Path, output: &Path, object_id: &str, visible: bool) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let target = parse_id(object_id)?;
    let (_, default_id) = ensure_oc_config_ids(&mut document)?;
    let default = document
        .get_object_mut(default_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    set_visibility_arrays(default, target, visible);
    atomic_save(document, output)
}

fn set_visibility_arrays(dictionary: &mut Dictionary, target: ObjectId, visible: bool) {
    for key in [b"ON".as_slice(), b"OFF".as_slice()] {
        if let Ok(Object::Array(values)) = dictionary.get_mut(key) {
            values.retain(|value| value.as_reference().ok() != Some(target));
        }
    }
    let key = if visible { b"ON".as_slice() } else { b"OFF".as_slice() };
    match dictionary.get_mut(key) {
        Ok(Object::Array(values)) => values.push(Object::Reference(target)),
        _ => dictionary.set(key, vec![Object::Reference(target)]),
    }
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-advanced.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|e| SevenError::Io(e.to_string()))?;
    Document::load(&temp).map_err(|e| SevenError::PdfOpen(e.to_string()))?;
    if output.exists() { fs::remove_file(output).map_err(|e| SevenError::Io(e.to_string()))?; }
    fs::rename(&temp, output).map_err(|e| SevenError::Io(e.to_string()))
}
