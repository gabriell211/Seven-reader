use crate::{error::SevenError, pdf::NormalizedRect};
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleBoxInfo {
    pub object_id: String,
    pub index: usize,
    pub page_index: usize,
    pub rect: [f64; 4],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleInfo {
    pub object_id: String,
    pub title: String,
    pub subject: String,
    pub author: String,
    pub keywords: String,
    pub boxes: Vec<ArticleBoxInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleMetadataUpdate {
    pub object_id: String,
    pub title: String,
    pub subject: String,
    pub author: String,
    pub keywords: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewArticleBox {
    pub article_object_id: Option<String>,
    pub title: String,
    pub subject: String,
    pub author: String,
    pub keywords: String,
    pub page_index: usize,
    pub rect: NormalizedRect,
    pub insert_at: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleBoxUpdate {
    pub object_id: String,
    pub page_index: usize,
    pub rect: NormalizedRect,
}

fn id_string(id: ObjectId) -> String {
    format!("{}:{}", id.0, id.1)
}

fn parse_id(value: &str) -> Result<ObjectId, SevenError> {
    let (object, generation) = value
        .split_once(':')
        .ok_or_else(|| SevenError::OperationRejected("Object ID inválido".into()))?;
    Ok((
        object.parse::<u32>().map_err(|_| SevenError::OperationRejected("Object ID inválido".into()))?,
        generation.parse::<u16>().map_err(|_| SevenError::OperationRejected("Object ID inválido".into()))?,
    ))
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

fn root_id(document: &Document) -> Result<ObjectId, SevenError> {
    document
        .trailer
        .get(b"Root")
        .map_err(|_| SevenError::Operation("PDF sem catálogo Root".into()))?
        .as_reference()
        .map_err(|_| SevenError::Operation("Root inválido".into()))
}

fn thread_ids(document: &Document) -> Vec<ObjectId> {
    let Ok(root_id) = root_id(document) else { return Vec::new() };
    let Ok(root) = document.get_object(root_id).and_then(Object::as_dict) else { return Vec::new() };
    let Ok(threads) = root.get(b"Threads") else { return Vec::new() };
    match threads {
        Object::Array(values) => values.iter().filter_map(|value| value.as_reference().ok()).collect(),
        Object::Reference(id) => document
            .get_object(*id)
            .ok()
            .and_then(|value| value.as_array().ok())
            .map(|values| values.iter().filter_map(|value| value.as_reference().ok()).collect())
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn thread_info(document: &Document, thread: &Dictionary) -> Dictionary {
    match thread.get(b"I") {
        Ok(Object::Dictionary(dictionary)) => dictionary.clone(),
        Ok(Object::Reference(id)) => document
            .get_object(*id)
            .ok()
            .and_then(|value| value.as_dict().ok())
            .cloned()
            .unwrap_or_default(),
        _ => Dictionary::new(),
    }
}

fn page_index_for_id(document: &Document, page_id: ObjectId) -> Option<usize> {
    document
        .get_pages()
        .values()
        .position(|candidate| *candidate == page_id)
}

fn bead_rect(dictionary: &Dictionary) -> Option<[f64; 4]> {
    let values = dictionary.get(b"R").ok()?.as_array().ok()?;
    if values.len() < 4 { return None; }
    Some([
        number(&values[0])?,
        number(&values[1])?,
        number(&values[2])?,
        number(&values[3])?,
    ])
}

fn bead_ids(document: &Document, thread_id: ObjectId) -> Vec<ObjectId> {
    let Ok(thread) = document.get_object(thread_id).and_then(Object::as_dict) else { return Vec::new() };
    let Ok(first) = thread.get(b"F").and_then(Object::as_reference) else { return Vec::new() };
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    let mut current = first;
    for _ in 0..100_000 {
        if !seen.insert(current) {
            break;
        }
        output.push(current);
        let Some(next) = document
            .get_object(current)
            .ok()
            .and_then(|value| value.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"N").ok())
            .and_then(|value| value.as_reference().ok())
        else { break };
        current = next;
    }
    output
}

pub fn list_articles(path: &Path) -> Result<Vec<ArticleInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut articles = Vec::new();

    for thread_id in thread_ids(&document) {
        let Ok(thread) = document.get_object(thread_id).and_then(Object::as_dict) else { continue };
        let info = thread_info(&document, thread);
        let mut boxes = Vec::new();
        for (index, bead_id) in bead_ids(&document, thread_id).into_iter().enumerate() {
            let Ok(bead) = document.get_object(bead_id).and_then(Object::as_dict) else { continue };
            let Some(page_id) = bead.get(b"P").ok().and_then(|value| value.as_reference().ok()) else { continue };
            let Some(page_index) = page_index_for_id(&document, page_id) else { continue };
            let Some(rect) = bead_rect(bead) else { continue };
            boxes.push(ArticleBoxInfo {
                object_id: id_string(bead_id),
                index,
                page_index,
                rect,
            });
        }

        articles.push(ArticleInfo {
            object_id: id_string(thread_id),
            title: info.get(b"Title").ok().map(object_text).unwrap_or_default(),
            subject: info.get(b"Subject").ok().map(object_text).unwrap_or_default(),
            author: info.get(b"Author").ok().map(object_text).unwrap_or_default(),
            keywords: info.get(b"Keywords").ok().map(object_text).unwrap_or_default(),
            boxes,
        });
    }
    Ok(articles)
}

fn inherited_box(document: &Document, mut page_id: ObjectId, key: &[u8]) -> Option<[f64; 4]> {
    for _ in 0..32 {
        let dictionary = document.get_object(page_id).ok()?.as_dict().ok()?;
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
        page_id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn normalized_to_pdf_rect(
    document: &Document,
    page_id: ObjectId,
    rect: &NormalizedRect,
) -> Result<[f64; 4], SevenError> {
    let rect = rect.validated()?;
    let page_box = inherited_box(document, page_id, b"CropBox")
        .or_else(|| inherited_box(document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let width = (page_box[2] - page_box[0]).abs().max(1.0);
    let height = (page_box[3] - page_box[1]).abs().max(1.0);
    let x1 = page_box[0] + f64::from(rect.x) * width;
    let y2 = page_box[3] - f64::from(rect.y) * height;
    let x2 = x1 + f64::from(rect.width) * width;
    let y1 = y2 - f64::from(rect.height) * height;
    Ok([x1, y1, x2, y2])
}

fn ensure_threads_array(document: &mut Document) -> Result<(), SevenError> {
    let root_id = root_id(document)?;
    let root = document
        .get_object_mut(root_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if root.get(b"Threads").is_err() {
        root.set("Threads", Vec::<Object>::new());
    }
    Ok(())
}

fn push_thread(document: &mut Document, thread_id: ObjectId) -> Result<(), SevenError> {
    ensure_threads_array(document)?;
    let root_id = root_id(document)?;
    let existing = document
        .get_object(root_id)
        .ok()
        .and_then(|value| value.as_dict().ok())
        .and_then(|root| root.get(b"Threads").ok())
        .cloned();

    match existing {
        Some(Object::Array(mut values)) => {
            values.push(thread_id.into());
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Threads", values);
        }
        Some(Object::Reference(array_id)) => {
            let array = document
                .get_object_mut(array_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_array_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            array.push(thread_id.into());
        }
        _ => {
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Threads", vec![Object::Reference(thread_id)]);
        }
    }
    Ok(())
}

fn remove_thread_ref(document: &mut Document, thread_id: ObjectId) -> Result<(), SevenError> {
    let root_id = root_id(document)?;
    let existing = document
        .get_object(root_id)
        .ok()
        .and_then(|value| value.as_dict().ok())
        .and_then(|root| root.get(b"Threads").ok())
        .cloned();

    match existing {
        Some(Object::Array(mut values)) => {
            values.retain(|value| value.as_reference().ok() != Some(thread_id));
            document
                .get_object_mut(root_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_dict_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .set("Threads", values);
        }
        Some(Object::Reference(array_id)) => {
            let values = document
                .get_object_mut(array_id)
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .as_array_mut()
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            values.retain(|value| value.as_reference().ok() != Some(thread_id));
        }
        _ => {}
    }
    Ok(())
}

fn set_thread_info(
    document: &mut Document,
    thread_id: ObjectId,
    title: &str,
    subject: &str,
    author: &str,
    keywords: &str,
) -> Result<(), SevenError> {
    for (label, value, max) in [
        ("título", title, 512usize),
        ("assunto", subject, 2_000usize),
        ("autor", author, 512usize),
        ("keywords", keywords, 2_000usize),
    ] {
        if value.chars().count() > max {
            return Err(SevenError::OperationRejected(format!("{label} excede o limite permitido")));
        }
    }

    let info = dictionary! {
        "Title" => Object::string_literal(title.trim()),
        "Subject" => Object::string_literal(subject.trim()),
        "Author" => Object::string_literal(author.trim()),
        "Keywords" => Object::string_literal(keywords.trim()),
    };
    document
        .get_object_mut(thread_id)
        .map_err(|_| SevenError::OperationRejected("Artigo não encontrado".into()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("I", info);
    Ok(())
}

fn relink_beads(
    document: &mut Document,
    thread_id: ObjectId,
    bead_ids: &[ObjectId],
) -> Result<(), SevenError> {
    if bead_ids.is_empty() {
        document
            .get_object_mut(thread_id)
            .map_err(|_| SevenError::OperationRejected("Artigo não encontrado".into()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .remove(b"F");
        return Ok(());
    }
    for (index, bead_id) in bead_ids.iter().enumerate() {
        let previous = bead_ids[(index + bead_ids.len() - 1) % bead_ids.len()];
        let next = bead_ids[(index + 1) % bead_ids.len()];
        let bead = document
            .get_object_mut(*bead_id)
            .map_err(|_| SevenError::OperationRejected("Article Box não encontrada".into()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        bead.set("T", thread_id);
        bead.set("V", previous);
        bead.set("N", next);
    }
    document
        .get_object_mut(thread_id)
        .map_err(|_| SevenError::OperationRejected("Artigo não encontrado".into()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("F", bead_ids[0]);
    Ok(())
}

fn atomic_save(mut document: Document, output: &Path) -> Result<(), SevenError> {
    let temp = output.with_extension("seven-articles.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}

pub fn add_article_box(
    input: &Path,
    output: &Path,
    request: NewArticleBox,
) -> Result<String, SevenError> {
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((request.page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    let rect = normalized_to_pdf_rect(&document, page_id, &request.rect)?;

    let thread_id = if let Some(id) = request.article_object_id.as_deref() {
        let id = parse_id(id)?;
        document.get_object(id)
            .map_err(|_| SevenError::OperationRejected("Artigo não encontrado".into()))?
            .as_dict()
            .map_err(|_| SevenError::OperationRejected("Thread inválido".into()))?;
        id
    } else {
        if request.title.trim().is_empty() {
            return Err(SevenError::OperationRejected("Informe um título para o novo artigo".into()));
        }
        let id = document.add_object(dictionary! {
            "Type" => "Thread",
        });
        set_thread_info(
            &mut document,
            id,
            &request.title,
            &request.subject,
            &request.author,
            &request.keywords,
        )?;
        push_thread(&mut document, id)?;
        id
    };

    let bead_id = document.add_object(dictionary! {
        "Type" => "Bead",
        "T" => thread_id,
        "P" => page_id,
        "R" => vec![rect[0].into(), rect[1].into(), rect[2].into(), rect[3].into()],
    });

    let mut beads = bead_ids(&document, thread_id);
    let position = request.insert_at.unwrap_or(beads.len()).min(beads.len());
    beads.insert(position, bead_id);
    relink_beads(&mut document, thread_id, &beads)?;
    atomic_save(document, output)?;
    Ok(id_string(thread_id))
}

pub fn update_article_metadata(
    input: &Path,
    output: &Path,
    update: ArticleMetadataUpdate,
) -> Result<(), SevenError> {
    let thread_id = parse_id(&update.object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    set_thread_info(
        &mut document,
        thread_id,
        &update.title,
        &update.subject,
        &update.author,
        &update.keywords,
    )?;
    atomic_save(document, output)
}

pub fn update_article_box(
    input: &Path,
    output: &Path,
    update: ArticleBoxUpdate,
) -> Result<(), SevenError> {
    let bead_id = parse_id(&update.object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((update.page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    let rect = normalized_to_pdf_rect(&document, page_id, &update.rect)?;
    let bead = document
        .get_object_mut(bead_id)
        .map_err(|_| SevenError::OperationRejected("Article Box não encontrada".into()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    bead.set("P", page_id);
    bead.set("R", vec![rect[0].into(), rect[1].into(), rect[2].into(), rect[3].into()]);
    atomic_save(document, output)
}

fn find_thread_for_bead(document: &Document, bead_id: ObjectId) -> Option<ObjectId> {
    document
        .get_object(bead_id)
        .ok()?
        .as_dict()
        .ok()?
        .get(b"T")
        .ok()?
        .as_reference()
        .ok()
}

pub fn move_article_box(
    input: &Path,
    output: &Path,
    object_id: &str,
    direction: &str,
) -> Result<(), SevenError> {
    let bead_id = parse_id(object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let thread_id = find_thread_for_bead(&document, bead_id)
        .ok_or_else(|| SevenError::OperationRejected("Thread da Article Box não encontrado".into()))?;
    let mut beads = bead_ids(&document, thread_id);
    let index = beads.iter().position(|candidate| *candidate == bead_id)
        .ok_or_else(|| SevenError::OperationRejected("Article Box fora do thread".into()))?;
    let target = match direction {
        "up" if index > 0 => index - 1,
        "down" if index + 1 < beads.len() => index + 1,
        "first" => 0,
        "last" => beads.len().saturating_sub(1),
        "up" | "down" => return Ok(atomic_save(document, output)?),
        _ => return Err(SevenError::OperationRejected("Direção inválida".into())),
    };
    beads.swap(index, target);
    relink_beads(&mut document, thread_id, &beads)?;
    atomic_save(document, output)
}

pub fn delete_article_box(
    input: &Path,
    output: &Path,
    object_id: &str,
) -> Result<(), SevenError> {
    let bead_id = parse_id(object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let thread_id = find_thread_for_bead(&document, bead_id)
        .ok_or_else(|| SevenError::OperationRejected("Thread da Article Box não encontrado".into()))?;
    let mut beads = bead_ids(&document, thread_id);
    beads.retain(|candidate| *candidate != bead_id);
    document.objects.remove(&bead_id);

    if beads.is_empty() {
        remove_thread_ref(&mut document, thread_id)?;
        document.objects.remove(&thread_id);
    } else {
        relink_beads(&mut document, thread_id, &beads)?;
    }
    atomic_save(document, output)
}

pub fn delete_article(
    input: &Path,
    output: &Path,
    object_id: &str,
) -> Result<(), SevenError> {
    let thread_id = parse_id(object_id)?;
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    for bead_id in bead_ids(&document, thread_id) {
        document.objects.remove(&bead_id);
    }
    remove_thread_ref(&mut document, thread_id)?;
    document.objects.remove(&thread_id);
    atomic_save(document, output)
}

pub fn merge_articles(
    input: &Path,
    output: &Path,
    target_id: &str,
    source_id: &str,
) -> Result<(), SevenError> {
    let target_id = parse_id(target_id)?;
    let source_id = parse_id(source_id)?;
    if target_id == source_id {
        return Err(SevenError::OperationRejected("Origem e destino devem ser artigos diferentes".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut target = bead_ids(&document, target_id);
    let source = bead_ids(&document, source_id);
    if source.is_empty() {
        return Err(SevenError::OperationRejected("Artigo de origem não possui caixas".into()));
    }
    target.extend(source.iter().copied());
    relink_beads(&mut document, target_id, &target)?;
    remove_thread_ref(&mut document, source_id)?;
    document.objects.remove(&source_id);
    atomic_save(document, output)
}
