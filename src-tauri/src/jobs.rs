use crate::{
    error::SevenError,
    state::{AppState, JobRuntime, JobStatus},
};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[cfg(unix)]
fn set_process_paused(pid: u32, paused: bool) -> Result<(), SevenError> {
    let signal = if paused { libc::SIGSTOP } else { libc::SIGCONT };
    let result = unsafe { libc::kill(pid as i32, signal) };
    if result == 0 {
        Ok(())
    } else {
        Err(SevenError::Operation(std::io::Error::last_os_error().to_string()))
    }
}

#[cfg(windows)]
fn set_process_paused(pid: u32, paused: bool) -> Result<(), SevenError> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD,
                THREADENTRY32,
            },
            Threading::{OpenThread, ResumeThread, SuspendThread, THREAD_SUSPEND_RESUME},
        },
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(SevenError::Operation(std::io::Error::last_os_error().to_string()));
    }

    let mut entry = THREADENTRY32 {
        dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    let mut found = unsafe { Thread32First(snapshot, &mut entry) } != 0;
    let mut touched = 0usize;
    let mut first_error: Option<String> = None;

    while found {
        if entry.th32OwnerProcessID == pid {
            let thread = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
            if !thread.is_null() {
                let result = unsafe {
                    if paused {
                        SuspendThread(thread)
                    } else {
                        ResumeThread(thread)
                    }
                };
                if result == u32::MAX && first_error.is_none() {
                    first_error = Some(std::io::Error::last_os_error().to_string());
                } else if result != u32::MAX {
                    touched += 1;
                }
                unsafe { CloseHandle(thread) };
            }
        }
        found = unsafe { Thread32Next(snapshot, &mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };

    if touched == 0 {
        return Err(SevenError::Operation(
            first_error.unwrap_or_else(|| "Nenhuma thread do processo pôde ser pausada/retomada".into()),
        ));
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn set_process_paused(_pid: u32, _paused: bool) -> Result<(), SevenError> {
    Err(SevenError::CapabilityUnavailable(
        "Pausa de processo não suportada neste sistema".into(),
    ))
}

fn supervise_pause(
    child: &Child,
    pause_requested: &AtomicBool,
    process_is_paused: &mut bool,
) -> Result<bool, SevenError> {
    let requested = pause_requested.load(Ordering::Relaxed);
    if requested == *process_is_paused {
        return Ok(requested);
    }
    set_process_paused(child.id(), requested)?;
    *process_is_paused = requested;
    Ok(requested)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStart {
    pub job_id: String,
}

struct JobUpdate {
    state: String,
    stage: String,
    progress: Option<f64>,
    output: Option<String>,
    error: Option<String>,
}

impl JobUpdate {
    fn new(state: impl Into<String>, stage: impl Into<String>) -> Self {
        Self { state: state.into(), stage: stage.into(), progress: None, output: None, error: None }
    }

    fn progress(mut self, progress: f64) -> Self {
        self.progress = Some(progress);
        self
    }

    fn output(mut self, output: Option<String>) -> Self {
        self.output = output;
        self
    }

    fn error(mut self, error: String) -> Self {
        self.error = Some(error);
        self
    }
}

fn update_job(
    jobs: &Arc<parking_lot::Mutex<std::collections::HashMap<String, JobRuntime>>>,
    app: &AppHandle,
    id: &str,
    update: JobUpdate,
) {
    let mut guard = jobs.lock();
    if let Some(runtime) = guard.get_mut(id) {
        runtime.status.state = update.state;
        runtime.status.stage = update.stage;
        runtime.status.progress = update.progress;
        runtime.status.output = update.output;
        runtime.status.error = update.error;
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
    let paused = Arc::new(AtomicBool::new(false));
    let status = JobStatus {
        id: id.clone(),
        kind: kind.to_owned(),
        state: "queued".into(),
        stage: "Na fila".into(),
        progress: None,
        output: None,
        error: None,
    };

    state.jobs.lock().insert(id.clone(), JobRuntime { status, cancel: cancel.clone(), paused: paused.clone() });
    let jobs = state.jobs.clone();
    let id_for_thread = id.clone();

    thread::spawn(move || {
        update_job(&jobs, &app, &id_for_thread, JobUpdate::new("running", "Iniciando"));

        let mut child = match Command::new(&program)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                update_job(&jobs, &app, &id_for_thread, JobUpdate::new("failed", "Falha ao iniciar").error(error.to_string()));
                return;
            }
        };

        let mut process_is_paused = false;
        loop {
            if cancel.load(Ordering::Relaxed) {
                if process_is_paused {
                    let _ = set_process_paused(child.id(), false);
                }
                let _ = child.kill();
                let _ = child.wait();
                update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                return;
            }

            match supervise_pause(&child, &paused, &mut process_is_paused) {
                Ok(true) => {
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("paused", "Pausado"));
                    thread::sleep(Duration::from_millis(250));
                    continue;
                }
                Ok(false) => {}
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    update_job(
                        &jobs,
                        &app,
                        &id_for_thread,
                        JobUpdate::new("failed", "Falha ao pausar/retomar").error(error.to_string()),
                    );
                    return;
                }
            }

            match child.try_wait() {
                Ok(Some(status)) => {
                    if status.success() {
                        let output = output_path.as_ref().map(|path| path.to_string_lossy().into_owned());
                        update_job(&jobs, &app, &id_for_thread, JobUpdate::new("completed", "Concluído").progress(1.0).output(output));
                    } else {
                        let message = format!("Processo encerrou com código {:?}", status.code());
                        update_job(&jobs, &app, &id_for_thread, JobUpdate::new("failed", "Falha").error(message));
                    }
                    return;
                }
                Ok(None) => {
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("running", "Processando"));
                    thread::sleep(Duration::from_millis(250));
                }
                Err(error) => {
                    let _ = child.kill();
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("failed", "Falha ao acompanhar processo").error(error.to_string()));
                    return;
                }
            }
        }
    });

    JobStart { job_id: id }
}

pub fn start_process_job_with_postprocess<F>(
    app: AppHandle,
    state: &AppState,
    kind: &str,
    program: PathBuf,
    args: Vec<String>,
    output_path: Option<PathBuf>,
    postprocess_label: &str,
    postprocess: F,
) -> JobStart
where
    F: FnOnce() -> Result<(), SevenError> + Send + 'static,
{
    let id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let status = JobStatus {
        id: id.clone(),
        kind: kind.to_owned(),
        state: "queued".into(),
        stage: "Na fila".into(),
        progress: Some(0.0),
        output: None,
        error: None,
    };

    state.jobs.lock().insert(id.clone(), JobRuntime { status, cancel: cancel.clone(), paused: paused.clone() });
    let jobs = state.jobs.clone();
    let id_for_thread = id.clone();
    let postprocess_label = postprocess_label.to_owned();

    thread::spawn(move || {
        update_job(
            &jobs,
            &app,
            &id_for_thread,
            JobUpdate::new("running", "Processando estrutura").progress(0.1),
        );

        let mut child = match Command::new(&program)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                update_job(
                    &jobs,
                    &app,
                    &id_for_thread,
                    JobUpdate::new("failed", "Falha ao iniciar").error(error.to_string()),
                );
                return;
            }
        };

        let mut process_is_paused = false;
        loop {
            if cancel.load(Ordering::Relaxed) {
                if process_is_paused {
                    let _ = set_process_paused(child.id(), false);
                }
                let _ = child.kill();
                let _ = child.wait();
                update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                return;
            }
            match supervise_pause(&child, &paused, &mut process_is_paused) {
                Ok(true) => {
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("paused", "Pausado").progress(0.1));
                    thread::sleep(Duration::from_millis(250));
                    continue;
                }
                Ok(false) => {}
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    update_job(
                        &jobs,
                        &app,
                        &id_for_thread,
                        JobUpdate::new("failed", "Falha ao pausar/retomar").error(error.to_string()),
                    );
                    return;
                }
            }
            match child.try_wait() {
                Ok(Some(status)) if status.success() => break,
                Ok(Some(status)) => {
                    update_job(
                        &jobs,
                        &app,
                        &id_for_thread,
                        JobUpdate::new("failed", "Falha")
                            .error(format!("Processo encerrou com código {:?}", status.code())),
                    );
                    return;
                }
                Ok(None) => thread::sleep(Duration::from_millis(250)),
                Err(error) => {
                    let _ = child.kill();
                    update_job(
                        &jobs,
                        &app,
                        &id_for_thread,
                        JobUpdate::new("failed", "Falha ao acompanhar processo").error(error.to_string()),
                    );
                    return;
                }
            }
        }

        while paused.load(Ordering::Relaxed) {
            if cancel.load(Ordering::Relaxed) {
                update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                return;
            }
            update_job(&jobs, &app, &id_for_thread, JobUpdate::new("paused", "Pausado antes do pós-processamento").progress(0.8));
            thread::sleep(Duration::from_millis(250));
        }
        if cancel.load(Ordering::Relaxed) {
            update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
            return;
        }

        update_job(
            &jobs,
            &app,
            &id_for_thread,
            JobUpdate::new("running", postprocess_label).progress(0.82),
        );
        if let Err(error) = postprocess() {
            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("failed", "Falha no pós-processamento").error(error.to_string()),
            );
            return;
        }

        let output = output_path.as_ref().map(|path| path.to_string_lossy().into_owned());
        update_job(
            &jobs,
            &app,
            &id_for_thread,
            JobUpdate::new("completed", "Concluído").progress(1.0).output(output),
        );
    });

    JobStart { job_id: id }
}

struct CleanupPaths(Vec<PathBuf>);

impl Drop for CleanupPaths {
    fn drop(&mut self) {
        for path in &self.0 {
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            } else if path.is_dir() {
                let _ = std::fs::remove_dir_all(path);
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProcessStep {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub label: String,
}

pub fn start_process_sequence_job(
    app: AppHandle,
    state: &AppState,
    kind: &str,
    steps: Vec<ProcessStep>,
    output_path: Option<PathBuf>,
) -> JobStart {
    start_process_sequence_job_with_cleanup(app, state, kind, steps, output_path, Vec::new())
}

pub fn start_process_sequence_job_with_cleanup(
    app: AppHandle,
    state: &AppState,
    kind: &str,
    steps: Vec<ProcessStep>,
    output_path: Option<PathBuf>,
    cleanup_paths: Vec<PathBuf>,
) -> JobStart {
    let id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let status = JobStatus {
        id: id.clone(),
        kind: kind.to_owned(),
        state: "queued".into(),
        stage: "Na fila".into(),
        progress: Some(0.0),
        output: None,
        error: None,
    };

    state.jobs.lock().insert(id.clone(), JobRuntime { status, cancel: cancel.clone(), paused: paused.clone() });
    let jobs = state.jobs.clone();
    let id_for_thread = id.clone();

    thread::spawn(move || {
        let _cleanup = CleanupPaths(cleanup_paths);
        if steps.is_empty() {
            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("failed", "Fila vazia").error("Nenhuma etapa foi informada".into()),
            );
            return;
        }

        let total = steps.len() as f64;
        for (index, step) in steps.into_iter().enumerate() {
            while paused.load(Ordering::Relaxed) {
                if cancel.load(Ordering::Relaxed) {
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                    return;
                }
                update_job(
                    &jobs,
                    &app,
                    &id_for_thread,
                    JobUpdate::new("paused", "Fila pausada").progress(index as f64 / total),
                );
                thread::sleep(Duration::from_millis(250));
            }
            if cancel.load(Ordering::Relaxed) {
                update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                return;
            }

            let progress = index as f64 / total;
            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("running", step.label.clone()).progress(progress),
            );

            let mut child = match Command::new(&step.program)
                .args(&step.args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(child) => child,
                Err(error) => {
                    update_job(
                        &jobs,
                        &app,
                        &id_for_thread,
                        JobUpdate::new("failed", step.label).error(error.to_string()),
                    );
                    return;
                }
            };

            let mut process_is_paused = false;
            loop {
                if cancel.load(Ordering::Relaxed) {
                    if process_is_paused {
                        let _ = set_process_paused(child.id(), false);
                    }
                    let _ = child.kill();
                    let _ = child.wait();
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                    return;
                }

                match supervise_pause(&child, &paused, &mut process_is_paused) {
                    Ok(true) => {
                        update_job(
                            &jobs,
                            &app,
                            &id_for_thread,
                            JobUpdate::new("paused", format!("Pausado · {}", step.label)).progress(progress),
                        );
                        thread::sleep(Duration::from_millis(250));
                        continue;
                    }
                    Ok(false) => {}
                    Err(error) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        update_job(
                            &jobs,
                            &app,
                            &id_for_thread,
                            JobUpdate::new("failed", "Falha ao pausar/retomar").error(error.to_string()),
                        );
                        return;
                    }
                }

                match child.try_wait() {
                    Ok(Some(status)) if status.success() => break,
                    Ok(Some(status)) => {
                        update_job(
                            &jobs,
                            &app,
                            &id_for_thread,
                            JobUpdate::new("failed", step.label)
                                .error(format!("Processo encerrou com código {:?}", status.code())),
                        );
                        return;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(250)),
                    Err(error) => {
                        let _ = child.kill();
                        update_job(
                            &jobs,
                            &app,
                            &id_for_thread,
                            JobUpdate::new("failed", step.label).error(error.to_string()),
                        );
                        return;
                    }
                }
            }

            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("running", "Etapa concluída").progress((index + 1) as f64 / total),
            );
        }

        let output = output_path.as_ref().map(|path| path.to_string_lossy().into_owned());
        update_job(
            &jobs,
            &app,
            &id_for_thread,
            JobUpdate::new("completed", "Concluído").progress(1.0).output(output),
        );
    });

    JobStart { job_id: id }
}

pub fn start_rust_batch_job<F>(
    app: AppHandle,
    state: &AppState,
    kind: &str,
    labels: Vec<String>,
    output_path: Option<PathBuf>,
    operation: F,
) -> JobStart
where
    F: FnMut(usize) -> Result<(), SevenError> + Send + 'static,
{
    start_rust_batch_job_with_cleanup(
        app,
        state,
        kind,
        labels,
        output_path,
        Vec::new(),
        operation,
    )
}

pub fn start_rust_batch_job_with_cleanup<F>(
    app: AppHandle,
    state: &AppState,
    kind: &str,
    labels: Vec<String>,
    output_path: Option<PathBuf>,
    cleanup_paths: Vec<PathBuf>,
    mut operation: F,
) -> JobStart
where
    F: FnMut(usize) -> Result<(), SevenError> + Send + 'static,
{
    let id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let status = JobStatus {
        id: id.clone(),
        kind: kind.to_owned(),
        state: "queued".into(),
        stage: "Na fila".into(),
        progress: Some(0.0),
        output: None,
        error: None,
    };

    state.jobs.lock().insert(
        id.clone(),
        JobRuntime {
            status,
            cancel: cancel.clone(),
            paused: paused.clone(),
        },
    );
    let jobs = state.jobs.clone();
    let id_for_thread = id.clone();

    thread::spawn(move || {
        let _cleanup = CleanupPaths(cleanup_paths);
        if labels.is_empty() {
            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("failed", "Lote vazio").error("Nenhum arquivo foi informado".into()),
            );
            return;
        }

        let total = labels.len() as f64;
        for (index, label) in labels.iter().enumerate() {
            while paused.load(Ordering::Relaxed) {
                if cancel.load(Ordering::Relaxed) {
                    update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                    return;
                }
                update_job(
                    &jobs,
                    &app,
                    &id_for_thread,
                    JobUpdate::new("paused", format!("Pausado · {label}"))
                        .progress(index as f64 / total),
                );
                thread::sleep(Duration::from_millis(200));
            }

            if cancel.load(Ordering::Relaxed) {
                update_job(&jobs, &app, &id_for_thread, JobUpdate::new("cancelled", "Cancelado"));
                return;
            }

            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("running", label.clone()).progress(index as f64 / total),
            );

            if let Err(error) = operation(index) {
                update_job(
                    &jobs,
                    &app,
                    &id_for_thread,
                    JobUpdate::new("failed", format!("Falha · {label}")).error(error.to_string()),
                );
                return;
            }

            update_job(
                &jobs,
                &app,
                &id_for_thread,
                JobUpdate::new("running", format!("Concluído · {label}"))
                    .progress((index + 1) as f64 / total),
            );
        }

        let output = output_path.as_ref().map(|path| path.to_string_lossy().into_owned());
        update_job(
            &jobs,
            &app,
            &id_for_thread,
            JobUpdate::new("completed", "Lote concluído")
                .progress(1.0)
                .output(output),
        );
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


pub fn validated_directory(path: &str) -> Result<PathBuf, SevenError> {
    let directory = std::fs::canonicalize(path)
        .map_err(|error| SevenError::InvalidPath(error.to_string()))?;
    if !directory.is_dir() {
        return Err(SevenError::InvalidPath("O caminho não aponta para uma pasta".into()));
    }
    Ok(directory)
}

pub fn validated_basename(value: &str) -> Result<String, SevenError> {
    let name = value.trim();
    if name.is_empty() || name.len() > 120 {
        return Err(SevenError::OperationRejected("Nome de saída inválido".into()));
    }
    if !name.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ' ' | '.')) {
        return Err(SevenError::OperationRejected(
            "O nome pode conter apenas letras, números, espaço, ponto, hífen e sublinhado".into(),
        ));
    }
    Ok(name.trim_end_matches('.').to_owned())
}

pub fn validated_password(value: &str, label: &str) -> Result<String, SevenError> {
    if value.is_empty() || value.chars().count() > 127 {
        return Err(SevenError::OperationRejected(format!(
            "{label} deve ter entre 1 e 127 caracteres"
        )));
    }
    if value.chars().any(|ch| ch == '\0' || ch == '\r' || ch == '\n') {
        return Err(SevenError::OperationRejected(format!(
            "{label} contém caracteres não permitidos"
        )));
    }
    Ok(value.to_owned())
}
