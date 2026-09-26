use crate::error::SevenError;
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveAssetInfo {
    pub object_id: String,
    pub page_index: usize,
    pub kind: String,
    pub subtype: String,
    pub name: String,
    pub mime: String,
    pub size: usize,
    pub sha256: String,
    pub safe_to_open: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeospatialViewportInfo {
    pub object_id: Option<String>,
    pub page_index: usize,
    pub bbox: [f64; 4],
    pub gpts: Vec<[f64; 2]>,
    pub lpts: Vec<[f64; 2]>,
    pub coordinate_kind: String,
    pub epsg: Option<i64>,
    pub wkt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeospatialLocation {
    pub page_index: usize,
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub viewport_object_id: Option<String>,
    pub first: f64,
    pub second: f64,
    pub coordinate_kind: String,
    pub epsg: Option<i64>,
    pub wkt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeospatialMeasurementResult {
    pub kind: String,
    pub value: f64,
    pub unit: String,
    pub coordinate_kind: String,
    pub epsg: Option<i64>,
    pub points: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeospatialCoordinate {
    pub page_index: usize,
    pub viewport_object_id: Option<String>,
    pub local_x: f64,
    pub local_y: f64,
    pub first: f64,
    pub second: f64,
    pub coordinate_kind: String,
    pub epsg: Option<i64>,
    pub wkt: Option<String>,
}

fn id_string(id: ObjectId) -> String {
    format!("{}:{}", id.0, id.1)
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

fn dictionary_from_object<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Reference(id) => document.get_object(*id).ok()?.as_dict().ok(),
        _ => None,
    }
}

fn file_name(dictionary: &Dictionary) -> Option<String> {
    dictionary
        .get(b"UF")
        .or_else(|_| dictionary.get(b"F"))
        .ok()
        .map(object_text)
        .filter(|value| !value.trim().is_empty())
}

fn stream_payload(stream: &Stream) -> Vec<u8> {
    stream.decompressed_content().unwrap_or_else(|_| stream.content.clone())
}

fn media_type_from_name(name: &str) -> Option<(&'static str, bool)> {
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "mp3" => Some(("audio/mpeg", true)),
        "wav" => Some(("audio/wav", true)),
        "ogg" | "oga" => Some(("audio/ogg", true)),
        "m4a" => Some(("audio/mp4", true)),
        "aac" => Some(("audio/aac", true)),
        "flac" => Some(("audio/flac", true)),
        "mp4" | "m4v" => Some(("video/mp4", true)),
        "webm" => Some(("video/webm", true)),
        "mov" => Some(("video/quicktime", true)),
        "avi" => Some(("video/x-msvideo", true)),
        "wmv" => Some(("video/x-ms-wmv", true)),
        _ => None,
    }
}

fn safe_media_name(name: &str) -> bool {
    media_type_from_name(name).is_some()
}

fn push_asset(
    output: &mut Vec<InteractiveAssetInfo>,
    seen: &mut HashSet<ObjectId>,
    id: ObjectId,
    stream: &Stream,
    page_index: usize,
    kind: &str,
    name: Option<String>,
) {
    if !seen.insert(id) {
        return;
    }
    let data = stream_payload(stream);
    let subtype = stream
        .dict
        .get(b"Subtype")
        .ok()
        .map(object_text)
        .unwrap_or_default();
    let extension = match subtype.as_str() {
        "U3D" => "u3d",
        "PRC" => "prc",
        _ => "bin",
    };
    let name = name.unwrap_or_else(|| format!("object-{}-{}.{}", id.0, id.1, extension));
    let mime = media_type_from_name(&name)
        .map(|(mime, _)| mime.to_owned())
        .unwrap_or_else(|| {
            if subtype.contains('/') {
                subtype.clone()
            } else if kind == "3d" {
                match subtype.as_str() {
                    "U3D" => "model/u3d".into(),
                    "PRC" => "model/prc".into(),
                    _ => "application/octet-stream".into(),
                }
            } else {
                "application/octet-stream".into()
            }
        });
    let safe_to_open = safe_media_name(&name);
    let sha256 = hex::encode(Sha256::digest(&data));
    output.push(InteractiveAssetInfo {
        object_id: id_string(id),
        page_index,
        kind: kind.into(),
        subtype,
        name,
        mime,
        size: data.len(),
        sha256,
        safe_to_open,
    });
}

fn walk_interactive_object(
    document: &Document,
    object: &Object,
    page_index: usize,
    kind: &str,
    output: &mut Vec<InteractiveAssetInfo>,
    seen_assets: &mut HashSet<ObjectId>,
    visited: &mut HashSet<ObjectId>,
    inherited_name: Option<String>,
    depth: usize,
) {
    if depth > 64 {
        return;
    }

    match object {
        Object::Reference(id) => {
            if !visited.insert(*id) {
                return;
            }
            let Ok(value) = document.get_object(*id) else { return };
            if let Ok(stream) = value.as_stream() {
                push_asset(output, seen_assets, *id, stream, page_index, kind, inherited_name);
                return;
            }
            walk_interactive_object(
                document,
                value,
                page_index,
                kind,
                output,
                seen_assets,
                visited,
                inherited_name,
                depth + 1,
            );
        }
        Object::Dictionary(dictionary) => {
            let name = file_name(dictionary).or(inherited_name);
            if let Ok(Object::Dictionary(ef)) = dictionary.get(b"EF") {
                for (_, value) in ef.iter() {
                    if let Ok(id) = value.as_reference() {
                        if let Ok(stream) = document.get_object(id).and_then(Object::as_stream) {
                            push_asset(output, seen_assets, id, stream, page_index, kind, name.clone());
                        }
                    }
                }
            }
            for (key, value) in dictionary.iter() {
                if key.as_slice() == b"AP" {
                    continue;
                }
                walk_interactive_object(
                    document,
                    value,
                    page_index,
                    kind,
                    output,
                    seen_assets,
                    visited,
                    name.clone(),
                    depth + 1,
                );
            }
        }
        Object::Array(values) => {
            for value in values {
                walk_interactive_object(
                    document,
                    value,
                    page_index,
                    kind,
                    output,
                    seen_assets,
                    visited,
                    inherited_name.clone(),
                    depth + 1,
                );
            }
        }
        Object::Stream(_) => {}
        _ => {}
    }
}

pub fn list_interactive_assets(path: &Path) -> Result<Vec<InteractiveAssetInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut output = Vec::new();
    let mut seen_assets = HashSet::new();

    for (page_number, page_id) in document.get_pages() {
        let page_index = page_number.saturating_sub(1) as usize;
        let annots = document
            .get_object(page_id)
            .ok()
            .and_then(|object| object.as_dict().ok())
            .and_then(|dictionary| dictionary.get(b"Annots").ok())
            .and_then(|value| value.as_array().ok())
            .cloned()
            .unwrap_or_default();

        for annotation in annots {
            let annotation_id = annotation.as_reference().ok();
            let Some(dictionary) = dictionary_from_object(&document, &annotation) else { continue };
            let subtype = dictionary
                .get(b"Subtype")
                .ok()
                .and_then(|value| value.as_name().ok())
                .unwrap_or_default();

            let (kind, root) = if subtype == b"RichMedia" {
                ("rich-media", dictionary.get(b"RichMediaContent").ok())
            } else if subtype == b"3D" {
                ("3d", dictionary.get(b"3DD").ok())
            } else if subtype == b"Sound" {
                ("rich-media", dictionary.get(b"Sound").ok())
            } else if subtype == b"Movie" {
                ("rich-media", dictionary.get(b"Movie").ok())
            } else if subtype == b"Screen" {
                ("rich-media", dictionary.get(b"A").ok())
            } else {
                continue;
            };

            if let Some(root) = root {
                let mut visited = HashSet::new();
                if let Some(id) = annotation_id {
                    visited.insert(id);
                }
                walk_interactive_object(
                    &document,
                    root,
                    page_index,
                    kind,
                    &mut output,
                    &mut seen_assets,
                    &mut visited,
                    None,
                    0,
                );
            }
        }
    }

    output.sort_by(|left, right| {
        left.page_index
            .cmp(&right.page_index)
            .then_with(|| left.kind.cmp(&right.kind))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(output)
}

pub fn extract_interactive_asset(
    input: &Path,
    object_id: &str,
    destination: &Path,
) -> Result<usize, SevenError> {
    let id = parse_id(object_id)?;
    let document = Document::load(input).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let stream = document
        .get_object(id)
        .map_err(|_| SevenError::OperationRejected("Stream interativo não encontrado".into()))?
        .as_stream()
        .map_err(|_| SevenError::OperationRejected("Objeto selecionado não é um stream".into()))?;
    let data = stream_payload(stream);
    if data.len() > 1024 * 1024 * 1024 {
        return Err(SevenError::OperationRejected(
            "Asset interativo excede o limite de 1 GiB para extração".into(),
        ));
    }
    fs::write(destination, &data).map_err(|error| SevenError::Io(error.to_string()))?;
    Ok(data.len())
}

fn array_pairs(object: &Object) -> Vec<[f64; 2]> {
    let Ok(values) = object.as_array() else { return Vec::new() };
    values
        .chunks(2)
        .filter_map(|pair| {
            if pair.len() != 2 { return None; }
            Some([number(&pair[0])?, number(&pair[1])?])
        })
        .collect()
}

fn bbox_from_dictionary(dictionary: &Dictionary) -> Option<[f64; 4]> {
    let values = dictionary.get(b"BBox").ok()?.as_array().ok()?;
    if values.len() < 4 { return None; }
    Some([
        number(&values[0])?,
        number(&values[1])?,
        number(&values[2])?,
        number(&values[3])?,
    ])
}

fn coordinate_system(document: &Document, measure: &Dictionary) -> (String, Option<i64>, Option<String>) {
    let gcs = measure
        .get(b"GCS")
        .ok()
        .and_then(|value| dictionary_from_object(document, value));
    let Some(gcs) = gcs else {
        return ("geographic".into(), None, None);
    };
    let kind = gcs
        .get(b"Type")
        .ok()
        .and_then(|value| value.as_name().ok())
        .map(|name| if name == b"PROJCS" { "projected" } else { "geographic" })
        .unwrap_or("geographic")
        .to_owned();
    let epsg = gcs.get(b"EPSG").ok().and_then(|value| value.as_i64().ok());
    let wkt = gcs
        .get(b"WKT")
        .ok()
        .map(object_text)
        .filter(|value| !value.trim().is_empty());
    (kind, epsg, wkt)
}

fn viewport_from_object(
    document: &Document,
    object: &Object,
    page_index: usize,
) -> Option<GeospatialViewportInfo> {
    let object_id = object.as_reference().ok().map(id_string);
    let viewport = dictionary_from_object(document, object)?;
    let bbox = bbox_from_dictionary(viewport)?;
    let measure = viewport
        .get(b"Measure")
        .ok()
        .and_then(|value| dictionary_from_object(document, value))?;
    let subtype = measure
        .get(b"Subtype")
        .ok()
        .and_then(|value| value.as_name().ok())
        .unwrap_or_default();
    if subtype != b"GEO" {
        return None;
    }
    let gpts = measure.get(b"GPTS").ok().map(array_pairs).unwrap_or_default();
    let lpts = measure.get(b"LPTS").ok().map(array_pairs).unwrap_or_default();
    if gpts.len() < 3 || gpts.len() != lpts.len() {
        return None;
    }
    let (coordinate_kind, epsg, wkt) = coordinate_system(document, measure);
    Some(GeospatialViewportInfo {
        object_id,
        page_index,
        bbox,
        gpts,
        lpts,
        coordinate_kind,
        epsg,
        wkt,
    })
}

pub fn list_geospatial_viewports(path: &Path) -> Result<Vec<GeospatialViewportInfo>, SevenError> {
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let mut output = Vec::new();
    for (page_number, page_id) in document.get_pages() {
        let page_index = page_number.saturating_sub(1) as usize;
        let Some(page) = document.get_object(page_id).ok().and_then(|object| object.as_dict().ok()) else { continue };
        let Ok(vp) = page.get(b"VP") else { continue };
        match vp {
            Object::Array(values) => {
                for value in values {
                    if let Some(info) = viewport_from_object(&document, value, page_index) {
                        output.push(info);
                    }
                }
            }
            value => {
                if let Some(info) = viewport_from_object(&document, value, page_index) {
                    output.push(info);
                }
            }
        }
    }
    Ok(output)
}

fn inherited_box(document: &Document, mut id: ObjectId, key: &[u8]) -> Option<[f64; 4]> {
    for _ in 0..32 {
        let dictionary = document.get_object(id).ok()?.as_dict().ok()?;
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
        id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn affine_from_three(
    local: [[f64; 2]; 3],
    geo: [[f64; 2]; 3],
    point: [f64; 2],
) -> Option<[f64; 2]> {
    let [p0, p1, p2] = local;
    let determinant =
        (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if determinant.abs() < 1e-12 {
        return None;
    }
    let dx = point[0] - p0[0];
    let dy = point[1] - p0[1];
    let a = (dx * (p2[1] - p0[1]) - (p2[0] - p0[0]) * dy) / determinant;
    let b = ((p1[0] - p0[0]) * dy - dx * (p1[1] - p0[1])) / determinant;
    Some([
        geo[0][0] + a * (geo[1][0] - geo[0][0]) + b * (geo[2][0] - geo[0][0]),
        geo[0][1] + a * (geo[1][1] - geo[0][1]) + b * (geo[2][1] - geo[0][1]),
    ])
}

fn transform_local_to_geo(
    viewport: &GeospatialViewportInfo,
    point: [f64; 2],
) -> Option<[f64; 2]> {
    for first in 0..viewport.lpts.len() {
        for second in (first + 1)..viewport.lpts.len() {
            for third in (second + 1)..viewport.lpts.len() {
                let local = [viewport.lpts[first], viewport.lpts[second], viewport.lpts[third]];
                let geo = [viewport.gpts[first], viewport.gpts[second], viewport.gpts[third]];
                if let Some(result) = affine_from_three(local, geo, point) {
                    return Some(result);
                }
            }
        }
    }
    None
}

fn transform_geo_to_local(
    viewport: &GeospatialViewportInfo,
    point: [f64; 2],
) -> Option<[f64; 2]> {
    for first in 0..viewport.gpts.len() {
        for second in (first + 1)..viewport.gpts.len() {
            for third in (second + 1)..viewport.gpts.len() {
                let geo = [viewport.gpts[first], viewport.gpts[second], viewport.gpts[third]];
                let local = [viewport.lpts[first], viewport.lpts[second], viewport.lpts[third]];
                if let Some(result) = affine_from_three(geo, local, point) {
                    return Some(result);
                }
            }
        }
    }
    None
}

fn haversine_meters(a: [f64; 2], b: [f64; 2]) -> f64 {
    const EARTH_RADIUS_M: f64 = 6_371_008.8;
    let lat1 = a[0].to_radians();
    let lon1 = a[1].to_radians();
    let lat2 = b[0].to_radians();
    let lon2 = b[1].to_radians();
    let dlat = lat2 - lat1;
    let dlon = lon2 - lon1;
    let h = (dlat / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * h.sqrt().asin()
}

fn spherical_polygon_area_m2(points: &[[f64; 2]]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    const EARTH_RADIUS_M: f64 = 6_371_008.8;
    let mut sum = 0.0;
    for index in 0..points.len() {
        let current = points[index];
        let next = points[(index + 1) % points.len()];
        let lat1 = current[0].to_radians();
        let lat2 = next[0].to_radians();
        let lon1 = current[1].to_radians();
        let lon2 = next[1].to_radians();
        let mut delta_lon = lon2 - lon1;
        while delta_lon > std::f64::consts::PI {
            delta_lon -= std::f64::consts::TAU;
        }
        while delta_lon < -std::f64::consts::PI {
            delta_lon += std::f64::consts::TAU;
        }
        sum += delta_lon * (2.0 + lat1.sin() + lat2.sin());
    }
    (sum * EARTH_RADIUS_M * EARTH_RADIUS_M / 2.0).abs()
}

pub fn resolve_geospatial_coordinate(
    path: &Path,
    page_index: usize,
    normalized_x: f64,
    normalized_y: f64,
) -> Result<GeospatialCoordinate, SevenError> {
    if !(0.0..=1.0).contains(&normalized_x) || !(0.0..=1.0).contains(&normalized_y) {
        return Err(SevenError::OperationRejected("Coordenada normalizada inválida".into()));
    }
    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    let page_box = inherited_box(&document, page_id, b"CropBox")
        .or_else(|| inherited_box(&document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let page_x = page_box[0] + normalized_x * (page_box[2] - page_box[0]);
    let page_y = page_box[1] + (1.0 - normalized_y) * (page_box[3] - page_box[1]);

    let viewports = list_geospatial_viewports(path)?;
    for viewport in viewports.into_iter().filter(|viewport| viewport.page_index == page_index) {
        let [x1, y1, x2, y2] = viewport.bbox;
        let min_x = x1.min(x2);
        let max_x = x1.max(x2);
        let min_y = y1.min(y2);
        let max_y = y1.max(y2);
        if page_x < min_x || page_x > max_x || page_y < min_y || page_y > max_y {
            continue;
        }
        let width = (x2 - x1).abs().max(1e-9);
        let height = (y2 - y1).abs().max(1e-9);
        let local = [(page_x - min_x) / width, (page_y - min_y) / height];
        let geo = transform_local_to_geo(&viewport, local)
            .ok_or_else(|| SevenError::OperationRejected("Não foi possível resolver a transformação geoespacial".into()))?;
        return Ok(GeospatialCoordinate {
            page_index,
            viewport_object_id: viewport.object_id,
            local_x: local[0],
            local_y: local[1],
            first: geo[0],
            second: geo[1],
            coordinate_kind: viewport.coordinate_kind,
            epsg: viewport.epsg,
            wkt: viewport.wkt,
        });
    }

    Err(SevenError::OperationRejected(
        "O ponto selecionado não pertence a um viewport geoespacial compatível".into(),
    ))
}

pub fn materialize_interactive_media(
    input: &Path,
    object_id: &str,
    display_name: &str,
    cache_dir: &Path,
) -> Result<PathBuf, SevenError> {
    if !safe_media_name(display_name) {
        return Err(SevenError::OperationRejected(
            "Somente formatos de áudio/vídeo permitidos podem ser abertos externamente".into(),
        ));
    }
    let clean_name = Path::new(display_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("media.bin");
    fs::create_dir_all(cache_dir).map_err(|error| SevenError::Io(error.to_string()))?;
    let destination = cache_dir.join(format!("{}-{}", uuid::Uuid::new_v4(), clean_name));
    extract_interactive_asset(input, object_id, &destination)?;
    Ok(destination)
}


pub fn locate_geospatial_coordinate(
    path: &Path,
    page_index: usize,
    first: f64,
    second: f64,
) -> Result<GeospatialLocation, SevenError> {
    if !first.is_finite() || !second.is_finite() {
        return Err(SevenError::OperationRejected("Coordenada geoespacial inválida".into()));
    }

    let document = Document::load(path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let page_id = document
        .get_pages()
        .get(&((page_index + 1) as u32))
        .copied()
        .ok_or_else(|| SevenError::OperationRejected("Página não existe".into()))?;
    let page_box = inherited_box(&document, page_id, b"CropBox")
        .or_else(|| inherited_box(&document, page_id, b"MediaBox"))
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let page_width = (page_box[2] - page_box[0]).abs().max(1e-9);
    let page_height = (page_box[3] - page_box[1]).abs().max(1e-9);

    for viewport in list_geospatial_viewports(path)?
        .into_iter()
        .filter(|viewport| viewport.page_index == page_index)
    {
        let Some(local) = transform_geo_to_local(&viewport, [first, second]) else { continue };
        if local[0] < -1e-6 || local[0] > 1.0 + 1e-6 || local[1] < -1e-6 || local[1] > 1.0 + 1e-6 {
            continue;
        }

        let [x1, y1, x2, y2] = viewport.bbox;
        let min_x = x1.min(x2);
        let max_x = x1.max(x2);
        let min_y = y1.min(y2);
        let max_y = y1.max(y2);
        let page_x = min_x + local[0] * (max_x - min_x);
        let page_y = min_y + local[1] * (max_y - min_y);
        let normalized_x = (page_x - page_box[0]) / page_width;
        let normalized_y = 1.0 - ((page_y - page_box[1]) / page_height);

        if !(0.0..=1.0).contains(&normalized_x) || !(0.0..=1.0).contains(&normalized_y) {
            continue;
        }

        return Ok(GeospatialLocation {
            page_index,
            normalized_x,
            normalized_y,
            viewport_object_id: viewport.object_id,
            first,
            second,
            coordinate_kind: viewport.coordinate_kind,
            epsg: viewport.epsg,
            wkt: viewport.wkt,
        });
    }

    Err(SevenError::OperationRejected(
        "A coordenada não pertence a um viewport geoespacial compatível desta página".into(),
    ))
}

pub fn measure_geospatial(
    path: &Path,
    page_index: usize,
    kind: &str,
    normalized_points: Vec<[f64; 2]>,
) -> Result<GeospatialMeasurementResult, SevenError> {
    let minimum = if kind == "distance" { 2 } else { 3 };
    if !matches!(kind, "distance" | "perimeter" | "area") {
        return Err(SevenError::OperationRejected("Tipo de medição geoespacial inválido".into()));
    }
    if normalized_points.len() < minimum || normalized_points.len() > 10_000 {
        return Err(SevenError::OperationRejected(format!(
            "A medição exige entre {minimum} e 10.000 pontos"
        )));
    }

    let mut coordinates = Vec::with_capacity(normalized_points.len());
    let mut coordinate_kind = String::new();
    let mut epsg = None;
    for point in normalized_points {
        let resolved = resolve_geospatial_coordinate(path, page_index, point[0], point[1])?;
        if coordinate_kind.is_empty() {
            coordinate_kind = resolved.coordinate_kind.clone();
            epsg = resolved.epsg;
        } else if coordinate_kind != resolved.coordinate_kind || epsg != resolved.epsg {
            return Err(SevenError::OperationRejected(
                "Os pontos atravessam sistemas de coordenadas diferentes".into(),
            ));
        }
        coordinates.push([resolved.first, resolved.second]);
    }

    let (value, unit) = if coordinate_kind == "geographic" {
        match kind {
            "distance" => (haversine_meters(coordinates[0], coordinates[1]), "m".to_owned()),
            "perimeter" => {
                let mut perimeter = 0.0;
                for index in 0..coordinates.len() {
                    perimeter += haversine_meters(
                        coordinates[index],
                        coordinates[(index + 1) % coordinates.len()],
                    );
                }
                (perimeter, "m".to_owned())
            }
            "area" => (spherical_polygon_area_m2(&coordinates), "m²".to_owned()),
            _ => unreachable!(),
        }
    } else {
        let distance = |a: [f64; 2], b: [f64; 2]| {
            ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2)).sqrt()
        };
        match kind {
            "distance" => (distance(coordinates[0], coordinates[1]), "map-unit".to_owned()),
            "perimeter" => {
                let mut perimeter = 0.0;
                for index in 0..coordinates.len() {
                    perimeter += distance(coordinates[index], coordinates[(index + 1) % coordinates.len()]);
                }
                (perimeter, "map-unit".to_owned())
            }
            "area" => {
                let mut twice_area = 0.0;
                for index in 0..coordinates.len() {
                    let current = coordinates[index];
                    let next = coordinates[(index + 1) % coordinates.len()];
                    twice_area += current[0] * next[1] - next[0] * current[1];
                }
                (twice_area.abs() / 2.0, "map-unit²".to_owned())
            }
            _ => unreachable!(),
        }
    };

    Ok(GeospatialMeasurementResult {
        kind: kind.into(),
        value,
        unit,
        coordinate_kind,
        epsg,
        points: coordinates,
    })
}
