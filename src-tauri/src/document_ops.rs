use crate::error::SevenError;
use lopdf::{Dictionary, Document, Object};
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeReport {
    pub removed_entries: usize,
    pub removed_metadata: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityCheck {
    pub id: String,
    pub label: String,
    pub passed: bool,
    pub severity: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityReport {
    pub tagged: bool,
    pub language: Option<String>,
    pub title: Option<String>,
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
            let is_multimedia = matches!(
                subtype.as_slice(),
                b"RichMedia" | b"3D" | b"Movie" | b"Sound" | b"Screen"
            );
            let remove = (options.remove_forms && is_widget)
                || (options.remove_multimedia && is_multimedia)
                || (options.remove_annotations && !is_widget && !is_multimedia);

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

    let checks = vec![
        AccessibilityCheck {
            id: "tagged".into(),
            label: "PDF marcado (Tagged PDF)".into(),
            passed: tagged,
            severity: "error".into(),
            detail: if tagged { "StructTreeRoot e MarkInfo encontrados.".into() } else { "Estrutura de tags ausente ou incompleta.".into() },
        },
        AccessibilityCheck {
            id: "language".into(),
            label: "Idioma do documento".into(),
            passed: language.as_ref().is_some_and(|value| !value.is_empty()),
            severity: "warning".into(),
            detail: language.clone().unwrap_or_else(|| "O catálogo não define /Lang.".into()),
        },
        AccessibilityCheck {
            id: "title".into(),
            label: "Título do documento".into(),
            passed: title.as_ref().is_some_and(|value| !value.is_empty()),
            severity: "warning".into(),
            detail: title.clone().unwrap_or_else(|| "Metadado Title não definido.".into()),
        },
        AccessibilityCheck {
            id: "pages".into(),
            label: "Documento possui páginas".into(),
            passed: !document.get_pages().is_empty(),
            severity: "error".into(),
            detail: format!("{} página(s) detectada(s).", document.get_pages().len()),
        },
    ];

    Ok(AccessibilityReport { tagged, language, title, checks })
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
