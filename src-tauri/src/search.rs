use crate::{
    advanced,
    annotations,
    capabilities::bind_pdfium,
    document_ops,
    error::SevenError,
    forms,
    state::{AppState, OpenDocument},
};
use pdfium_render::prelude::PdfPageIndex;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchOptions {
    pub query: String,
    pub match_case: bool,
    pub whole_word: bool,
    pub regex: bool,
    pub page_start: Option<usize>,
    pub page_end: Option<usize>,
    pub include_text: bool,
    pub include_comments: bool,
    pub include_bookmarks: bool,
    pub include_forms: bool,
    pub include_metadata: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchHit {
    pub kind: String,
    pub page_index: Option<usize>,
    pub title: String,
    pub excerpt: String,
    pub occurrences: usize,
}

fn build_matcher(options: &AdvancedSearchOptions) -> Result<Regex, SevenError> {
    let query = options.query.trim();
    if query.is_empty() || query.chars().count() > 512 {
        return Err(SevenError::OperationRejected(
            "A busca deve conter entre 1 e 512 caracteres".into(),
        ));
    }

    let source = if options.regex {
        query.to_owned()
    } else {
        regex::escape(query)
    };
    let source = if options.whole_word {
        format!(r"\b(?:{source})\b")
    } else {
        source
    };

    RegexBuilder::new(&source)
        .case_insensitive(!options.match_case)
        .unicode(true)
        .size_limit(4 * 1024 * 1024)
        .build()
        .map_err(|error| SevenError::OperationRejected(format!("Regex inválida: {error}")))
}

fn push_if_match(
    hits: &mut Vec<AdvancedSearchHit>,
    matcher: &Regex,
    kind: &str,
    page_index: Option<usize>,
    title: String,
    text: String,
) {
    let occurrences = matcher.find_iter(&text).count();
    if occurrences == 0 {
        return;
    }
    let excerpt = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(320)
        .collect::<String>();
    hits.push(AdvancedSearchHit {
        kind: kind.into(),
        page_index,
        title,
        excerpt,
        occurrences,
    });
}

pub fn search(
    state: &AppState,
    document: &OpenDocument,
    options: AdvancedSearchOptions,
) -> Result<Vec<AdvancedSearchHit>, SevenError> {
    let matcher = build_matcher(&options)?;
    let mut hits = Vec::new();

    if options.include_text {
        let pdfium = bind_pdfium(&state.resource_dir).map_err(SevenError::PdfEngineUnavailable)?;
        let pdf = pdfium
            .load_pdf_from_file(&document.path, document.password.as_deref())
            .map_err(|error| SevenError::PdfOpen(error.to_string()))?;

        let total = pdf.pages().len() as usize;
        let start = options.page_start.unwrap_or(1).max(1).min(total.max(1));
        let end = options.page_end.unwrap_or(total).max(start).min(total);

        for page_number in start..=end {
            let page = pdf
                .pages()
                .get((page_number - 1) as PdfPageIndex)
                .map_err(|error| SevenError::Operation(error.to_string()))?;
            let text = page
                .text()
                .map_err(|error| SevenError::Operation(error.to_string()))?
                .all();
            push_if_match(
                &mut hits,
                &matcher,
                "text",
                Some(page_number - 1),
                format!("Página {page_number}"),
                text,
            );
        }
    }

    if options.include_comments {
        for annotation in annotations::list_annotations(&document.path)? {
            let combined = format!("{} {} {}", annotation.kind, annotation.author, annotation.text);
            push_if_match(
                &mut hits,
                &matcher,
                "comment",
                Some(annotation.page_index),
                format!("Comentário · {}", annotation.kind),
                combined,
            );
        }
    }

    if options.include_bookmarks {
        let report = advanced::inspect(&document.path)?;
        for bookmark in report.bookmarks {
            push_if_match(
                &mut hits,
                &matcher,
                "bookmark",
                bookmark.page_index,
                "Marcador".into(),
                bookmark.title,
            );
        }
    }

    if options.include_forms {
        for field in forms::list_fields(&document.path)? {
            let combined = format!("{} {} {}", field.name, field.field_type, field.value);
            push_if_match(
                &mut hits,
                &matcher,
                "form",
                None,
                format!("Campo · {}", field.name),
                combined,
            );
        }
    }

    if options.include_metadata {
        let metadata = document_ops::read_metadata(&document.path)?;
        for (label, value) in [
            ("Título", metadata.title),
            ("Autor", metadata.author),
            ("Assunto", metadata.subject),
            ("Palavras-chave", metadata.keywords),
            ("Criador", metadata.creator),
            ("Produtor", metadata.producer),
        ] {
            push_if_match(
                &mut hits,
                &matcher,
                "metadata",
                None,
                format!("Metadado · {label}"),
                value,
            );
        }
    }

    hits.sort_by(|left, right| {
        left.page_index
            .unwrap_or(usize::MAX)
            .cmp(&right.page_index.unwrap_or(usize::MAX))
            .then_with(|| left.kind.cmp(&right.kind))
    });
    Ok(hits)
}
