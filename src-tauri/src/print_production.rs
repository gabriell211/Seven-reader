use crate::error::SevenError;
use lopdf::{Dictionary, Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePreflight {
    pub page_index: usize,
    pub width_pt: f64,
    pub height_pt: f64,
    pub media_box: [f64; 4],
    pub crop_box: Option<[f64; 4]>,
    pub trim_box: Option<[f64; 4]>,
    pub bleed_box: Option<[f64; 4]>,
    pub art_box: Option<[f64; 4]>,
    pub rotation: i64,
    pub annotations: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontPreflight {
    pub object_id: String,
    pub name: String,
    pub subtype: String,
    pub embedded: bool,
    pub subset: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintPreflightReport {
    pub pdf_version: String,
    pub page_count: usize,
    pub has_output_intent: bool,
    pub uses_device_rgb: bool,
    pub uses_device_cmyk: bool,
    pub uses_device_gray: bool,
    pub uses_icc: bool,
    pub has_transparency: bool,
    pub has_overprint: bool,
    pub spot_colors: Vec<String>,
    pub fonts: Vec<FontPreflight>,
    pub pages: Vec<PagePreflight>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageBoxUpdate {
    pub page_start: usize,
    pub page_end: usize,
    pub trim_inset_pt: f64,
    pub bleed_inset_pt: f64,
    pub crop_to_trim: bool,
}

fn number(value: &Object) -> Option<f64> {
    match value {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some(f64::from(*value)),
        _ => None,
    }
}

fn object_id_string(id: ObjectId) -> String {
    format!("{}:{}", id.0, id.1)
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

fn box_from_object(object: &Object) -> Option<[f64; 4]> {
    let array = object.as_array().ok()?;
    if array.len() < 4 {
        return None;
    }
    Some([
        number(&array[0])?,
        number(&array[1])?,
        number(&array[2])?,
        number(&array[3])?,
    ])
}

fn inherited_box(document: &Document, id: ObjectId, key: &[u8]) -> Option<[f64; 4]> {
    inherited_object(document, id, key).as_ref().and_then(box_from_object)
}

fn dict_for_object<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Stream(stream) => Some(&stream.dict),
        Object::Reference(id) => document.get_object(*id).ok().and_then(|value| value.as_dict().ok()),
        _ => None,
    }
}

fn object_name(object: &Object) -> String {
    object
        .as_name()
        .ok()
        .map(|value| String::from_utf8_lossy(value).into_owned())
        .unwrap_or_default()
}

fn font_embedded(document: &Document, dictionary: &Dictionary) -> bool {
    let descriptor = dictionary.get(b"FontDescriptor").ok();
    let Some(descriptor) = descriptor else {
        if let Ok(Object::Array(descendants)) = dictionary.get(b"DescendantFonts") {
            return descendants.iter().any(|font| {
                dict_for_object(document, font)
                    .map(|descendant| font_embedded(document, descendant))
                    .unwrap_or(false)
            });
        }
        return false;
    };
    let Some(descriptor) = dict_for_object(document, descriptor) else { return false };
    [b"FontFile".as_slice(), b"FontFile2".as_slice(), b"FontFile3".as_slice()]
        .iter()
        .any(|key| descriptor.get(key).is_ok())
}

fn inspect_object(
    document: &Document,
    object: &Object,
    uses_rgb: &mut bool,
    uses_cmyk: &mut bool,
    uses_gray: &mut bool,
    uses_icc: &mut bool,
    transparency: &mut bool,
    overprint: &mut bool,
    spot_colors: &mut HashSet<String>,
) {
    match object {
        Object::Name(name) => match name.as_slice() {
            b"DeviceRGB" => *uses_rgb = true,
            b"DeviceCMYK" => *uses_cmyk = true,
            b"DeviceGray" => *uses_gray = true,
            b"ICCBased" => *uses_icc = true,
            _ => {}
        },
        Object::Array(values) => {
            if let Some(Object::Name(kind)) = values.first() {
                if kind == b"Separation" {
                    if let Some(Object::Name(name)) = values.get(1) {
                        spot_colors.insert(String::from_utf8_lossy(name).into_owned());
                    }
                }
                if kind == b"DeviceN" {
                    if let Some(Object::Array(names)) = values.get(1) {
                        for name in names {
                            if let Object::Name(name) = name {
                                spot_colors.insert(String::from_utf8_lossy(name).into_owned());
                            }
                        }
                    }
                }
            }
            for value in values {
                inspect_object(
                    document, value, uses_rgb, uses_cmyk, uses_gray, uses_icc,
                    transparency, overprint, spot_colors,
                );
            }
        }
        Object::Dictionary(dictionary) => {
            inspect_dictionary(
                document, dictionary, uses_rgb, uses_cmyk, uses_gray, uses_icc,
                transparency, overprint, spot_colors,
            );
        }
        Object::Stream(stream) => {
            inspect_dictionary(
                document, &stream.dict, uses_rgb, uses_cmyk, uses_gray, uses_icc,
                transparency, overprint, spot_colors,
            );
        }
        _ => {}
    }
}

fn inspect_dictionary(
    document: &Document,
    dictionary: &Dictionary,
    uses_rgb: &mut bool,
    uses_cmyk: &mut bool,
    uses_gray: &mut bool,
    uses_icc: &mut bool,
    transparency: &mut bool,
    overprint: &mut bool,
    spot_colors: &mut HashSet<String>,
) {
    if dictionary.get(b"SMask").is_ok() {
        *transparency = true;
    }
    for key in [b"CA".as_slice(), b"ca".as_slice()] {
        if dictionary.get(key).ok().and_then(number).is_some_and(|value| value < 0.999) {
            *transparency = true;
        }
    }
    if dictionary
        .get(b"BM")
        .ok()
        .map(object_name)
        .is_some_and(|name| !name.is_empty() && name != "Normal")
    {
        *transparency = true;
    }
    if dictionary.get(b"OP").ok().and_then(|value| value.as_bool().ok()).unwrap_or(false)
        || dictionary.get(b"op").ok().and_then(|value| value.as_bool().ok()).unwrap_or(false)
    {
        *overprint = true;
    }

    for (_, value) in dictionary.iter() {
        match value {
            Object::Reference(_) => {}
            _ => inspect_object(
                document, value, uses_rgb, uses_cmyk, uses_gray, uses_icc,
                transparency, overprint, spot_colors,
            ),
        }
    }
}

pub fn preflight(path: &Path) -> Result<PrintPreflightReport, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_map = document.get_pages();
    let mut pages = Vec::with_capacity(page_map.len());
    let mut fonts = Vec::new();
    let mut uses_rgb = false;
    let mut uses_cmyk = false;
    let mut uses_gray = false;
    let mut uses_icc = false;
    let mut transparency = false;
    let mut overprint = false;
    let mut spot_colors = HashSet::new();

    for (page_number, page_id) in &page_map {
        let media = inherited_box(&document, *page_id, b"MediaBox").unwrap_or([0.0, 0.0, 612.0, 792.0]);
        let crop = inherited_box(&document, *page_id, b"CropBox");
        let trim = inherited_box(&document, *page_id, b"TrimBox");
        let bleed = inherited_box(&document, *page_id, b"BleedBox");
        let art = inherited_box(&document, *page_id, b"ArtBox");
        let rotation = inherited_object(&document, *page_id, b"Rotate")
            .as_ref()
            .and_then(|value| value.as_i64().ok())
            .unwrap_or(0);
        let annotations = document
            .get_object(*page_id)
            .ok()
            .and_then(|value| value.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Annots").ok())
            .and_then(|value| value.as_array().ok())
            .map(Vec::len)
            .unwrap_or(0);
        pages.push(PagePreflight {
            page_index: page_number.saturating_sub(1) as usize,
            width_pt: (media[2] - media[0]).abs(),
            height_pt: (media[3] - media[1]).abs(),
            media_box: media,
            crop_box: crop,
            trim_box: trim,
            bleed_box: bleed,
            art_box: art,
            rotation,
            annotations,
        });
    }

    for (id, object) in &document.objects {
        inspect_object(
            &document, object, &mut uses_rgb, &mut uses_cmyk, &mut uses_gray, &mut uses_icc,
            &mut transparency, &mut overprint, &mut spot_colors,
        );
        let Some(dictionary) = dict_for_object(&document, object) else { continue };
        if dictionary
            .get(b"Type")
            .ok()
            .and_then(|value| value.as_name().ok())
            .is_some_and(|name| name == b"Font")
        {
            let name = dictionary
                .get(b"BaseFont")
                .ok()
                .map(object_name)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "Fonte sem BaseFont".into());
            let subtype = dictionary
                .get(b"Subtype")
                .ok()
                .map(object_name)
                .unwrap_or_default();
            let embedded = font_embedded(&document, dictionary);
            let subset = name.as_bytes().get(6).is_some_and(|value| *value == b'+')
                && name.as_bytes().iter().take(6).all(u8::is_ascii_uppercase);
            fonts.push(FontPreflight {
                object_id: object_id_string(*id),
                name,
                subtype,
                embedded,
                subset,
            });
        }
    }

    fonts.sort_by(|left, right| left.name.cmp(&right.name));
    fonts.dedup_by(|left, right| left.object_id == right.object_id);
    let mut spot_colors = spot_colors.into_iter().collect::<Vec<_>>();
    spot_colors.sort();

    let has_output_intent = document
        .catalog()
        .ok()
        .is_some_and(|catalog| catalog.get(b"OutputIntents").is_ok());

    let mut warnings = Vec::new();
    if !has_output_intent {
        warnings.push("O documento não declara OutputIntent.".into());
    }
    if uses_rgb {
        warnings.push("DeviceRGB detectado; valide a conversão de cor para o processo de impressão.".into());
    }
    let unembedded = fonts.iter().filter(|font| !font.embedded).count();
    if unembedded > 0 {
        warnings.push(format!("{unembedded} fonte(s) sem programa incorporado detectadas."));
    }
    if transparency {
        warnings.push("Transparência ou blend mode detectado; fluxos PDF/X-1 podem exigir flattening.".into());
    }
    if pages.iter().any(|page| page.trim_box.is_none()) {
        warnings.push("Uma ou mais páginas não possuem TrimBox explícito.".into());
    }
    if pages.iter().any(|page| page.bleed_box.is_none()) {
        warnings.push("Uma ou mais páginas não possuem BleedBox explícito.".into());
    }

    Ok(PrintPreflightReport {
        pdf_version: document.version.clone(),
        page_count: pages.len(),
        has_output_intent,
        uses_device_rgb: uses_rgb,
        uses_device_cmyk: uses_cmyk,
        uses_device_gray: uses_gray,
        uses_icc,
        has_transparency: transparency,
        has_overprint: overprint,
        spot_colors,
        fonts,
        pages,
        warnings,
    })
}

fn inset_box(media: [f64; 4], inset: f64) -> Result<[f64; 4], SevenError> {
    let inset = inset.max(0.0);
    let result = [
        media[0] + inset,
        media[1] + inset,
        media[2] - inset,
        media[3] - inset,
    ];
    if result[2] <= result[0] || result[3] <= result[1] {
        return Err(SevenError::OperationRejected(
            "O inset informado é maior que a página".into(),
        ));
    }
    Ok(result)
}

pub fn set_page_boxes(input: &Path, output: &Path, update: PageBoxUpdate) -> Result<(), SevenError> {
    if update.page_start == 0 || update.page_end < update.page_start {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }
    if !update.trim_inset_pt.is_finite()
        || !update.bleed_inset_pt.is_finite()
        || update.trim_inset_pt < 0.0
        || update.bleed_inset_pt < 0.0
        || update.bleed_inset_pt > update.trim_inset_pt
    {
        return Err(SevenError::OperationRejected(
            "Boxes inválidos: BleedBox deve ficar entre MediaBox e TrimBox".into(),
        ));
    }

    let mut document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let pages = document.get_pages();
    if update.page_end > pages.len() {
        return Err(SevenError::OperationRejected(format!(
            "O documento possui apenas {} páginas",
            pages.len()
        )));
    }

    for page_number in update.page_start..=update.page_end {
        let page_id = *pages
            .get(&(page_number as u32))
            .ok_or_else(|| SevenError::OperationRejected("Página não encontrada".into()))?;
        let media = inherited_box(&document, page_id, b"MediaBox").unwrap_or([0.0, 0.0, 612.0, 792.0]);
        let trim = inset_box(media, update.trim_inset_pt)?;
        let bleed = inset_box(media, update.bleed_inset_pt)?;
        let page = document
            .get_object_mut(page_id)
            .map_err(|error| SevenError::Operation(error.to_string()))?
            .as_dict_mut()
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        page.set("TrimBox", trim.into_iter().map(Object::from).collect::<Vec<_>>());
        page.set("BleedBox", bleed.into_iter().map(Object::from).collect::<Vec<_>>());
        if update.crop_to_trim {
            page.set("CropBox", trim.into_iter().map(Object::from).collect::<Vec<_>>());
        }
    }

    let temp = output.with_extension("seven-boxes.tmp.pdf");
    document.compress();
    document.save(&temp).map_err(|error| SevenError::Io(error.to_string()))?;
    Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}
