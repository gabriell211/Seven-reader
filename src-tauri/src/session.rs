use crate::{
    error::SevenError,
    pdf,
    state::{AppState, OpenDocument},
};
use std::{fs, path::{Path, PathBuf}};

pub struct PreparedRevision {
    pub document: OpenDocument,
    pub output: PathBuf,
    pub expected_revision: u64,
}

pub fn prepare_revision(
    state: &AppState,
    document_id: &str,
    label: &str,
) -> Result<PreparedRevision, SevenError> {
    if label.is_empty() || !label.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
        return Err(SevenError::OperationRejected("Rótulo de revisão inválido".into()));
    }

    let document = state
        .documents
        .lock()
        .get(document_id)
        .cloned()
        .ok_or(SevenError::DocumentNotOpen)?;

    if document.has_signatures {
        return Err(SevenError::OperationRejected(
            "Este documento contém assinaturas digitais. Edições de conteúdo foram bloqueadas para evitar invalidá-las.".into(),
        ));
    }

    let directory = state.cache_dir.join("editing").join(document_id);
    fs::create_dir_all(&directory).map_err(|error| SevenError::Io(error.to_string()))?;
    let output = directory.join(format!(
        "rev-{:08}-{}.pdf",
        document.revision.saturating_add(1),
        label
    ));

    Ok(PreparedRevision {
        expected_revision: document.revision,
        document,
        output,
    })
}

pub fn commit_revision(
    state: &AppState,
    document_id: &str,
    expected_revision: u64,
    output: PathBuf,
) -> Result<pdf::DocumentSummary, SevenError> {
    pdf::validate_pdf_path(output.to_string_lossy().as_ref())?;
    let metadata = fs::metadata(&output).map_err(|error| SevenError::Io(error.to_string()))?;

    let mut documents = state.documents.lock();
    let document = documents
        .get_mut(document_id)
        .ok_or(SevenError::DocumentNotOpen)?;

    if document.revision != expected_revision {
        let _ = fs::remove_file(&output);
        return Err(SevenError::OperationRejected(
            "O documento mudou durante a edição. A operação foi descartada para evitar conflito.".into(),
        ));
    }

    document.undo_stack.push(document.working_path.clone());
    if document.undo_stack.len() > 100 {
        document.undo_stack.remove(0);
    }
    document.redo_stack.clear();
    document.working_path = Some(output);
    document.file_size = metadata.len();
    document.revision = document.revision.saturating_add(1);
    Ok(pdf::summary(document))
}

pub fn commit_revision_pair(
    state: &AppState,
    first_document_id: &str,
    first_expected_revision: u64,
    first_output: PathBuf,
    second_document_id: &str,
    second_expected_revision: u64,
    second_output: PathBuf,
) -> Result<(pdf::DocumentSummary, pdf::DocumentSummary), SevenError> {
    if first_document_id == second_document_id {
        return Err(SevenError::OperationRejected(
            "A transferência exige dois documentos diferentes".into(),
        ));
    }

    pdf::validate_pdf_path(first_output.to_string_lossy().as_ref())?;
    pdf::validate_pdf_path(second_output.to_string_lossy().as_ref())?;
    let first_metadata = fs::metadata(&first_output).map_err(|error| SevenError::Io(error.to_string()))?;
    let second_metadata = fs::metadata(&second_output).map_err(|error| SevenError::Io(error.to_string()))?;

    let mut documents = state.documents.lock();
    let first_revision = documents
        .get(first_document_id)
        .ok_or(SevenError::DocumentNotOpen)?
        .revision;
    let second_revision = documents
        .get(second_document_id)
        .ok_or(SevenError::DocumentNotOpen)?
        .revision;

    if first_revision != first_expected_revision || second_revision != second_expected_revision {
        let _ = fs::remove_file(&first_output);
        let _ = fs::remove_file(&second_output);
        return Err(SevenError::OperationRejected(
            "Um dos documentos mudou durante a transferência. Nenhuma alteração foi aplicada.".into(),
        ));
    }

    {
        let first = documents
            .get_mut(first_document_id)
            .ok_or(SevenError::DocumentNotOpen)?;
        first.undo_stack.push(first.working_path.clone());
        if first.undo_stack.len() > 100 {
            first.undo_stack.remove(0);
        }
        first.redo_stack.clear();
        first.working_path = Some(first_output);
        first.file_size = first_metadata.len();
        first.revision = first.revision.saturating_add(1);
    }

    {
        let second = documents
            .get_mut(second_document_id)
            .ok_or(SevenError::DocumentNotOpen)?;
        second.undo_stack.push(second.working_path.clone());
        if second.undo_stack.len() > 100 {
            second.undo_stack.remove(0);
        }
        second.redo_stack.clear();
        second.working_path = Some(second_output);
        second.file_size = second_metadata.len();
        second.revision = second.revision.saturating_add(1);
    }

    let first_summary = pdf::summary(
        documents.get(first_document_id).ok_or(SevenError::DocumentNotOpen)?
    );
    let second_summary = pdf::summary(
        documents.get(second_document_id).ok_or(SevenError::DocumentNotOpen)?
    );
    Ok((first_summary, second_summary))
}

pub fn apply_revision<T, F>(
    state: &AppState,
    document_id: &str,
    label: &str,
    operation: F,
) -> Result<(pdf::DocumentSummary, T), SevenError>
where
    F: FnOnce(&Path, &Path) -> Result<T, SevenError>,
{
    let prepared = prepare_revision(state, document_id, label)?;
    let result = operation(prepared.document.active_path(), &prepared.output)?;
    let summary = commit_revision(
        state,
        document_id,
        prepared.expected_revision,
        prepared.output,
    )?;
    Ok((summary, result))
}

pub fn undo(state: &AppState, document_id: &str) -> Result<pdf::DocumentSummary, SevenError> {
    let mut documents = state.documents.lock();
    let document = documents
        .get_mut(document_id)
        .ok_or(SevenError::DocumentNotOpen)?;
    let previous = document
        .undo_stack
        .pop()
        .ok_or_else(|| SevenError::OperationRejected("Nada para desfazer".into()))?;

    document.redo_stack.push(document.working_path.clone());
    document.working_path = previous;
    document.revision = document.revision.saturating_add(1);
    document.file_size = fs::metadata(document.active_path())
        .map_err(|error| SevenError::Io(error.to_string()))?
        .len();
    Ok(pdf::summary(document))
}

pub fn redo(state: &AppState, document_id: &str) -> Result<pdf::DocumentSummary, SevenError> {
    let mut documents = state.documents.lock();
    let document = documents
        .get_mut(document_id)
        .ok_or(SevenError::DocumentNotOpen)?;
    let next = document
        .redo_stack
        .pop()
        .ok_or_else(|| SevenError::OperationRejected("Nada para refazer".into()))?;

    document.undo_stack.push(document.working_path.clone());
    document.working_path = next;
    document.revision = document.revision.saturating_add(1);
    document.file_size = fs::metadata(document.active_path())
        .map_err(|error| SevenError::Io(error.to_string()))?
        .len();
    Ok(pdf::summary(document))
}

fn source_changed(document: &OpenDocument) -> Result<bool, SevenError> {
    let metadata = fs::metadata(&document.path)
        .map_err(|_| SevenError::OperationRejected(
            "O arquivo original não existe mais no disco".into(),
        ))?;
    Ok(
        metadata.len() != document.source_file_size
            || pdf::modified_ns(&metadata) != document.source_modified_ns
    )
}

fn replace_file_atomically(source: &Path, destination: &Path) -> Result<(), SevenError> {
    let parent = destination
        .parent()
        .ok_or_else(|| SevenError::InvalidPath(destination.to_string_lossy().into_owned()))?;
    let file_name = destination
        .file_name()
        .ok_or_else(|| SevenError::InvalidPath(destination.to_string_lossy().into_owned()))?;
    let temp = parent.join(format!(".{}.seven-save.tmp", file_name.to_string_lossy()));
    fs::copy(source, &temp).map_err(|error| SevenError::Io(error.to_string()))?;
    pdf::validate_pdf_path(temp.to_string_lossy().as_ref())?;

    #[cfg(target_os = "windows")]
    if destination.exists() {
        let backup = parent.join(format!(".{}.seven-backup.tmp", file_name.to_string_lossy()));
        let _ = fs::remove_file(&backup);
        fs::rename(destination, &backup).map_err(|error| SevenError::Io(error.to_string()))?;
        match fs::rename(&temp, destination) {
            Ok(()) => {
                let _ = fs::remove_file(backup);
                return Ok(());
            }
            Err(error) => {
                let _ = fs::rename(&backup, destination);
                let _ = fs::remove_file(&temp);
                return Err(SevenError::Io(error.to_string()));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        fs::rename(&temp, destination).map_err(|error| SevenError::Io(error.to_string()))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        fs::rename(&temp, destination).map_err(|error| SevenError::Io(error.to_string()))
    }
}

pub fn save(
    state: &AppState,
    document_id: &str,
) -> Result<pdf::DocumentSummary, SevenError> {
    let snapshot = state
        .documents
        .lock()
        .get(document_id)
        .cloned()
        .ok_or(SevenError::DocumentNotOpen)?;

    if !snapshot.is_dirty() {
        return Ok(pdf::summary(&snapshot));
    }

    if source_changed(&snapshot)? {
        return Err(SevenError::OperationRejected(
            "O arquivo foi alterado fora do Seven Reader desde que foi aberto. Use Salvar como ou recarregue o arquivo antes de sobrescrever.".into(),
        ));
    }

    replace_file_atomically(snapshot.active_path(), &snapshot.path)?;
    let metadata = fs::metadata(&snapshot.path).map_err(|error| SevenError::Io(error.to_string()))?;

    let mut documents = state.documents.lock();
    let document = documents
        .get_mut(document_id)
        .ok_or(SevenError::DocumentNotOpen)?;
    if document.revision != snapshot.revision {
        return Err(SevenError::OperationRejected(
            "O documento mudou durante o salvamento. Tente novamente.".into(),
        ));
    }
    document.working_path = None;
    document.undo_stack.clear();
    document.redo_stack.clear();
    document.file_size = metadata.len();
    document.source_file_size = metadata.len();
    document.source_modified_ns = pdf::modified_ns(&metadata);
    document.revision = document.revision.saturating_add(1);
    Ok(pdf::summary(document))
}
