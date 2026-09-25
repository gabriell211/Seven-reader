use crate::state::AppState;
use pdfium_render::prelude::Pdfium;
use serde::Serialize;
use std::{path::Path, process::Command};

#[derive(Debug, Clone, Serialize)]
pub struct Capability {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Capabilities {
    pub pdf_engine: Capability,
    pub qpdf: Capability,
    pub ocr: Capability,
    pub office: Capability,
    pub ghostscript: Capability,
    pub scanner: Capability,
    pub printing: Capability,
    pub certificates: Capability,
    pub pdftotext: Capability,
    pub openssl: Capability,
}

fn command_version(candidates: &[&str], args: &[&str]) -> Capability {
    for candidate in candidates {
        if which::which(candidate).is_ok() {
            let version = Command::new(candidate)
                .args(args)
                .output()
                .ok()
                .and_then(|output| {
                    let text = if output.stdout.is_empty() { output.stderr } else { output.stdout };
                    String::from_utf8(text).ok()
                })
                .and_then(|text| text.lines().next().map(str::trim).map(str::to_owned));
            return Capability { available: true, version, detail: Some((*candidate).to_owned()) };
        }
    }
    Capability { available: false, version: None, detail: None }
}

pub fn bind_pdfium(resource_dir: &Path) -> Result<Pdfium, String> {
    let bundled = resource_dir.join("resources");
    Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&bundled))
        .or_else(|_| Pdfium::bind_to_system_library())
        .map(Pdfium::new)
        .map_err(|error| error.to_string())
}

pub fn detect(state: &AppState) -> Capabilities {
    let pdf_engine = match bind_pdfium(&state.resource_dir) {
        Ok(_) => Capability {
            available: true,
            version: None,
            detail: Some("PDFium".into()),
        },
        Err(error) => Capability {
            available: false,
            version: None,
            detail: Some(error),
        },
    };

    let qpdf = command_version(&["qpdf"], &["--version"]);
    let ocr = command_version(&["ocrmypdf"], &["--version"]);
    let office = command_version(&["soffice", "libreoffice"], &["--version"]);
    let ghostscript = command_version(&["gswin64c", "gswin32c", "gs"], &["--version"]);

    #[cfg(target_os = "linux")]
    let scanner = command_version(&["scanimage"], &["--version"]);
    #[cfg(not(target_os = "linux"))]
    let scanner = Capability {
        available: false,
        version: None,
        detail: Some("Adapter WIA/TWAIN ainda não carregado".into()),
    };

    #[cfg(target_os = "linux")]
    let printing = command_version(&["lpstat"], &["-r"]);
    #[cfg(target_os = "windows")]
    let printing = command_version(&["powershell"], &["-NoProfile", "-Command", "Get-Printer | Select-Object -First 1 | Out-Null; Write-Output WindowsPrint"]);
    #[cfg(target_os = "macos")]
    let printing = command_version(&["lpstat"], &["-r"]);

    let pdftotext = command_version(&["pdftotext"], &["-v"]);
    let openssl = command_version(&["openssl"], &["version"]);

    let certificates = Capability {
        available: false,
        version: None,
        detail: Some("Store de certificados detectado somente quando o módulo de assinatura estiver carregado".into()),
    };

    Capabilities {
        pdf_engine,
        qpdf,
        ocr,
        office,
        ghostscript,
        scanner,
        printing,
        certificates,
        pdftotext,
        openssl,
    }
}
