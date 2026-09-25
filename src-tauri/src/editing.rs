use crate::error::SevenError;
use lopdf::{
    content::{Content, Operation},
    dictionary, Dictionary, Document, Object, ObjectId, Stream,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

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
    pub target: String,
    pub target_page: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayTextOptions {
    pub kind: String,
    pub text: String,
    pub prefix: String,
    pub start_number: u64,
    pub digits: u8,
    pub font_size: f64,
    pub page_start: usize,
    pub page_end: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundOptions {
    pub page_start: usize,
    pub page_end: Option<usize>,
    pub red: f64,
    pub green: f64,
    pub blue: f64,
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

fn append_content(document: &mut Document, page_id: ObjectId, content: Content<Vec<Operation>>) -> Result<(), SevenError> {
    document
        .add_to_page_content(page_id, content)
        .map_err(|error| SevenError::Operation(error.to_string()))
}

fn prepend_content(document: &mut Document, page_id: ObjectId, bytes: Vec<u8>) -> Result<(), SevenError> {
    let existing = document
        .get_object(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .get(b"Contents")
        .ok()
        .cloned();

    let stream_id = document.add_object(Stream::new(Dictionary::new(), bytes));
    let mut contents = vec![Object::Reference(stream_id)];
    match existing {
        Some(Object::Reference(id)) => contents.push(Object::Reference(id)),
        Some(Object::Array(values)) => contents.extend(values),
        _ => {}
    }
    document
        .get_object_mut(page_id)
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .as_dict_mut()
        .map_err(|error| SevenError::Operation(error.to_string()))?
        .set("Contents", contents);
    Ok(())
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
    let mut cos = radians.cos();
    let mut sin = radians.sin();
    if placement.mirror_x { cos = -cos; sin = -sin; }
    let vertical = if placement.mirror_y { -1.0 } else { 1.0 };
    let a = placement.width * cos;
    let b = placement.width * sin;
    let c_matrix = -placement.height * sin * vertical;
    let d = placement.height * cos * vertical;

    append_content(
        &mut document,
        page_id,
        Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new("gs", vec![Object::Name(gs_name.into_bytes())]),
                Operation::new("cm", vec![
                    a.into(), b.into(), c_matrix.into(), d.into(),
                    placement.x.into(), placement.y.into(),
                ]),
                Operation::new("Do", vec![Object::Name(name.into_bytes())]),
                Operation::new("Q", vec![]),
            ],
        },
    )?;

    atomic_save(document, output)
}

pub fn add_link(input: &Path, output: &Path, link: LinkPlacement) -> Result<(), SevenError> {
    if link.width <= 0.0 || link.height <= 0.0 {
        return Err(SevenError::OperationRejected("Área do link inválida".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = page_id(&document, link.page_index)?;
    let rect = vec![
        link.x.into(),
        link.y.into(),
        (link.x + link.width).into(),
        (link.y + link.height).into(),
    ];
    let mut annotation = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Link",
        "Rect" => rect,
        "Border" => vec![0.into(), 0.into(), 0.into()],
        "F" => 4,
    };
    if let Some(target_page) = link.target_page {
        let target_id = page_id(&document, target_page)?;
        annotation.set("Dest", vec![target_id.into(), Object::Name(b"Fit".to_vec())]);
    } else {
        let uri = link.target.trim();
        if uri.is_empty() || uri.chars().count() > 4096 {
            return Err(SevenError::OperationRejected("Destino do link inválido".into()));
        }
        annotation.set(
            "A",
            dictionary! {
                "S" => "URI",
                "URI" => Object::string_literal(uri),
            },
        );
    }
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

pub fn add_overlay_text(
    input: &Path,
    output: &Path,
    options: OverlayTextOptions,
) -> Result<(), SevenError> {
    if options.font_size < 1.0 || options.font_size > 200.0 {
        return Err(SevenError::OperationRejected("Fonte inválida".into()));
    }
    if options.digits == 0 || options.digits > 20 {
        return Err(SevenError::OperationRejected("Quantidade de dígitos inválida".into()));
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let pages = document.get_pages();
    let total = pages.len();
    if total == 0 {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }
    let start = options.page_start.min(total.saturating_sub(1));
    let end = options.page_end.unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));
    if start > end {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }

    for index in start..=end {
        let id = page_id(&document, index)?;
        let (page_width, page_height) = page_dimensions(&document, id);
        let (text, x, y, rotation, gray) = match options.kind.as_str() {
            "header" => (options.text.clone(), 36.0, page_height - 28.0, 0.0, 0.2),
            "footer" => (options.text.clone(), 36.0, 20.0, 0.0, 0.2),
            "page-number" => (format!("{}", index + 1), page_width / 2.0, 20.0, 0.0, 0.2),
            "watermark" => (
                options.text.clone(),
                page_width * 0.20,
                page_height * 0.45,
                35.0,
                0.72,
            ),
            "bates" => {
                let number = options.start_number + (index - start) as u64;
                (
                    format!(
                        "{}{:0width$}",
                        options.prefix,
                        number,
                        width = options.digits as usize
                    ),
                    page_width - 160.0,
                    20.0,
                    0.0,
                    0.2,
                )
            }
            _ => return Err(SevenError::OperationRejected("Tipo de overlay inválido".into())),
        };
        let font = ensure_helvetica(&mut document, id)?;
        let placement = TextPlacement {
            page_index: index,
            text,
            x,
            y,
            font_size: options.font_size,
            rotation,
            gray,
        };
        append_content(&mut document, id, Content { operations: text_operations(font, &placement) })?;
    }

    atomic_save(document, output)
}

pub fn set_background(
    input: &Path,
    output: &Path,
    options: BackgroundOptions,
) -> Result<(), SevenError> {
    for component in [options.red, options.green, options.blue] {
        if !(0.0..=1.0).contains(&component) {
            return Err(SevenError::OperationRejected("Cor de fundo inválida".into()));
        }
    }
    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let total = document.get_pages().len();
    if total == 0 {
        return Err(SevenError::OperationRejected("Documento sem páginas".into()));
    }
    let start = options.page_start.min(total.saturating_sub(1));
    let end = options.page_end.unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));

    for index in start..=end {
        let id = page_id(&document, index)?;
        let (width, height) = page_dimensions(&document, id);
        let content = Content {
            operations: vec![
                Operation::new("q", vec![]),
                Operation::new("rg", vec![options.red.into(), options.green.into(), options.blue.into()]),
                Operation::new("re", vec![0.into(), 0.into(), width.into(), height.into()]),
                Operation::new("f", vec![]),
                Operation::new("Q", vec![]),
            ],
        }
        .encode()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
        prepend_content(&mut document, id, content)?;
    }

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
