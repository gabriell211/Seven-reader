use crate::{
    capabilities::bind_pdfium,
    error::SevenError,
    pdf,
    state::AppState,
};
use image::{DynamicImage, GenericImageView};
use lopdf::{content::Content, Document, Object};
use pdfium_render::prelude::{PdfPageIndex, PdfRenderConfig};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs, path::{Path, PathBuf}};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareOptions {
    pub page_start: Option<usize>,
    pub page_end: Option<usize>,
    pub text_only: bool,
    pub document_type: String,
}

impl Default for CompareOptions {
    fn default() -> Self {
        Self {
            page_start: None,
            page_end: None,
            text_only: false,
            document_type: "auto".into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparePage {
    pub page_index: usize,
    pub left_excerpt: String,
    pub right_excerpt: String,
    pub categories: Vec<String>,
    pub status: String,
    pub text_added: usize,
    pub text_removed: usize,
    pub visual_difference_percent: f64,
    pub graphics_delta: i64,
    pub annotations_delta: i64,
    pub moved_from: Option<usize>,
    pub left_preview: Option<String>,
    pub right_preview: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareReport {
    pub left_pages: usize,
    pub right_pages: usize,
    pub changed_pages: usize,
    pub total_differences: usize,
    pub document_type: String,
    pub text_only: bool,
    pub category_counts: HashMap<String, usize>,
    pub pages: Vec<ComparePage>,
}

fn normalized(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn excerpt(text: &str) -> String {
    text.chars().take(360).collect()
}

fn word_delta(left: &str, right: &str) -> (usize, usize) {
    let mut counts: HashMap<String, i64> = HashMap::new();
    for word in left.split_whitespace() {
        *counts.entry(word.to_owned()).or_default() += 1;
    }
    for word in right.split_whitespace() {
        *counts.entry(word.to_owned()).or_default() -= 1;
    }
    let removed = counts.values().filter(|value| **value > 0).map(|value| *value as usize).sum();
    let added = counts.values().filter(|value| **value < 0).map(|value| value.unsigned_abs() as usize).sum();
    (added, removed)
}

fn page_fingerprint(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalized(text).to_lowercase().as_bytes());
    hex::encode(hasher.finalize())
}

fn page_operator_counts(document: &Document, page_index: usize) -> (usize, usize) {
    let Some(page_id) = document.get_pages().get(&((page_index + 1) as u32)).copied() else {
        return (0, 0);
    };
    let data = document.get_page_content(page_id);
    let Ok(content) = Content::decode(&data) else { return (0, 0) };
    let graphics = content.operations.iter().filter(|operation| {
        matches!(
            operation.operator.as_str(),
            "Do" | "m" | "l" | "c" | "v" | "y" | "re" | "S" | "s" | "f" | "F" | "f*" | "B" | "B*" | "b" | "b*"
        )
    }).count();
    let annotations = document
        .get_object(page_id)
        .ok()
        .and_then(|object| object.as_dict().ok())
        .and_then(|dictionary| dictionary.get(b"Annots").ok())
        .and_then(|value| value.as_array().ok())
        .map(Vec::len)
        .unwrap_or(0);
    (graphics, annotations)
}

fn render_page_image(
    page: &pdfium_render::prelude::PdfPage<'_>,
    target_width: i32,
) -> Result<DynamicImage, SevenError> {
    let bitmap = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(target_width)
                .set_maximum_height(10000)
                .render_form_data(true),
        )
        .map_err(|error| SevenError::Render(error.to_string()))?;
    bitmap.as_image().map_err(|error| SevenError::Render(error.to_string()))
}

fn visual_difference(left: &DynamicImage, right: &DynamicImage) -> f64 {
    let left = left.to_rgba8();
    let right = right.to_rgba8();
    let width = left.width().max(right.width());
    let height = left.height().max(right.height());
    if width == 0 || height == 0 {
        return 0.0;
    }

    let mut different = 0u64;
    let total = u64::from(width) * u64::from(height);
    for y in 0..height {
        for x in 0..width {
            if x >= left.width() || y >= left.height() || x >= right.width() || y >= right.height() {
                different += 1;
                continue;
            }
            let a = left.get_pixel(x, y).0;
            let b = right.get_pixel(x, y).0;
            let delta = (i16::from(a[0]) - i16::from(b[0])).unsigned_abs()
                + (i16::from(a[1]) - i16::from(b[1])).unsigned_abs()
                + (i16::from(a[2]) - i16::from(b[2])).unsigned_abs();
            if delta > 54 {
                different += 1;
            }
        }
    }
    (different as f64 / total as f64) * 100.0
}

fn save_preview(
    cache_dir: &Path,
    side: &str,
    page_index: usize,
    image: &DynamicImage,
    key: &str,
) -> Result<String, SevenError> {
    let directory = cache_dir.join("compare").join(key);
    fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
    let path = directory.join(format!("{side}-{}.png", page_index + 1));
    image.save(&path).map_err(|error| SevenError::Render(error.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}

fn resolved_type(requested: &str, has_text: bool, visual_diff: f64) -> String {
    if requested != "auto" {
        return requested.to_owned();
    }
    if !has_text {
        "scan".into()
    } else if visual_diff > 25.0 {
        "layout".into()
    } else {
        "report".into()
    }
}

pub fn compare(
    state: &AppState,
    left_path: &Path,
    right_path: &Path,
    options: CompareOptions,
) -> Result<CompareReport, SevenError> {
    if !matches!(
        options.document_type.as_str(),
        "auto" | "report" | "spreadsheet" | "magazine" | "presentation" | "scan" | "drawing" | "illustration"
    ) {
        return Err(SevenError::OperationRejected("Tipo de documento de comparação inválido".into()));
    }

    let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
    let left_pdf = pdfium
        .load_pdf_from_file(left_path, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let right_pdf = pdfium
        .load_pdf_from_file(right_path, None)
        .map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let left_struct = Document::load(left_path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    let right_struct = Document::load(right_path).map_err(|error| SevenError::PdfOpen(error.to_string()))?;

    let left_pages = left_pdf.pages().len() as usize;
    let right_pages = right_pdf.pages().len() as usize;
    let max_pages = left_pages.max(right_pages);
    let start = options.page_start.unwrap_or(1).max(1).saturating_sub(1);
    let end_exclusive = options.page_end.unwrap_or(max_pages).min(max_pages);
    if start >= end_exclusive && max_pages > 0 {
        return Err(SevenError::OperationRejected("Intervalo de comparação vazio".into()));
    }

    let mut right_fingerprints: HashMap<String, Vec<usize>> = HashMap::new();
    for index in 0..right_pages {
        let page = right_pdf.pages().get(index as PdfPageIndex)
            .map_err(|error| SevenError::Operation(error.to_string()))?;
        let text = page.text().map_err(|error| SevenError::Operation(error.to_string()))?.all();
        right_fingerprints.entry(page_fingerprint(&text)).or_default().push(index);
    }

    let mut cache_hasher = Sha256::new();
    cache_hasher.update(left_path.to_string_lossy().as_bytes());
    cache_hasher.update(right_path.to_string_lossy().as_bytes());
    cache_hasher.update(serde_json::to_vec(&options).map_err(|error| SevenError::Operation(error.to_string()))?);
    let cache_key = hex::encode(cache_hasher.finalize());

    let mut pages = Vec::new();
    let mut category_counts = HashMap::new();
    let mut effective_type = options.document_type.clone();

    for index in start..end_exclusive {
        let left_text = if index < left_pages {
            let page = left_pdf.pages().get(index as PdfPageIndex)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            page.text().map_err(|error| SevenError::Operation(error.to_string()))?.all()
        } else { String::new() };
        let right_text = if index < right_pages {
            let page = right_pdf.pages().get(index as PdfPageIndex)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            page.text().map_err(|error| SevenError::Operation(error.to_string()))?.all()
        } else { String::new() };

        let normalized_left = normalized(&left_text);
        let normalized_right = normalized(&right_text);
        let (text_added, text_removed) = word_delta(&normalized_left, &normalized_right);
        let text_changed = normalized_left != normalized_right;

        let (left_graphics, left_annotations) = page_operator_counts(&left_struct, index);
        let (right_graphics, right_annotations) = page_operator_counts(&right_struct, index);
        let graphics_delta = right_graphics as i64 - left_graphics as i64;
        let annotations_delta = right_annotations as i64 - left_annotations as i64;

        let mut visual_difference_percent = 0.0;
        let mut left_preview = None;
        let mut right_preview = None;
        if !options.text_only && index < left_pages && index < right_pages {
            let left_page = left_pdf.pages().get(index as PdfPageIndex)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let right_page = right_pdf.pages().get(index as PdfPageIndex)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let left_image = render_page_image(&left_page, 760)?;
            let right_image = render_page_image(&right_page, 760)?;
            visual_difference_percent = visual_difference(&left_image, &right_image);
            if visual_difference_percent > 0.02 || text_changed || graphics_delta != 0 || annotations_delta != 0 {
                left_preview = Some(save_preview(&state.cache_dir, "left", index, &left_image, &cache_key)?);
                right_preview = Some(save_preview(&state.cache_dir, "right", index, &right_image, &cache_key)?);
            }
            if effective_type == "auto" {
                effective_type = resolved_type("auto", !normalized_left.is_empty() || !normalized_right.is_empty(), visual_difference_percent);
            }
        }

        let moved_from = if !normalized_left.is_empty() {
            right_fingerprints
                .get(&page_fingerprint(&left_text))
                .and_then(|indices| indices.iter().copied().find(|right_index| *right_index != index))
        } else { None };

        let mut categories = Vec::new();
        if text_changed {
            categories.push("text".to_owned());
        }
        if moved_from.is_some() {
            categories.push("page-moved".to_owned());
        }
        if graphics_delta != 0 {
            categories.push("graphics".to_owned());
        }
        if annotations_delta != 0 {
            categories.push("annotations".to_owned());
        }
        if !options.text_only && visual_difference_percent > 0.15 {
            categories.push(if text_changed { "layout".into() } else { "formatting".into() });
        }
        if index >= left_pages {
            categories.push("page-added".into());
        }
        if index >= right_pages {
            categories.push("page-removed".into());
        }
        let mut unique = HashSet::new();
        categories.retain(|category| unique.insert(category.clone()));

        if categories.is_empty() {
            continue;
        }
        for category in &categories {
            *category_counts.entry(category.clone()).or_insert(0) += 1;
        }

        let status = if index >= left_pages {
            "added"
        } else if index >= right_pages {
            "removed"
        } else if moved_from.is_some() && categories.len() == 1 {
            "moved"
        } else {
            "changed"
        }.to_owned();

        pages.push(ComparePage {
            page_index: index,
            left_excerpt: excerpt(&normalized_left),
            right_excerpt: excerpt(&normalized_right),
            categories,
            status,
            text_added,
            text_removed,
            visual_difference_percent,
            graphics_delta,
            annotations_delta,
            moved_from,
            left_preview,
            right_preview,
        });
    }

    let total_differences = pages.iter().map(|page| page.categories.len()).sum();
    Ok(CompareReport {
        left_pages,
        right_pages,
        changed_pages: pages.len(),
        total_differences,
        document_type: if effective_type == "auto" { "report".into() } else { effective_type },
        text_only: options.text_only,
        category_counts,
        pages,
    })
}

pub fn export_report_pdf(
    destination: &Path,
    left_name: &str,
    right_name: &str,
    report: &CompareReport,
) -> Result<(), SevenError> {
    let mut lines = Vec::new();
    lines.push("SEVEN READER — RELATÓRIO DE COMPARAÇÃO".to_owned());
    lines.push(String::new());
    lines.push(format!("Arquivo A: {left_name}"));
    lines.push(format!("Arquivo B: {right_name}"));
    lines.push(format!("Tipo: {}", report.document_type));
    lines.push(format!("Páginas alteradas: {}", report.changed_pages));
    lines.push(format!("Diferenças categorizadas: {}", report.total_differences));
    lines.push(String::new());

    let mut categories = report.category_counts.iter().collect::<Vec<_>>();
    categories.sort_by(|left, right| left.0.cmp(right.0));
    for (category, count) in categories {
        lines.push(format!("{category}: {count}"));
    }
    lines.push(String::new());

    for page in &report.pages {
        lines.push(format!("Página {} — {}", page.page_index + 1, page.status));
        lines.push(format!("Categorias: {}", page.categories.join(", ")));
        lines.push(format!("Texto: +{} / -{}", page.text_added, page.text_removed));
        if !report.text_only {
            lines.push(format!("Diferença visual: {:.2}%", page.visual_difference_percent));
            lines.push(format!("Delta gráficos: {:+}", page.graphics_delta));
            lines.push(format!("Delta anotações: {:+}", page.annotations_delta));
        }
        if let Some(from) = page.moved_from {
            lines.push(format!("Conteúdo equivalente encontrado na página {} do arquivo B", from + 1));
        }
        if !page.left_excerpt.is_empty() {
            lines.push(format!("A: {}", page.left_excerpt));
        }
        if !page.right_excerpt.is_empty() {
            lines.push(format!("B: {}", page.right_excerpt));
        }
        lines.push(String::new());
    }

    pdf::create_pdf_from_text(destination, &lines.join("\n"), "a4", 10)
}
