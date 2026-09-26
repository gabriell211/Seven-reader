use crate::state::AppState;
use pdfium_render::prelude::Pdfium;
use serde::Serialize;
use std::{env, path::{Path, PathBuf}, process::Command};

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
    pub tesseract: Capability,
    pub unpaper: Capability,
    pub web_pdf: Capability,
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

pub fn find_browser() -> Option<PathBuf> {
    for candidate in ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser"] {
        if let Ok(path) = which::which(candidate) {
            return Some(path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut candidates = Vec::new();
        for key in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
            if let Some(base) = env::var_os(key) {
                let base = PathBuf::from(base);
                candidates.push(base.join("Microsoft/Edge/Application/msedge.exe"));
                candidates.push(base.join("Google/Chrome/Application/chrome.exe"));
            }
        }
        if let Some(path) = candidates.into_iter().find(|path| path.is_file()) {
            return Some(path);
        }
    }

    #[cfg(target_os = "macos")]
    {
        for path in [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ] {
            let candidate = PathBuf::from(path);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
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
    #[cfg(target_os = "windows")]
    let scanner = command_version(
        &["powershell"],
        &[
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$ErrorActionPreference='Stop'; $null=New-Object -ComObject WIA.DeviceManager; Write-Output WIA",
        ],
    );
    #[cfg(target_os = "macos")]
    let scanner = Capability {
        available: false,
        version: None,
        detail: Some("Adapter Image Capture ainda não integrado".into()),
    };

    #[cfg(target_os = "linux")]
    let printing = command_version(&["lpstat"], &["-r"]);
    #[cfg(target_os = "windows")]
    let printing = command_version(&["powershell"], &["-NoProfile", "-Command", "Get-Printer | Select-Object -First 1 | Out-Null; Write-Output WindowsPrint"]);
    #[cfg(target_os = "macos")]
    let printing = command_version(&["lpstat"], &["-r"]);

    let pdftotext = command_version(&["pdftotext"], &["-v"]);
    let openssl = command_version(&["openssl"], &["version"]);
    let tesseract = command_version(&["tesseract"], &["--version"]);
    let unpaper = command_version(&["unpaper"], &["--version"]);
    let web_pdf = match find_browser() {
        Some(path) => Capability {
            available: true,
            version: None,
            detail: Some(path.to_string_lossy().into_owned()),
        },
        None => Capability {
            available: false,
            version: None,
            detail: Some("Chrome, Chromium ou Edge não detectado".into()),
        },
    };

    let certificates = Capability {
        available: true,
        version: Some("underskrift 0.1.4".into()),
        detail: Some("PKCS#12 + PAdES B-B/B-T/B-LT/B-LTA integrados".into()),
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
        tesseract,
        unpaper,
        web_pdf,
    }
}
