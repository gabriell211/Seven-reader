use crate::error::SevenError;
use lopdf::{content::Content, Dictionary, Document, Object};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub title: String,
    pub author: String,
    pub subject: String,
    pub keywords: String,
    pub creator: String,
    pub producer: String,
    pub pdf_version: String,
    pub encrypted: bool,
    pub page_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataUpdate {
    pub title: String,
    pub author: String,
    pub subject: String,
    pub keywords: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeOptions {
    pub remove_javascript: bool,
    pub remove_open_actions: bool,
    pub remove_embedded_files: bool,
    pub remove_metadata: bool,
    pub remove_xfa: bool,
    pub remove_annotations: bool,
    pub remove_forms: bool,
    pub remove_multimedia: bool,
    pub cleanup_structure: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeReport {
    pub removed_entries: usize,
    pub removed_metadata: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeAnalysis {
    pub metadata_entries: usize,
    pub annotation_count: usize,
    pub attachment_entries: usize,
    pub javascript_entries: usize,
    pub action_entries: usize,
    pub xfa_entries: usize,
    pub form_field_count: usize,
    pub multimedia_entries: usize,
    pub invalid_structure_entries: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityCheck {
    pub id: String,
    pub label: String,
    pub passed: bool,
    pub severity: String,
    pub detail: String,
    pub page_index: Option<usize>,
    pub fixable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityReport {
    pub tagged: bool,
    pub language: Option<String>,
    pub title: Option<String>,
    pub display_document_title: bool,
    pub tag_count: usize,
    pub figure_count: usize,
    pub figures_missing_alt: usize,
    pub form_field_count: usize,
    pub form_fields_missing_description: usize,
    pub pages_missing_tab_order: usize,
    pub image_only_pages: Vec<usize>,
    pub checks: Vec<AccessibilityCheck>,
}

fn object_text(object: &Object) -> Option<String> {
    match object {
        Object::String(bytes, _) | Object::Name(bytes) => {
            Some(String::from_utf8_lossy(bytes).trim().to_owned())
        }
        _ => None,
    }
}

fn info_dictionary(document: &Document) -> Option<&Dictionary> {
    let reference = document.trailer.get(b"Info").ok()?.as_reference().ok()?;
    document.get_object(reference).ok()?.as_dict().ok()
}

fn info_value(document: &Document, key: &[u8]) -> String {
    info_dictionary(document)
        .and_then(|dictionary| dictionary.get(key).ok())
        .and_then(object_text)
        .unwrap_or_default()
}

pub fn read_metadata(path: &Path) -> Result<DocumentMetadata, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    Ok(DocumentMetadata {
        title: info_value(&document, b"Title"),
        author: info_value(&document, b"Author"),
        subject: info_value(&document, b"Subject"),
        keywords: info_value(&document, b"Keywords"),
        creator: info_value(&document, b"Creator"),
        producer: info_value(&document, b"Producer"),
        pdf_version: document.version.clone(),
        encrypted: document.is_encrypted(),
        page_count: document.get_pages().len(),
    })
}

pub fn write_metadata(
    input: &Path,
    output: &Path,
    update: MetadataUpdate,
) -> Result<(), SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;

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

    for (key, value) in [
        ("Title", update.title),
        ("Author", update.author),
        ("Subject", update.subject),
        ("Keywords", update.keywords),
    ] {
        if value.trim().is_empty() {
            info.remove(key.as_bytes());
        } else {
            info.set(key, Object::string_literal(value.trim()));
        }
    }

    atomic_save(document, output)
}

fn scrub_object(
    object: &mut Object,
    options: &SanitizeOptions,
    removed: &mut usize,
) {
    match object {
        Object::Dictionary(dictionary) => scrub_dictionary(dictionary, options, removed),
        Object::Array(values) => {
            for value in values {
                scrub_object(value, options, removed);
            }
        }
        Object::Stream(stream) => scrub_dictionary(&mut stream.dict, options, removed),
        _ => {}
    }
}

fn remove_key(dictionary: &mut Dictionary, key: &[u8], removed: &mut usize) {
    if dictionary.remove(key).is_some() {
        *removed += 1;
    }
}

fn scrub_dictionary(
    dictionary: &mut Dictionary,
    options: &SanitizeOptions,
    removed: &mut usize,
) {
    if options.remove_javascript {
        remove_key(dictionary, b"JS", removed);
        remove_key(dictionary, b"JavaScript", removed);
    }
    if options.remove_open_actions {
        remove_key(dictionary, b"OpenAction", removed);
        remove_key(dictionary, b"AA", removed);
        if matches!(dictionary.get(b"S"), Ok(Object::Name(name)) if name.as_slice() == b"Launch" || name.as_slice() == b"JavaScript") {
            remove_key(dictionary, b"S", removed);
            remove_key(dictionary, b"F", removed);
        }
    }
    if options.remove_metadata {
        remove_key(dictionary, b"Metadata", removed);
        remove_key(dictionary, b"PieceInfo", removed);
    }
    if options.remove_xfa {
        remove_key(dictionary, b"XFA", removed);
    }
    if options.remove_multimedia {
        for key in [b"RichMediaContent".as_slice(), b"RichMediaSettings", b"3DD", b"3DV", b"Rendition", b"Movie", b"Sound"] {
            remove_key(dictionary, key, removed);
        }
    }

    for (_, value) in dictionary.iter_mut() {
        scrub_object(value, options, removed);
    }
}

fn remove_selected_annotations(
    document: &mut Document,
    options: &SanitizeOptions,
    removed: &mut usize,
) -> Result<(), SevenError> {
    let page_ids = document.get_pages().values().copied().collect::<Vec<_>>();
    for page_id in page_ids {
        let annots = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|page| page.get(b"Annots").ok())
            .and_then(|value| value.as_array().ok())
            .cloned()
            .unwrap_or_default();

        let mut keep = Vec::with_capacity(annots.len());
        for entry in annots {
            let subtype = entry
                .as_reference()
                .ok()
                .and_then(|id| document.get_object(id).ok())
                .and_then(|object| object.as_dict().ok())
                .and_then(|dictionary| dictionary.get(b"Subtype").ok())
                .and_then(|value| value.as_name().ok())
                .map(|name| name.to_vec())
                .unwrap_or_default();

            let is_widget = subtype.as_slice() == b"Widget";
            let is_file_attachment = subtype.as_slice() == b"FileAttachment";
            let is_multimedia = matches!(
                subtype.as_slice(),
                b"RichMedia" | b"3D" | b"Movie" | b"Sound" | b"Screen"
            );
            let remove = (options.remove_forms && is_widget)
                || (options.remove_embedded_files && is_file_attachment)
                || (options.remove_multimedia && is_multimedia)
                || (options.remove_annotations && !is_widget && !is_multimedia && !is_file_attachment);

            if remove {
                *removed += 1;
            } else {
                keep.push(entry);
            }
        }

        if let Ok(page) = document.get_object_mut(page_id).and_then(Object::as_dict_mut) {
            if keep.is_empty() {
                page.remove(b"Annots");
            } else {
                page.set("Annots", keep);
            }
        }
    }
    Ok(())
}

fn destination_valid(document: &Document, value: &Object) -> bool {
    match value {
        Object::Reference(id) => document.objects.contains_key(id),
        Object::Array(values) => values.first().is_some_and(|first| match first {
            Object::Reference(id) => document.objects.contains_key(id),
            Object::Integer(_) => true,
            Object::Name(name) | Object::String(name, _) => !name.is_empty(),
            _ => false,
        }),
        Object::Name(name) | Object::String(name, _) => !name.is_empty(),
        _ => false,
    }
}

fn action_valid(document: &Document, value: &Object) -> bool {
    let dictionary = match value {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Reference(id) => document.get_object(*id).ok().and_then(|object| object.as_dict().ok()),
        _ => None,
    };
    let Some(dictionary) = dictionary else { return false };
    let kind = dictionary.get(b"S").ok().and_then(|value| value.as_name().ok()).unwrap_or_default();
    match kind {
        b"GoTo" => dictionary.get(b"D").ok().is_some_and(|value| destination_valid(document, value)),
        b"URI" => dictionary.get(b"URI").ok().and_then(object_text).is_some_and(|value| !value.trim().is_empty()),
        b"GoToR" => dictionary.get(b"F").ok().and_then(object_text).is_some_and(|value| !value.trim().is_empty()),
        b"Launch" | b"JavaScript" | b"SubmitForm" | b"ResetForm" | b"Hide" | b"Named" => true,
        _ => !kind.is_empty(),
    }
}

fn cleanup_invalid_links(document: &mut Document, removed: &mut usize) -> Result<(), SevenError> {
    let page_ids = document.get_pages().values().copied().collect::<Vec<_>>();
    for page_id in page_ids {
        let annots = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|page| page.get(b"Annots").ok())
            .and_then(|value| value.as_array().ok())
            .cloned()
            .unwrap_or_default();

        let mut keep = Vec::with_capacity(annots.len());
        for entry in annots {
            let dictionary = entry
                .as_reference()
                .ok()
                .and_then(|id| document.get_object(id).ok())
                .and_then(|object| object.as_dict().ok());
            let is_link = dictionary
                .and_then(|dictionary| dictionary.get(b"Subtype").ok())
                .and_then(|value| value.as_name().ok())
                .is_some_and(|name| name == b"Link");

            if !is_link {
                keep.push(entry);
                continue;
            }

            let valid = dictionary.is_some_and(|dictionary| {
                dictionary.get(b"Dest").ok().is_some_and(|value| destination_valid(document, value))
                    || dictionary.get(b"A").ok().is_some_and(|value| action_valid(document, value))
            });

            if valid {
                keep.push(entry);
            } else {
                *removed += 1;
            }
        }

        if let Ok(page) = document.get_object_mut(page_id).and_then(Object::as_dict_mut) {
            if keep.is_empty() {
                page.remove(b"Annots");
            } else {
                page.set("Annots", keep);
            }
        }
    }
    Ok(())
}

fn outline_leaf_invalid(document: &Document, dictionary: &Dictionary) -> bool {
    let has_children = dictionary.get(b"First").ok().and_then(|value| value.as_reference().ok()).is_some();
    if has_children {
        return false;
    }
    let title = dictionary.get(b"Title").ok().and_then(object_text).unwrap_or_default();
    if title.trim().is_empty() {
        return true;
    }
    let has_valid_dest = dictionary
        .get(b"Dest")
        .ok()
        .is_some_and(|value| destination_valid(document, value));
    let has_valid_action = dictionary
        .get(b"A")
        .ok()
        .is_some_and(|value| action_valid(document, value));
    !has_valid_dest && !has_valid_action
}

fn collect_invalid_outline_leaves(
    document: &Document,
    first: Option<(u32, u16)>,
    visited: &mut std::collections::HashSet<(u32, u16)>,
    output: &mut Vec<(u32, u16)>,
) {
    let mut current = first;
    while let Some(id) = current {
        if !visited.insert(id) || visited.len() > 50_000 {
            break;
        }
        let Ok(dictionary) = document.get_object(id).and_then(Object::as_dict) else { break };
        let child = dictionary.get(b"First").ok().and_then(|value| value.as_reference().ok());
        if child.is_some() {
            collect_invalid_outline_leaves(document, child, visited, output);
        } else if outline_leaf_invalid(document, dictionary) {
            output.push(id);
        }
        current = dictionary.get(b"Next").ok().and_then(|value| value.as_reference().ok());
    }
}

fn decrement_outline_counts(document: &mut Document, mut parent: Option<(u32, u16)>) {
    let mut seen = std::collections::HashSet::new();
    while let Some(id) = parent {
        if !seen.insert(id) { break; }
        let next_parent = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Parent").ok())
            .and_then(|value| value.as_reference().ok());
        if let Ok(dictionary) = document.get_object_mut(id).and_then(Object::as_dict_mut) {
            if let Ok(value) = dictionary.get(b"Count").and_then(Object::as_i64) {
                let sign = if value < 0 { -1 } else { 1 };
                let magnitude = value.unsigned_abs().saturating_sub(1) as i64;
                dictionary.set("Count", sign * magnitude);
            }
        }
        parent = next_parent;
    }
}

fn cleanup_invalid_bookmarks(document: &mut Document, removed: &mut usize) {
    let outlines_id = document
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"Outlines").ok())
        .and_then(|value| value.as_reference().ok());
    let Some(outlines_id) = outlines_id else { return };
    let first = document
        .get_object(outlines_id)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"First").ok())
        .and_then(|value| value.as_reference().ok());

    let mut invalid = Vec::new();
    collect_invalid_outline_leaves(document, first, &mut std::collections::HashSet::new(), &mut invalid);

    for id in invalid {
        let snapshot = document
            .get_object(id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .cloned();
        let Some(snapshot) = snapshot else { continue };
        let parent = snapshot.get(b"Parent").ok().and_then(|value| value.as_reference().ok());
        let prev = snapshot.get(b"Prev").ok().and_then(|value| value.as_reference().ok());
        let next = snapshot.get(b"Next").ok().and_then(|value| value.as_reference().ok());

        if let Some(prev_id) = prev {
            if let Ok(dictionary) = document.get_object_mut(prev_id).and_then(Object::as_dict_mut) {
                match next {
                    Some(next_id) => dictionary.set("Next", next_id),
                    None => { dictionary.remove(b"Next"); }
                }
            }
        } else if let Some(parent_id) = parent {
            if let Ok(dictionary) = document.get_object_mut(parent_id).and_then(Object::as_dict_mut) {
                match next {
                    Some(next_id) => dictionary.set("First", next_id),
                    None => { dictionary.remove(b"First"); }
                }
            }
        }

        if let Some(next_id) = next {
            if let Ok(dictionary) = document.get_object_mut(next_id).and_then(Object::as_dict_mut) {
                match prev {
                    Some(prev_id) => dictionary.set("Prev", prev_id),
                    None => { dictionary.remove(b"Prev"); }
                }
            }
        } else if let Some(parent_id) = parent {
            if let Ok(dictionary) = document.get_object_mut(parent_id).and_then(Object::as_dict_mut) {
                match prev {
                    Some(prev_id) => dictionary.set("Last", prev_id),
                    None => { dictionary.remove(b"Last"); }
                }
            }
        }

        decrement_outline_counts(document, parent);
        document.objects.remove(&id);
        *removed += 1;
    }
}

fn cleanup_structure(document: &mut Document, removed: &mut usize) -> Result<(), SevenError> {
    cleanup_invalid_links(document, removed)?;
    cleanup_invalid_bookmarks(document, removed);

    let page_ids = document.get_pages().values().copied().collect::<Vec<_>>();
    for page_id in page_ids {
        if let Ok(page) = document.get_object_mut(page_id).and_then(Object::as_dict_mut) {
            remove_key(page, b"Thumb", removed);
        }
    }
    Ok(())
}

pub fn sanitize_document(
    input: &Path,
    output: &Path,
    options: SanitizeOptions,
) -> Result<SanitizeReport, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut removed = 0usize;

    for object in document.objects.values_mut() {
        scrub_object(object, &options, &mut removed);
    }

    remove_selected_annotations(&mut document, &options, &mut removed)?;
    if options.cleanup_structure {
        cleanup_structure(&mut document, &mut removed)?;
    }

    if let Ok(catalog) = document.catalog_mut() {
        if options.remove_javascript {
            remove_key(catalog, b"JavaScript", &mut removed);
        }
        if options.remove_open_actions {
            remove_key(catalog, b"OpenAction", &mut removed);
            remove_key(catalog, b"AA", &mut removed);
        }
        if options.remove_embedded_files {
            remove_key(catalog, b"EmbeddedFiles", &mut removed);
            if let Ok(names_object) = catalog.get_mut(b"Names") {
                if let Ok(names) = names_object.as_dict_mut() {
                    remove_key(names, b"EmbeddedFiles", &mut removed);
                    remove_key(names, b"JavaScript", &mut removed);
                }
            }
        }
        if options.remove_xfa {
            if let Ok(form_object) = catalog.get_mut(b"AcroForm") {
                if let Ok(form) = form_object.as_dict_mut() {
                    remove_key(form, b"XFA", &mut removed);
                }
            }
        }
        if options.remove_forms {
            remove_key(catalog, b"AcroForm", &mut removed);
        }
        if options.remove_multimedia {
            if let Ok(names_object) = catalog.get_mut(b"Names") {
                if let Ok(names) = names_object.as_dict_mut() {
                    remove_key(names, b"Renditions", &mut removed);
                }
            }
        }
    }

    let removed_metadata = options.remove_metadata;
    if options.remove_metadata {
        if document.trailer.remove(b"Info").is_some() {
            removed += 1;
        }
    }

    atomic_save(document, output)?;

    Ok(SanitizeReport {
        removed_entries: removed,
        removed_metadata,
        output: output.to_string_lossy().into_owned(),
    })
}

pub fn accessibility_report(path: &Path) -> Result<AccessibilityReport, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let catalog = document.catalog().map_err(|error| SevenError::Operation(error.to_string()))?;
    let has_struct_tree = catalog.get(b"StructTreeRoot").is_ok();
    let language = catalog.get(b"Lang").ok().and_then(object_text);
    let title = {
        let value = info_value(&document, b"Title");
        if value.is_empty() { None } else { Some(value) }
    };
    let marked = catalog
        .get(b"MarkInfo")
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"Marked").ok())
        .and_then(|object| match object { Object::Boolean(value) => Some(*value), _ => None })
        .unwrap_or(false);
    let tagged = has_struct_tree && marked;
    let display_document_title = catalog
        .get(b"ViewerPreferences")
        .ok()
        .and_then(|value| match value {
            Object::Dictionary(dictionary) => Some(dictionary),
            Object::Reference(id) => document.get_object(*id).ok()?.as_dict().ok(),
            _ => None,
        })
        .and_then(|dictionary| dictionary.get(b"DisplayDocTitle").ok())
        .and_then(|value| value.as_bool().ok())
        .unwrap_or(false);

    let mut tag_count = 0usize;
    let mut figure_count = 0usize;
    let mut figures_missing_alt = 0usize;
    for object in document.objects.values() {
        let Ok(dictionary) = object.as_dict() else { continue };
        if dictionary
            .get(b"Type")
            .ok()
            .and_then(|value| value.as_name().ok())
            .is_some_and(|value| value == b"StructElem")
        {
            tag_count += 1;
            let tag_type = dictionary.get(b"S").ok().and_then(|value| value.as_name().ok());
            if tag_type == Some(b"Figure") {
                figure_count += 1;
                let alt = dictionary.get(b"Alt").ok().and_then(object_text);
                if alt.as_ref().map_or(true, |value| value.trim().is_empty()) {
                    figures_missing_alt += 1;
                }
            }
        }
    }

    let mut form_field_count = 0usize;
    let mut form_fields_missing_description = 0usize;
    if let Ok(form_object) = catalog.get(b"AcroForm") {
        let form = match form_object {
            Object::Dictionary(dictionary) => Some(dictionary),
            Object::Reference(id) => document.get_object(*id).ok().and_then(|object| object.as_dict().ok()),
            _ => None,
        };
        if let Some(form) = form {
            let mut stack = form
                .get(b"Fields")
                .ok()
                .and_then(|value| value.as_array().ok())
                .cloned()
                .unwrap_or_default();
            let mut seen = std::collections::HashSet::new();
            while let Some(value) = stack.pop() {
                let Ok(id) = value.as_reference() else { continue };
                if !seen.insert(id) { continue; }
                let Ok(field) = document.get_object(id).and_then(Object::as_dict) else { continue };
                if let Ok(Object::Array(kids)) = field.get(b"Kids") {
                    stack.extend(kids.iter().cloned());
                }
                if field.get(b"FT").is_ok() {
                    form_field_count += 1;
                    let tooltip = field.get(b"TU").ok().and_then(object_text).unwrap_or_default();
                    if tooltip.trim().is_empty() {
                        form_fields_missing_description += 1;
                    }
                }
            }
        }
    }

    let mut pages_missing_tab_order = 0usize;
    let mut image_only_pages = Vec::new();
    for (page_number, page_id) in document.get_pages() {
        let page_index = page_number.saturating_sub(1) as usize;
        let page = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok());
        let has_tabs = page
            .and_then(|dictionary| dictionary.get(b"Tabs").ok())
            .and_then(|value| value.as_name().ok())
            .is_some_and(|value| matches!(value, b"S" | b"R" | b"C"));
        if !has_tabs {
            pages_missing_tab_order += 1;
        }

        let data = document.get_page_content(page_id);
        let has_text = Content::decode(&data)
            .ok()
            .is_some_and(|content| content.operations.iter().any(|operation| {
                matches!(operation.operator.as_str(), "Tj" | "TJ" | "'" | "\"")
            }));
        if !has_text {
            image_only_pages.push(page_index);
        }
    }

    let mut checks = Vec::new();
    let mut push = |id: &str, label: &str, passed: bool, severity: &str, detail: String, fixable: bool| {
        checks.push(AccessibilityCheck {
            id: id.into(),
            label: label.into(),
            passed,
            severity: severity.into(),
            detail,
            page_index: None,
            fixable,
        });
    };
    push(
        "tagged",
        "PDF marcado (Tagged PDF)",
        tagged,
        "error",
        if tagged { format!("{tag_count} tag(s) estruturais encontradas.") } else { "StructTreeRoot e/ou MarkInfo ausentes.".into() },
        !tagged,
    );
    push(
        "language",
        "Idioma do documento",
        language.as_ref().is_some_and(|value| !value.trim().is_empty()),
        "warning",
        language.clone().unwrap_or_else(|| "O catálogo não define /Lang.".into()),
        true,
    );
    push(
        "title",
        "Título do documento",
        title.as_ref().is_some_and(|value| !value.trim().is_empty()),
        "warning",
        title.clone().unwrap_or_else(|| "Metadado Title não definido.".into()),
        true,
    );
    push(
        "display-title",
        "Exibir título do documento",
        display_document_title,
        "warning",
        if display_document_title { "ViewerPreferences/DisplayDocTitle está ativo.".into() } else { "A janela pode exibir somente o nome do arquivo.".into() },
        true,
    );
    push(
        "figure-alt",
        "Texto alternativo de figuras",
        figures_missing_alt == 0,
        "error",
        format!("{figure_count} figura(s); {figures_missing_alt} sem /Alt."),
        figures_missing_alt > 0,
    );
    push(
        "form-descriptions",
        "Descrições de campos de formulário",
        form_fields_missing_description == 0,
        "error",
        format!("{form_field_count} campo(s); {form_fields_missing_description} sem /TU."),
        form_fields_missing_description > 0,
    );
    push(
        "tab-order",
        "Ordem de tabulação",
        pages_missing_tab_order == 0,
        "warning",
        format!("{pages_missing_tab_order} página(s) sem /Tabs explícito."),
        pages_missing_tab_order > 0,
    );
    push(
        "text-layer",
        "Camada textual",
        image_only_pages.is_empty(),
        "warning",
        if image_only_pages.is_empty() {
            "Todas as páginas possuem operadores de texto detectáveis.".into()
        } else {
            format!("{} página(s) sem operadores de texto; OCR pode ser necessário.", image_only_pages.len())
        },
        false,
    );
    push(
        "pages",
        "Documento possui páginas",
        !document.get_pages().is_empty(),
        "error",
        format!("{} página(s) detectada(s).", document.get_pages().len()),
        false,
    );

    Ok(AccessibilityReport {
        tagged,
        language,
        title,
        display_document_title,
        tag_count,
        figure_count,
        figures_missing_alt,
        form_field_count,
        form_fields_missing_description,
        pages_missing_tab_order,
        image_only_pages,
        checks,
    })
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-write.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(())
}
