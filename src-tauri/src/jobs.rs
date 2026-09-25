use crate::{
    error::SevenError,
    state::{AppState, JobRuntime, JobStatus},
};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStart {
    pub job_id: String,
}

fn update_job(
    jobs: &Arc<parking_lot::Mutex<std::collections::HashMap<String, JobRuntime>>>,
    app: &AppHandle,
    id: &str,
    state: &str,
    stage: &str,
    progress: Option<f64>,
    output: Option<String>,
    error: Option<String>,
) {
    let mut guard = jobs.lock();
    if let Some(runtime) = guard.get_mut(id) {
        runtime.status.state = state.to_owned();
        runtime.status.stage = stage.to_owned();
        runtime.status.progress = progress;
        runtime.status.output = output;
        runtime.status.error = error;
        let _ = app.emit("seven://job", runtime.status.clone());
    }
}

pub fn start_process_job(
    app: AppHandle,
    state: &AppState,
    kind: &str,
    program: PathBuf,
    args: Vec<String>,
    output_path: Option<PathBuf>,
) -> JobStart {
    let id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let status = JobStatus {
        id: id.clone(),
        kind: kind.to_owned(),
        state: "queued".into(),
        stage: "Na fila".into(),
        progress: None,
        output: None,
        error: None,
    };

    state.jobs.lock().insert(id.clone(), JobRuntime { status, cancel: cancel.clone() });
    let jobs = state.jobs.clone();
    let id_for_thread = id.clone();

    thread::spawn(move || {
        update_job(&jobs, &app, &id_for_thread, "running", "Iniciando", None, None, None);

        let mut child = match Command::new(&program)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                update_job(&jobs, &app, &id_for_thread, "failed", "Falha ao iniciar", None, None, Some(error.to_string()));
                return;
            }
        };

        loop {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.wait();
                update_job(&jobs, &app, &id_for_thread, "cancelled", "Cancelado", None, None, None);
                return;
            }

            match child.try_wait() {
                Ok(Some(status)) => {
                    if status.success() {
                        let output = output_path.as_ref().map(|path| path.to_string_lossy().into_owned());
                        update_job(&jobs, &app, &id_for_thread, "completed", "Concluído", Some(1.0), output, None);
                    } else {
                        let message = format!("Processo encerrou com código {:?}", status.code());
                        update_job(&jobs, &app, &id_for_thread, "failed", "Falha", None, None, Some(message));
                    }
                    return;
                }
                Ok(None) => {
                    update_job(&jobs, &app, &id_for_thread, "running", "Processando", None, None, None);
                    thread::sleep(Duration::from_millis(250));
                }
                Err(error) => {
                    let _ = child.kill();
                    update_job(&jobs, &app, &id_for_thread, "failed", "Falha ao acompanhar processo", None, None, Some(error.to_string()));
                    return;
                }
            }
        }
    });

    JobStart { job_id: id }
}

pub fn require_executable(candidates: &[&str], label: &str) -> Result<PathBuf, SevenError> {
    for candidate in candidates {
        if let Ok(path) = which::which(candidate) {
            return Ok(path);
        }
    }
    Err(SevenError::CapabilityUnavailable(label.to_owned()))
}

pub fn validated_output(path: &str, extension: &str) -> Result<PathBuf, SevenError> {
    let output = Path::new(path);
    let parent = output.parent().ok_or_else(|| SevenError::InvalidPath(path.to_owned()))?;
    let parent = std::fs::canonicalize(parent).map_err(|error| SevenError::InvalidPath(error.to_string()))?;
    let filename = output.file_name().ok_or_else(|| SevenError::InvalidPath(path.to_owned()))?;
    let destination = parent.join(filename);
    let actual = destination.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if !actual.eq_ignore_ascii_case(extension) {
        return Err(SevenError::UnsupportedFormat(actual.to_owned()));
    }
    Ok(destination)
}


pub fn validated_page_range(value: &str) -> Result<String, SevenError> {
    let range = value.trim();
    if range.is_empty() || range.len() > 512 {
        return Err(SevenError::OperationRejected("Intervalo de páginas inválido".into()));
    }

    let allowed = range.chars().all(|ch| {
        ch.is_ascii_digit()
            || matches!(ch, ',' | '-' | ':' | 'x' | 'r' | 'z' | 'o' | 'd' | 'e' | 'v' | 'n')
    });

    if !allowed
        || range.starts_with('-')
        || range.ends_with('-')
        || range.contains("..")
        || range.contains("--")
    {
        return Err(SevenError::OperationRejected(
            "Use apenas a sintaxe de páginas suportada, por exemplo: 1-5,8,z-2".into(),
        ));
    }

    Ok(range.to_owned())
}

pub fn validated_rotation(angle: i16) -> Result<i16, SevenError> {
    match angle {
        -270 | -180 | -90 | 0 | 90 | 180 | 270 => Ok(angle),
        _ => Err(SevenError::OperationRejected(
            "Rotação deve ser 0, 90, 180 ou 270 graus".into(),
        )),
    }
}
