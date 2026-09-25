use crate::error::SevenError;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use underskrift::{
    PdfSigner, PadesLevel, SignatureVerifier, SigningOptions, SoftwareSigner, SubFilter,
};
use underskrift::trust::{TrustStore, TrustStoreSet};
use underskrift::visual::{
    SignatureLayout, SignatureRect, TextConfig, TextLine, VisibleSignatureConfig,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignRequest {
    pub pkcs12_path: String,
    pub password: String,
    pub level: String,
    pub field_name: String,
    pub page_index: u32,
    pub reason: Option<String>,
    pub location: Option<String>,
    pub contact_info: Option<String>,
    pub tsa_url: Option<String>,
    pub certify: bool,
    pub visible: bool,
    pub appearance_text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureValidationItem {
    pub field_name: String,
    pub status: String,
    pub signer_name: Option<String>,
    pub signature_type: String,
    pub pades_level: String,
    pub integrity_ok: bool,
    pub covers_whole_document: bool,
    pub digest_matches: bool,
    pub cryptographic_validity: String,
    pub certificate_validity: String,
    pub chain_trusted: bool,
    pub trust_anchor: Option<String>,
    pub modifications_after_signing: bool,
    pub signing_time: Option<String>,
    pub cms_signing_time: Option<String>,
    pub timestamp_time: Option<String>,
    pub summary: String,
    pub integrity_issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureValidationReport {
    pub signatures: Vec<SignatureValidationItem>,
    pub document_modified: bool,
    pub valid_count: usize,
    pub invalid_count: usize,
    pub summary: String,
}

fn pades_level(value: &str) -> Result<PadesLevel, SevenError> {
    match value {
        "bb" => Ok(PadesLevel::BB),
        "bt" => Ok(PadesLevel::BT),
        "blt" => Ok(PadesLevel::BLT),
        "blta" => Ok(PadesLevel::BLTA),
        _ => Err(SevenError::OperationRejected("Nível PAdES inválido".into())),
    }
}

fn optional_text(value: Option<String>, max: usize, label: &str) -> Result<Option<String>, SevenError> {
    match value {
        Some(value) if value.chars().count() > max => Err(SevenError::OperationRejected(format!(
            "{label} excede {max} caracteres"
        ))),
        Some(value) if value.trim().is_empty() => Ok(None),
        Some(value) => Ok(Some(value.trim().to_owned())),
        None => Ok(None),
    }
}

pub async fn sign_pdf(
    input: &Path,
    output: &Path,
    request: SignRequest,
) -> Result<(), SevenError> {
    let key_path = Path::new(&request.pkcs12_path);
    if !key_path.exists() || !key_path.is_file() {
        return Err(SevenError::NotFound(request.pkcs12_path));
    }
    if request.password.chars().count() > 256 {
        return Err(SevenError::OperationRejected("Senha PKCS#12 inválida".into()));
    }
    if request.field_name.trim().is_empty() || request.field_name.chars().count() > 128 {
        return Err(SevenError::OperationRejected("Nome do campo de assinatura inválido".into()));
    }

    let level = pades_level(&request.level)?;
    let requires_tsa = !matches!(level, PadesLevel::BB);
    let tsa_url = optional_text(request.tsa_url, 2048, "URL TSA")?;
    if requires_tsa && tsa_url.is_none() {
        return Err(SevenError::OperationRejected(
            "PAdES B-T/B-LT/B-LTA requer uma TSA RFC 3161".into(),
        ));
    }

    let signer = SoftwareSigner::from_pkcs12_file(key_path, &request.password)
        .map_err(|error| SevenError::Operation(format!("PKCS#12: {error}")))?;
    let pdf_data = fs::read(input).map_err(|error| SevenError::Io(error.to_string()))?;

    let visible_signature = if request.visible {
        if request.width <= 0.0 || request.height <= 0.0 {
            return Err(SevenError::OperationRejected("Área da assinatura visível inválida".into()));
        }
        let text = if request.appearance_text.trim().is_empty() {
            "Assinado digitalmente".to_owned()
        } else {
            request.appearance_text.trim().to_owned()
        };
        Some(VisibleSignatureConfig {
            page: request.page_index,
            rect: SignatureRect::Absolute {
                llx: request.x,
                lly: request.y,
                urx: request.x + request.width,
                ury: request.y + request.height,
            },
            layout: SignatureLayout::TextOnly(TextConfig {
                lines: vec![
                    TextLine::new(text).bold(),
                    TextLine::new("Assinatura digital PAdES"),
                ],
                ..Default::default()
            }),
            background_color: None,
            border: None,
        })
    } else {
        None
    };

    let options = SigningOptions {
        sub_filter: SubFilter::Pades,
        pades_level: level,
        field_name: request.field_name.trim().to_owned(),
        page: request.page_index,
        reason: optional_text(request.reason, 1024, "Motivo")?,
        location: optional_text(request.location, 512, "Local")?,
        contact_info: optional_text(request.contact_info, 512, "Contato")?,
        tsa_url,
        certify: request.certify,
        visible_signature,
        content_size: 32768,
        ..Default::default()
    };

    let signed = PdfSigner::new()
        .options(options)
        .sign(&pdf_data, &signer)
        .await
        .map_err(|error| SevenError::Operation(format!("Assinatura digital: {error}")))?;

    let temp = output.with_extension("seven-sign.tmp.pdf");
    fs::write(&temp, signed).map_err(|error| SevenError::Io(error.to_string()))?;
    lopdf::Document::load(&temp).map_err(|error| SevenError::PdfOpen(error.to_string()))?;
    if output.exists() {
        fs::remove_file(output).map_err(|error| SevenError::Io(error.to_string()))?;
    }
    fs::rename(&temp, output).map_err(|error| SevenError::Io(error.to_string()))
}

pub fn verify_pdf(
    path: &Path,
    trust_directory: Option<&Path>,
    allow_online: bool,
) -> Result<SignatureValidationReport, SevenError> {
    let pdf_data = fs::read(path).map_err(|error| SevenError::Io(error.to_string()))?;

    let trust = if let Some(directory) = trust_directory {
        if !directory.is_dir() {
            return Err(SevenError::InvalidPath(
                "A confiança deve apontar para uma pasta com certificados PEM".into(),
            ));
        }
        let store = TrustStore::from_pem_directory(directory)
            .map_err(|error| SevenError::Operation(format!("Trust store: {error}")))?;
        TrustStoreSet::new().with_sig_store(store)
    } else {
        TrustStoreSet::new()
    };

    let report = SignatureVerifier::new(&trust)
        .allow_online(allow_online)
        .verify_pdf(&pdf_data)
        .map_err(|error| SevenError::Operation(format!("Validação: {error}")))?;

    Ok(SignatureValidationReport {
        signatures: report
            .signatures
            .into_iter()
            .map(|signature| SignatureValidationItem {
                field_name: signature.field_name,
                status: format!("{:?}", signature.status),
                signer_name: signature.signer_name,
                signature_type: format!("{:?}", signature.signature_type),
                pades_level: format!("{:?}", signature.pades_level),
                integrity_ok: signature.integrity_ok,
                covers_whole_document: signature.covers_whole_document,
                digest_matches: signature.digest_matches,
                cryptographic_validity: format!("{:?}", signature.cryptographic_validity),
                certificate_validity: format!("{:?}", signature.certificate_validity),
                chain_trusted: signature.chain_trusted,
                trust_anchor: signature.trust_anchor,
                modifications_after_signing: signature.modifications_after_signing,
                signing_time: signature.signing_time,
                cms_signing_time: signature.cms_signing_time.map(|time| time.to_rfc3339()),
                timestamp_time: signature.timestamp_time,
                summary: signature.summary,
                integrity_issues: signature.integrity_issues,
            })
            .collect(),
        document_modified: report.document_modified,
        valid_count: report.valid_count,
        invalid_count: report.invalid_count,
        summary: report.summary,
    })
}
