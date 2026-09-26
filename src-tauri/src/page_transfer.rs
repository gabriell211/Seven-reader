use crate::{
    error::SevenError,
    jobs,
    pdf,
    session,
    state::AppState,
};
use serde::Serialize;
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageTransferResult {
    pub target: pdf::DocumentSummary,
    pub source: Option<pdf::DocumentSummary>,
    pub moved: bool,
}

fn run_qpdf(program: &std::path::Path, args: &[String]) -> Result<(), SevenError> {
    let status = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| SevenError::Operation(error.to_string()))?;
    if !status.success() {
        return Err(SevenError::Operation(format!(
            "qpdf encerrou com código {:?}",
            status.code()
        )));
    }
    Ok(())
}

fn validate_simple_range(range: &str) -> Result<String, SevenError> {
    let range = range.trim();
    if range.is_empty() || range.len() > 512 {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }
    if !range.chars().all(|ch| ch.is_ascii_digit() || matches!(ch, ',' | '-' | 'z'))
        || range.starts_with('-')
        || range.ends_with('-')
        || range.contains("--")
    {
        return Err(SevenError::OperationRejected(
            "Use um intervalo simples, por exemplo 1-5,8 ou 3-z".into(),
        ));
    }
    Ok(range.to_owned())
}

fn selected_pages(range: &str, page_count: usize) -> Result<Vec<usize>, SevenError> {
    let endpoint = |value: &str| -> Result<usize, SevenError> {
        if value == "z" {
            return Ok(page_count);
        }
        let page = value.parse::<usize>().map_err(|_| {
            SevenError::OperationRejected("Intervalo de páginas inválido".into())
        })?;
        if page == 0 || page > page_count {
            return Err(SevenError::OperationRejected(format!(
                "Página {page} fora do documento de {page_count} páginas"
            )));
        }
        Ok(page)
    };

    let mut pages = Vec::new();
    for part in range.split(',').map(str::trim).filter(|part| !part.is_empty()) {
        if let Some((start, end)) = part.split_once('-') {
            let start = endpoint(start)?;
            let end = endpoint(end)?;
            if start <= end {
                pages.extend(start..=end);
            } else {
                pages.extend((end..=start).rev());
            }
        } else {
            pages.push(endpoint(part)?);
        }
    }
    pages.sort_unstable();
    pages.dedup();
    if pages.is_empty() {
        return Err(SevenError::OperationRejected("Nenhuma página selecionada".into()));
    }
    Ok(pages)
}

pub fn transfer_pages(
    state: &AppState,
    source_document_id: &str,
    target_document_id: &str,
    page_range: &str,
    insert_after: usize,
    move_pages: bool,
) -> Result<PageTransferResult, SevenError> {
    if source_document_id == target_document_id {
        return Err(SevenError::OperationRejected(
            "Origem e destino devem ser documentos diferentes".into(),
        ));
    }

    let range = validate_simple_range(page_range)?;
    let qpdf = jobs::require_executable(&["qpdf"], "qpdf")?;
    let source = state
        .documents
        .lock()
        .get(source_document_id)
        .cloned()
        .ok_or(SevenError::DocumentNotOpen)?;
    let target = state
        .documents
        .lock()
        .get(target_document_id)
        .cloned()
        .ok_or(SevenError::DocumentNotOpen)?;

    if source.encrypted || target.encrypted {
        return Err(SevenError::OperationRejected(
            "Descriptografe os dois PDFs antes de transferir páginas entre documentos".into(),
        ));
    }
    if source.has_signatures || target.has_signatures {
        return Err(SevenError::OperationRejected(
            "A transferência entre documentos assinados foi bloqueada para não invalidar assinaturas digitais.".into(),
        ));
    }
    if insert_after > target.page_count {
        return Err(SevenError::OperationRejected(format!(
            "A posição de inserção deve ficar entre 0 e {}",
            target.page_count
        )));
    }

    let selected = selected_pages(&range, source.page_count)?;
    if move_pages && selected.len() >= source.page_count {
        return Err(SevenError::OperationRejected(
            "Não é possível mover todas as páginas e deixar o documento de origem vazio".into(),
        ));
    }

    let target_prepared = session::prepare_revision(state, target_document_id, "receive-pages")?;
    let mut target_args = vec![
        target_prepared.document.active_path().to_string_lossy().into_owned(),
        "--pages".into(),
    ];
    if insert_after > 0 {
        target_args.push(".".into());
        target_args.push(format!("1-{insert_after}"));
    }
    target_args.push(source.active_path().to_string_lossy().into_owned());
    target_args.push(range.clone());
    if insert_after < target.page_count {
        target_args.push(".".into());
        target_args.push(format!("{}-z", insert_after + 1));
    }
    target_args.push("--".into());
    target_args.push(target_prepared.output.to_string_lossy().into_owned());
    run_qpdf(&qpdf, &target_args)?;
    pdf::validate_pdf_path(target_prepared.output.to_string_lossy().as_ref())?;

    if !move_pages {
        let summary = session::commit_revision(
            state,
            target_document_id,
            target_prepared.expected_revision,
            target_prepared.output,
        )?;
        return Ok(PageTransferResult {
            target: summary,
            source: None,
            moved: false,
        });
    }

    let source_prepared = session::prepare_revision(state, source_document_id, "move-pages")?;
    let exclusions = range
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| format!("x{part}"))
        .collect::<Vec<_>>();
    let source_selection = format!("1-z,{}", exclusions.join(","));
    let source_args = vec![
        source_prepared.document.active_path().to_string_lossy().into_owned(),
        "--pages".into(),
        ".".into(),
        source_selection,
        "--".into(),
        source_prepared.output.to_string_lossy().into_owned(),
    ];
    if let Err(error) = run_qpdf(&qpdf, &source_args) {
        let _ = std::fs::remove_file(&target_prepared.output);
        return Err(error);
    }
    pdf::validate_pdf_path(source_prepared.output.to_string_lossy().as_ref())?;

    let (target_summary, source_summary) = session::commit_revision_pair(
        state,
        target_document_id,
        target_prepared.expected_revision,
        target_prepared.output,
        source_document_id,
        source_prepared.expected_revision,
        source_prepared.output,
    )?;

    Ok(PageTransferResult {
        target: target_summary,
        source: Some(source_summary),
        moved: true,
    })
}
