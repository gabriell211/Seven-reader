use crate::{annotations, error::SevenError};
use lopdf::{dictionary, Document, Object};
use quick_xml::{events::Event, Reader};
use serde::Serialize;
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewTransferReport {
    pub annotations: usize,
    pub skipped: usize,
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn xfdf_tag(kind: &str) -> Option<&'static str> {
    match kind {
        "Text" => Some("text"),
        "Highlight" => Some("highlight"),
        "Underline" => Some("underline"),
        "StrikeOut" => Some("strikeout"),
        "Stamp" => Some("stamp"),
        "FreeText" => Some("freetext"),
        _ => None,
    }
}

pub fn export_xfdf(input: &Path, destination: &Path) -> Result<ReviewTransferReport, SevenError> {
    let annotations = annotations::list_annotations(input)?;
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<xfdf xmlns=\"http://ns.adobe.com/xfdf/\">\n  <annots>\n");
    let mut exported = 0usize;
    let mut skipped = 0usize;

    for annotation in annotations {
        let Some(tag) = xfdf_tag(&annotation.kind) else {
            skipped += 1;
            continue;
        };
        let rect = format!(
            "{},{},{},{}",
            annotation.rect[0], annotation.rect[1], annotation.rect[2], annotation.rect[3]
        );
        xml.push_str(&format!(
            "    <{tag} page=\"{}\" rect=\"{}\" title=\"{}\"><contents>{}</contents></{tag}>\n",
            annotation.page_index,
            rect,
            xml_escape(&annotation.author),
            xml_escape(&annotation.text),
        ));
        exported += 1;
    }

    xml.push_str("  </annots>\n</xfdf>\n");
    fs::write(destination, xml).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(ReviewTransferReport { annotations: exported, skipped })
}

#[derive(Default)]
struct ParsedAnnotation {
    tag: String,
    page: usize,
    rect: [f64; 4],
    author: String,
    contents: String,
}

fn kind_from_tag(tag: &str) -> Option<&'static str> {
    match tag {
        "text" => Some("note"),
        "highlight" => Some("highlight"),
        "underline" => Some("underline"),
        "strikeout" => Some("strikeout"),
        "stamp" => Some("stamp"),
        "freetext" => Some("freetext"),
        _ => None,
    }
}

fn parse_rect(value: &str) -> Option<[f64; 4]> {
    let values = value.split(',').map(str::trim).map(str::parse::<f64>).collect::<Result<Vec<_>, _>>().ok()?;
    if values.len() != 4 { return None; }
    Some([values[0], values[1], values[2], values[3]])
}

pub fn import_xfdf(input: &Path, output: &Path, xfdf: &Path) -> Result<ReviewTransferReport, SevenError> {
    let mut reader = Reader::from_file(xfdf).map_err(|error| SevenError::Operation(error.to_string()))?;
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut current: Option<ParsedAnnotation> = None;
    let mut parsed = Vec::new();
    let mut skipped = 0usize;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_string();
                if kind_from_tag(&tag).is_some() {
                    let mut item = ParsedAnnotation { tag, ..Default::default() };
                    for attr in event.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref());
                        let value = attr.unescape_value().map(|v| v.into_owned()).unwrap_or_default();
                        match key.as_ref() {
                            "page" => item.page = value.parse().unwrap_or(0),
                            "rect" => if let Some(rect) = parse_rect(&value) { item.rect = rect; },
                            "title" => item.author = value,
                            _ => {}
                        }
                    }
                    current = Some(item);
                }
            }
            Ok(Event::Text(event)) => {
                if let Some(item) = current.as_mut() {
                    item.contents.push_str(&event.decode().map(|v| v.into_owned()).unwrap_or_default());
                }
            }
            Ok(Event::End(event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_string();
                if current.as_ref().is_some_and(|item| item.tag == tag) {
                    parsed.push(current.take().unwrap());
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(SevenError::Operation(format!("XFDF inválido: {error}"))),
            _ => {}
        }
        buf.clear();
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    for item in parsed {
        let Some(kind) = kind_from_tag(&item.tag) else { skipped += 1; continue };
        let Some(page_id) = document.get_pages().get(&((item.page + 1) as u32)).copied() else {
            skipped += 1;
            continue;
        };
        let [x1, y1, x2, y2] = item.rect;
        if x2 <= x1 || y2 <= y1 {
            skipped += 1;
            continue;
        }
        let subtype = match kind {
            "note" => "Text",
            "highlight" => "Highlight",
            "underline" => "Underline",
            "strikeout" => "StrikeOut",
            "stamp" => "Stamp",
            "freetext" => "FreeText",
            _ => { skipped += 1; continue; }
        };
        let mut dict = dictionary! {
            "Type" => "Annot",
            "Subtype" => subtype,
            "Rect" => vec![x1.into(), y1.into(), x2.into(), y2.into()],
            "Contents" => Object::string_literal(item.contents),
            "T" => Object::string_literal(item.author),
            "F" => 4,
            "C" => vec![0.44.into(), 0.26.into(), 0.94.into()],
        };
        if matches!(kind, "highlight" | "underline" | "strikeout") {
            dict.set("QuadPoints", vec![
                x1.into(), y2.into(), x2.into(), y2.into(),
                x1.into(), y1.into(), x2.into(), y1.into(),
            ]);
        }
        if kind == "stamp" { dict.set("Name", "Approved"); }
        if kind == "freetext" { dict.set("DA", Object::string_literal("/Helv 10 Tf 0.2 0.2 0.2 rg")); }
        let id = document.add_object(dict);
        let page = document.get_object_mut(page_id).map_err(|e| SevenError::Operation(e.to_string()))?
            .as_dict_mut().map_err(|e| SevenError::Operation(e.to_string()))?;
        match page.get_mut(b"Annots") {
            Ok(Object::Array(values)) => values.push(id.into()),
            Ok(_) => { skipped += 1; continue; }
            Err(_) => page.set("Annots", vec![id.into()]),
        }
    }

    let imported = document.objects.values().filter(|o| {
        o.as_dict().ok().and_then(|d| d.get(b"Subtype").ok()).is_some()
    }).count();
    let temp = output.with_extension("seven-review.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() { fs::remove_file(output).map_err(|e| SevenError::Io(e.to_string()))?; }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(ReviewTransferReport { annotations: imported, skipped })
}
