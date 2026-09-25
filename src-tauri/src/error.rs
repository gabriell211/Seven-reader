use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SevenError {
    #[error("Caminho inválido: {0}")]
    InvalidPath(String),
    #[error("Arquivo não encontrado: {0}")]
    NotFound(String),
    #[error("Formato não suportado: {0}")]
    UnsupportedFormat(String),
    #[error("Documento não está aberto")]
    DocumentNotOpen,
    #[error("Engine PDF indisponível: {0}")]
    PdfEngineUnavailable(String),
    #[error("Falha ao abrir o PDF: {0}")]
    PdfOpen(String),
    #[error("Falha ao renderizar: {0}")]
    Render(String),
    #[error("Falha de E/S: {0}")]
    Io(String),
    #[error("Capacidade externa indisponível: {0}")]
    CapabilityUnavailable(String),
    #[error("Operação recusada: {0}")]
    OperationRejected(String),
    #[error("Operação cancelada")]
    Cancelled,
    #[error("Falha na operação: {0}")]
    Operation(String),
}

#[derive(Debug, Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

impl From<SevenError> for ErrorPayload {
    fn from(value: SevenError) -> Self {
        let code = match &value {
            SevenError::InvalidPath(_) => "INVALID_PATH",
            SevenError::NotFound(_) => "NOT_FOUND",
            SevenError::UnsupportedFormat(_) => "UNSUPPORTED_FORMAT",
            SevenError::DocumentNotOpen => "DOCUMENT_NOT_OPEN",
            SevenError::PdfEngineUnavailable(_) => "PDF_ENGINE_UNAVAILABLE",
            SevenError::PdfOpen(_) => "PDF_OPEN_FAILED",
            SevenError::Render(_) => "RENDER_FAILED",
            SevenError::Io(_) => "IO_ERROR",
            SevenError::CapabilityUnavailable(_) => "CAPABILITY_UNAVAILABLE",
            SevenError::OperationRejected(_) => "OPERATION_REJECTED",
            SevenError::Cancelled => "CANCELLED",
            SevenError::Operation(_) => "OPERATION_FAILED",
        };
        Self { code, message: value.to_string() }
    }
}

pub type CommandResult<T> = Result<T, ErrorPayload>;
