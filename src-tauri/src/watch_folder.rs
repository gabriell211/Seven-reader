use crate::{
    conversion,
    error::SevenError,
    jobs,
    state::{AppState, WatchFolderRuntime},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant, SystemTime},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

fn default_max_retries() -> u8 {
    3
}

fn default_retry_backoff_seconds() -> u64 {
    5
}

fn default_quarantine_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFolderConfig {
    pub id: String,
    pub name: String,
    pub input_directory: String,
    pub output_directory: String,
    pub recursive: bool,
    pub enabled: bool,
    pub preset: String,
    #[serde(default)]
    pub preset_name: Option<String>,
    #[serde(default)]
    pub conversion_options: Option<conversion::ConversionOptions>,
    #[serde(default = "default_max_retries")]
    pub max_retries: u8,
    #[serde(default = "default_retry_backoff_seconds")]
    pub retry_backoff_seconds: u64,
    #[serde(default = "default_quarantine_enabled")]
    pub quarantine_enabled: bool,
    #[serde(default)]
    pub quarantine_directory: Option<String>,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFolderEvent {
    pub watcher_id: String,
    pub state: String,
    pub path: Option<String>,
    pub detail: String,
}

#[derive(Debug, Clone)]
struct FileSnapshot {
    size: u64,
    modified: Option<SystemTime>,
    stable_checks: u8,
}

#[derive(Debug, Clone)]
struct PendingConversion {
    job_id: String,
    size: u64,
    modified: Option<SystemTime>,
    attempt: u8,
}

#[derive(Debug, Clone)]
struct RetryState {
    size: u64,
    modified: Option<SystemTime>,
    attempt: u8,
    next_retry: Instant,
    last_error: String,
}

fn supported_extension(path: &Path, extensions: &[String]) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    extensions.iter().any(|value| value == &extension)
}

fn collect_files(
    directory: &Path,
    recursive: bool,
    extensions: &[String],
    output: &mut Vec<PathBuf>,
) -> Result<(), SevenError> {
    for entry in fs::read_dir(directory).map_err(|error| SevenError::Io(error.to_string()))? {
        let entry = entry.map_err(|error| SevenError::Io(error.to_string()))?;
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_files(&path, true, extensions, output)?;
        } else if path.is_file() && supported_extension(&path, extensions) {
            output.push(path);
        }
        if output.len() >= 20_000 {
            return Err(SevenError::OperationRejected(
                "A pasta monitorada excede o limite de 20.000 arquivos compatíveis".into(),
            ));
        }
    }
    Ok(())
}

fn canonical_directory(value: &str) -> Result<PathBuf, SevenError> {
    let path = fs::canonicalize(value).map_err(|error| SevenError::InvalidPath(error.to_string()))?;
    if !path.is_dir() {
        return Err(SevenError::InvalidPath("O caminho deve ser uma pasta".into()));
    }
    Ok(path)
}

fn prepare_quarantine_directory(
    configured: Option<&str>,
    input: &Path,
    output: &Path,
) -> Result<PathBuf, SevenError> {
    let requested = configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| output.join("Seven-Reader-Quarantine"));

    if !requested.is_absolute() {
        return Err(SevenError::InvalidPath(
            "A pasta de quarentena deve usar caminho absoluto".into(),
        ));
    }

    fs::create_dir_all(&requested).map_err(|error| SevenError::Io(error.to_string()))?;
    let quarantine =
        fs::canonicalize(&requested).map_err(|error| SevenError::InvalidPath(error.to_string()))?;

    if quarantine == input || quarantine.starts_with(input) {
        return Err(SevenError::OperationRejected(
            "A quarentena não pode ficar dentro da pasta monitorada".into(),
        ));
    }

    Ok(quarantine)
}

fn validate_config(
    mut config: WatchFolderConfig,
) -> Result<(WatchFolderConfig, PathBuf, PathBuf, Option<PathBuf>), SevenError> {
    if config.name.trim().is_empty() || config.name.chars().count() > 120 {
        return Err(SevenError::OperationRejected(
            "Nome da pasta monitorada deve ter entre 1 e 120 caracteres".into(),
        ));
    }
    let input = canonical_directory(&config.input_directory)?;
    let output = canonical_directory(&config.output_directory)?;
    if input == output {
        return Err(SevenError::OperationRejected(
            "Entrada e saída da pasta monitorada devem ser diferentes".into(),
        ));
    }
    if config.max_retries > 10 {
        return Err(SevenError::OperationRejected(
            "Retry deve ficar entre 0 e 10 tentativas adicionais".into(),
        ));
    }
    if !(1..=3600).contains(&config.retry_backoff_seconds) {
        return Err(SevenError::OperationRejected(
            "Backoff deve ficar entre 1 e 3600 segundos".into(),
        ));
    }

    let allowed = [
        "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt",
        "html", "htm",
    ];
    config.extensions = config
        .extensions
        .into_iter()
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| allowed.contains(&value.as_str()))
        .collect();
    config.extensions.sort();
    config.extensions.dedup();
    if config.extensions.is_empty() {
        config.extensions = allowed.iter().map(|value| (*value).to_owned()).collect();
    }

    config.preset = config.preset.trim().to_owned();
    config.preset_name = config.preset_name.and_then(|value| {
        let value = value.trim().to_owned();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    });
    if let Some(options) = &config.conversion_options {
        options.validate()?;
    } else if !matches!(config.preset.as_str(), "standard" | "compact" | "print") {
        return Err(SevenError::OperationRejected(
            "Watch Folder referencia um preset personalizado sem a configuração incorporada".into(),
        ));
    }
    if config.id.trim().is_empty() {
        config.id = Uuid::new_v4().to_string();
    }

    let quarantine = if config.quarantine_enabled {
        let directory = prepare_quarantine_directory(
            config.quarantine_directory.as_deref(),
            &input,
            &output,
        )?;
        config.quarantine_directory = Some(directory.to_string_lossy().into_owned());
        Some(directory)
    } else {
        config.quarantine_directory = None;
        None
    };

    Ok((config, input, output, quarantine))
}

fn retry_delay(base_seconds: u64, attempt: u8) -> Duration {
    let exponent = u32::from(attempt.saturating_sub(1).min(8));
    let multiplier = 2u64.saturating_pow(exponent);
    Duration::from_secs(base_seconds.saturating_mul(multiplier).min(3600))
}

fn collision_safe_quarantine_path(directory: &Path, source: &Path) -> PathBuf {
    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("arquivo");
    let direct = directory.join(file_name);
    if !direct.exists() {
        return direct;
    }

    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("arquivo");
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let suffix = Uuid::new_v4().to_string();
    let short = &suffix[..8];
    let name = if extension.is_empty() {
        format!("{stem}-{short}")
    } else {
        format!("{stem}-{short}.{extension}")
    };
    directory.join(name)
}

fn move_to_quarantine(
    source: &Path,
    directory: &Path,
    watcher_id: &str,
    reason: &str,
    attempts: u8,
) -> Result<PathBuf, SevenError> {
    fs::create_dir_all(directory).map_err(|error| SevenError::Io(error.to_string()))?;
    let target = collision_safe_quarantine_path(directory, source);

    if let Err(rename_error) = fs::rename(source, &target) {
        fs::copy(source, &target).map_err(|copy_error| {
            SevenError::Io(format!(
                "Falha ao mover para quarentena ({rename_error}); cópia também falhou: {copy_error}",
            ))
        })?;
        fs::remove_file(source).map_err(|remove_error| {
            let _ = fs::remove_file(&target);
            SevenError::Io(format!(
                "Arquivo copiado para quarentena, mas a origem não pôde ser removida: {remove_error}",
            ))
        })?;
    }

    let metadata_path = target.with_file_name(format!(
        "{}.seven-error.json",
        target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("arquivo"),
    ));
    let payload = serde_json::json!({
        "watcherId": watcher_id,
        "originalPath": source.to_string_lossy(),
        "quarantinedPath": target.to_string_lossy(),
        "reason": reason,
        "attempts": attempts,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    if let Ok(serialized) = serde_json::to_string_pretty(&payload) {
        let _ = fs::write(metadata_path, serialized);
    }

    Ok(target)
}

fn start_conversion_job(
    app: &AppHandle,
    state: &AppState,
    input: &Path,
    output: &Path,
    cache_dir: &Path,
    libreoffice: &Path,
    ghostscript: Option<&Path>,
    options: &conversion::ConversionOptions,
    preset_label: &str,
) -> Result<jobs::JobStart, SevenError> {
    if !options.requires_postprocess() {
        let args = vec![
            "--headless".into(),
            "--convert-to".into(),
            "pdf".into(),
            "--outdir".into(),
            output.to_string_lossy().into_owned(),
            input.to_string_lossy().into_owned(),
        ];
        return Ok(jobs::start_process_job(
            app.clone(),
            state,
            "watch-folder-convert",
            libreoffice.to_path_buf(),
            args,
            Some(output.to_path_buf()),
        ));
    }

    let ghostscript = ghostscript.ok_or_else(|| {
        SevenError::CapabilityUnavailable("Ghostscript".into())
    })?;
    let job_temp = cache_dir
        .join("jobs")
        .join(format!("watch-{}", Uuid::new_v4()));
    fs::create_dir_all(&job_temp).map_err(|error| SevenError::Io(error.to_string()))?;

    let stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("documento");
    let intermediate = job_temp.join(format!("{stem}.pdf"));
    let final_output = output.join(format!("{stem}.pdf"));
    let libreoffice_args = vec![
        "--headless".into(),
        "--convert-to".into(),
        "pdf".into(),
        "--outdir".into(),
        job_temp.to_string_lossy().into_owned(),
        input.to_string_lossy().into_owned(),
    ];

    let prefix = match options.write_standard_prefix(&job_temp) {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_dir_all(&job_temp);
            return Err(error);
        }
    };
    let ghostscript_args =
        match options.ghostscript_args(&intermediate, &final_output, prefix.as_deref()) {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_dir_all(&job_temp);
                return Err(error);
            }
        };

    Ok(jobs::start_process_sequence_job_with_cleanup(
        app.clone(),
        state,
        "watch-folder-convert",
        vec![
            jobs::ProcessStep {
                program: libreoffice.to_path_buf(),
                args: libreoffice_args,
                label: "Convertendo documento para PDF".into(),
            },
            jobs::ProcessStep {
                program: ghostscript.to_path_buf(),
                args: ghostscript_args,
                label: format!("Aplicando preset {preset_label}"),
            },
        ],
        Some(final_output),
        vec![job_temp],
    ))
}

pub fn start(
    app: AppHandle,
    state: &AppState,
    config: WatchFolderConfig,
) -> Result<WatchFolderConfig, SevenError> {
    let (config, input, output, quarantine) = validate_config(config)?;

    if let Some(existing) = state.watch_folders.lock().remove(&config.id) {
        existing.stop.store(true, Ordering::Relaxed);
    }

    let stop = Arc::new(AtomicBool::new(false));
    state.watch_folders.lock().insert(
        config.id.clone(),
        WatchFolderRuntime {
            config: config.clone(),
            stop: stop.clone(),
        },
    );

    if !config.enabled {
        return Ok(config);
    }

    let libreoffice = jobs::require_executable(&["soffice", "libreoffice"], "LibreOffice")?;
    let conversion_options = config
        .conversion_options
        .clone()
        .unwrap_or_else(|| conversion::ConversionOptions::from_legacy_preset(&config.preset));
    conversion_options.validate()?;
    let ghostscript = if conversion_options.requires_postprocess() {
        Some(jobs::require_executable(
            &["gswin64c", "gswin32c", "gs"],
            "Ghostscript",
        )?)
    } else {
        None
    };

    let id = config.id.clone();
    let extensions = config.extensions.clone();
    let recursive = config.recursive;
    let preset_label = config
        .preset_name
        .clone()
        .unwrap_or_else(|| config.preset.clone());
    let max_retries = config.max_retries;
    let retry_backoff_seconds = config.retry_backoff_seconds;
    let quarantine_enabled = config.quarantine_enabled;
    let conversion_options = conversion_options.clone();
    let cache_dir = state.cache_dir.clone();
    let jobs_state = AppState {
        documents: state.documents.clone(),
        jobs: state.jobs.clone(),
        watch_folders: state.watch_folders.clone(),
        cache_dir: state.cache_dir.clone(),
        resource_dir: state.resource_dir.clone(),
    };
    let app_thread = app.clone();

    thread::spawn(move || {
        let mut known: HashMap<PathBuf, FileSnapshot> = HashMap::new();
        let mut converted: HashMap<PathBuf, (u64, Option<SystemTime>)> = HashMap::new();
        let mut pending: HashMap<PathBuf, PendingConversion> = HashMap::new();
        let mut retries: HashMap<PathBuf, RetryState> = HashMap::new();

        let mut baseline = Vec::new();
        if collect_files(&input, recursive, &extensions, &mut baseline).is_ok() {
            for path in baseline {
                if let Ok(metadata) = fs::metadata(&path) {
                    converted.insert(path, (metadata.len(), metadata.modified().ok()));
                }
            }
        }

        let _ = app_thread.emit(
            "seven://watch-folder",
            WatchFolderEvent {
                watcher_id: id.clone(),
                state: "watching".into(),
                path: None,
                detail: format!(
                    "Pasta monitorada ativa · retry {} · backoff {}s{}",
                    max_retries,
                    retry_backoff_seconds,
                    if quarantine_enabled {
                        " · quarentena ativa"
                    } else {
                        ""
                    },
                ),
            },
        );

        while !stop.load(Ordering::Relaxed) {
            let pending_paths = pending.keys().cloned().collect::<Vec<_>>();
            for path in pending_paths {
                let Some(item) = pending.get(&path).cloned() else {
                    continue;
                };
                let status = jobs_state
                    .jobs
                    .lock()
                    .get(&item.job_id)
                    .map(|runtime| runtime.status.clone());
                let Some(status) = status else {
                    continue;
                };

                match status.state.as_str() {
                    "completed" => {
                        converted.insert(path.clone(), (item.size, item.modified));
                        pending.remove(&path);
                        retries.remove(&path);
                        let _ = app_thread.emit(
                            "seven://watch-folder",
                            WatchFolderEvent {
                                watcher_id: id.clone(),
                                state: "completed".into(),
                                path: Some(path.to_string_lossy().into_owned()),
                                detail: format!("Conversão concluída · {}", item.job_id),
                            },
                        );
                    }
                    "failed" => {
                        pending.remove(&path);
                        let error = status
                            .error
                            .unwrap_or_else(|| "Conversão falhou sem detalhe adicional".into());

                        if item.attempt < max_retries {
                            let next_attempt = item.attempt.saturating_add(1);
                            let delay = retry_delay(retry_backoff_seconds, next_attempt);
                            retries.insert(
                                path.clone(),
                                RetryState {
                                    size: item.size,
                                    modified: item.modified,
                                    attempt: next_attempt,
                                    next_retry: Instant::now() + delay,
                                    last_error: error.clone(),
                                },
                            );
                            let _ = app_thread.emit(
                                "seven://watch-folder",
                                WatchFolderEvent {
                                    watcher_id: id.clone(),
                                    state: "retry".into(),
                                    path: Some(path.to_string_lossy().into_owned()),
                                    detail: format!(
                                        "Falhou; nova tentativa {}/{} em {}s · {}",
                                        next_attempt,
                                        max_retries,
                                        delay.as_secs(),
                                        error,
                                    ),
                                },
                            );
                        } else if quarantine_enabled {
                            match quarantine.as_deref() {
                                Some(directory) => match move_to_quarantine(
                                    &path,
                                    directory,
                                    &id,
                                    &error,
                                    item.attempt.saturating_add(1),
                                ) {
                                    Ok(target) => {
                                        known.remove(&path);
                                        retries.remove(&path);
                                        converted.remove(&path);
                                        let _ = app_thread.emit(
                                            "seven://watch-folder",
                                            WatchFolderEvent {
                                                watcher_id: id.clone(),
                                                state: "quarantined".into(),
                                                path: Some(target.to_string_lossy().into_owned()),
                                                detail: format!(
                                                    "Falhou após {} tentativa(s) e foi movido para quarentena · {}",
                                                    item.attempt.saturating_add(1),
                                                    error,
                                                ),
                                            },
                                        );
                                    }
                                    Err(quarantine_error) => {
                                        converted.insert(
                                            path.clone(),
                                            (item.size, item.modified),
                                        );
                                        let _ = app_thread.emit(
                                            "seven://watch-folder",
                                            WatchFolderEvent {
                                                watcher_id: id.clone(),
                                                state: "quarantine-error".into(),
                                                path: Some(path.to_string_lossy().into_owned()),
                                                detail: format!(
                                                    "Conversão falhou e a quarentena também falhou: {quarantine_error}. Erro original: {error}",
                                                ),
                                            },
                                        );
                                    }
                                },
                                None => {}
                            }
                        } else {
                            converted.insert(path.clone(), (item.size, item.modified));
                            let _ = app_thread.emit(
                                "seven://watch-folder",
                                WatchFolderEvent {
                                    watcher_id: id.clone(),
                                    state: "failed".into(),
                                    path: Some(path.to_string_lossy().into_owned()),
                                    detail: format!(
                                        "Conversão falhou após {} tentativa(s) · {}",
                                        item.attempt.saturating_add(1),
                                        error,
                                    ),
                                },
                            );
                        }
                    }
                    "cancelled" => {
                        pending.remove(&path);
                        retries.remove(&path);
                        converted.insert(path.clone(), (item.size, item.modified));
                        let _ = app_thread.emit(
                            "seven://watch-folder",
                            WatchFolderEvent {
                                watcher_id: id.clone(),
                                state: "cancelled".into(),
                                path: Some(path.to_string_lossy().into_owned()),
                                detail: "Job cancelado; o mesmo arquivo não será reenfileirado até ser alterado".into(),
                            },
                        );
                    }
                    _ => {}
                }
            }

            let mut files = Vec::new();
            if let Err(error) = collect_files(&input, recursive, &extensions, &mut files) {
                let _ = app_thread.emit(
                    "seven://watch-folder",
                    WatchFolderEvent {
                        watcher_id: id.clone(),
                        state: "error".into(),
                        path: None,
                        detail: error.to_string(),
                    },
                );
                thread::sleep(Duration::from_secs(5));
                continue;
            }

            let mut seen = HashSet::new();
            for path in files {
                seen.insert(path.clone());
                if pending.contains_key(&path) {
                    continue;
                }

                let Ok(metadata) = fs::metadata(&path) else {
                    continue;
                };
                let size = metadata.len();
                let modified = metadata.modified().ok();

                if converted
                    .get(&path)
                    .is_some_and(|previous| previous.0 == size && previous.1 == modified)
                {
                    continue;
                }

                if let Some(retry) = retries.get(&path).cloned() {
                    if retry.size != size || retry.modified != modified {
                        retries.remove(&path);
                    } else if Instant::now() < retry.next_retry {
                        continue;
                    } else {
                        match start_conversion_job(
                            &app_thread,
                            &jobs_state,
                            &path,
                            &output,
                            &cache_dir,
                            &libreoffice,
                            ghostscript.as_deref(),
                            &conversion_options,
                            &preset_label,
                        ) {
                            Ok(started) => {
                                pending.insert(
                                    path.clone(),
                                    PendingConversion {
                                        job_id: started.job_id.clone(),
                                        size,
                                        modified,
                                        attempt: retry.attempt,
                                    },
                                );
                                retries.remove(&path);
                                let _ = app_thread.emit(
                                    "seven://watch-folder",
                                    WatchFolderEvent {
                                        watcher_id: id.clone(),
                                        state: "queued".into(),
                                        path: Some(path.to_string_lossy().into_owned()),
                                        detail: format!(
                                            "Retry {}/{} adicionado à fila · {} · erro anterior: {}",
                                            retry.attempt,
                                            max_retries,
                                            started.job_id,
                                            retry.last_error,
                                        ),
                                    },
                                );
                            }
                            Err(error) => {
                                let next_attempt = retry.attempt.saturating_add(1);
                                if retry.attempt < max_retries {
                                    let delay =
                                        retry_delay(retry_backoff_seconds, next_attempt);
                                    retries.insert(
                                        path.clone(),
                                        RetryState {
                                            size,
                                            modified,
                                            attempt: next_attempt,
                                            next_retry: Instant::now() + delay,
                                            last_error: error.to_string(),
                                        },
                                    );
                                } else {
                                    converted.insert(path.clone(), (size, modified));
                                    let _ = app_thread.emit(
                                        "seven://watch-folder",
                                        WatchFolderEvent {
                                            watcher_id: id.clone(),
                                            state: "failed".into(),
                                            path: Some(path.to_string_lossy().into_owned()),
                                            detail: error.to_string(),
                                        },
                                    );
                                }
                            }
                        }
                        continue;
                    }
                }

                let snapshot = known.entry(path.clone()).or_insert(FileSnapshot {
                    size,
                    modified,
                    stable_checks: 0,
                });
                if snapshot.size == size && snapshot.modified == modified {
                    snapshot.stable_checks = snapshot.stable_checks.saturating_add(1);
                } else {
                    snapshot.size = size;
                    snapshot.modified = modified;
                    snapshot.stable_checks = 0;
                }

                if snapshot.stable_checks < 2 {
                    continue;
                }

                match start_conversion_job(
                    &app_thread,
                    &jobs_state,
                    &path,
                    &output,
                    &cache_dir,
                    &libreoffice,
                    ghostscript.as_deref(),
                    &conversion_options,
                    &preset_label,
                ) {
                    Ok(started) => {
                        pending.insert(
                            path.clone(),
                            PendingConversion {
                                job_id: started.job_id.clone(),
                                size,
                                modified,
                                attempt: 0,
                            },
                        );
                        known.remove(&path);
                        let _ = app_thread.emit(
                            "seven://watch-folder",
                            WatchFolderEvent {
                                watcher_id: id.clone(),
                                state: "queued".into(),
                                path: Some(path.to_string_lossy().into_owned()),
                                detail: format!(
                                    "Conversão adicionada à fila · {}",
                                    started.job_id,
                                ),
                            },
                        );
                    }
                    Err(error) => {
                        if max_retries > 0 {
                            let delay = retry_delay(retry_backoff_seconds, 1);
                            retries.insert(
                                path.clone(),
                                RetryState {
                                    size,
                                    modified,
                                    attempt: 1,
                                    next_retry: Instant::now() + delay,
                                    last_error: error.to_string(),
                                },
                            );
                            let _ = app_thread.emit(
                                "seven://watch-folder",
                                WatchFolderEvent {
                                    watcher_id: id.clone(),
                                    state: "retry".into(),
                                    path: Some(path.to_string_lossy().into_owned()),
                                    detail: format!(
                                        "Falha antes de iniciar; retry 1/{} em {}s · {}",
                                        max_retries,
                                        delay.as_secs(),
                                        error,
                                    ),
                                },
                            );
                        } else if quarantine_enabled {
                            if let Some(directory) = quarantine.as_deref() {
                                match move_to_quarantine(&path, directory, &id, &error.to_string(), 1)
                                {
                                    Ok(target) => {
                                        let _ = app_thread.emit(
                                            "seven://watch-folder",
                                            WatchFolderEvent {
                                                watcher_id: id.clone(),
                                                state: "quarantined".into(),
                                                path: Some(target.to_string_lossy().into_owned()),
                                                detail: format!(
                                                    "Falha antes de iniciar e foi movido para quarentena · {error}",
                                                ),
                                            },
                                        );
                                    }
                                    Err(quarantine_error) => {
                                        converted.insert(path.clone(), (size, modified));
                                        let _ = app_thread.emit(
                                            "seven://watch-folder",
                                            WatchFolderEvent {
                                                watcher_id: id.clone(),
                                                state: "quarantine-error".into(),
                                                path: Some(path.to_string_lossy().into_owned()),
                                                detail: quarantine_error.to_string(),
                                            },
                                        );
                                    }
                                }
                            }
                        } else {
                            converted.insert(path.clone(), (size, modified));
                            let _ = app_thread.emit(
                                "seven://watch-folder",
                                WatchFolderEvent {
                                    watcher_id: id.clone(),
                                    state: "failed".into(),
                                    path: Some(path.to_string_lossy().into_owned()),
                                    detail: error.to_string(),
                                },
                            );
                        }
                        known.remove(&path);
                    }
                }
            }

            known.retain(|path, _| seen.contains(path));
            retries.retain(|path, _| seen.contains(path));
            thread::sleep(Duration::from_secs(2));
        }

        let _ = app_thread.emit(
            "seven://watch-folder",
            WatchFolderEvent {
                watcher_id: id,
                state: "stopped".into(),
                path: None,
                detail: "Monitoramento encerrado".into(),
            },
        );
    });

    Ok(config)
}

pub fn stop(state: &AppState, id: &str) -> Result<(), SevenError> {
    let runtime = state
        .watch_folders
        .lock()
        .remove(id)
        .ok_or_else(|| SevenError::OperationRejected("Pasta monitorada não está ativa".into()))?;
    runtime.stop.store(true, Ordering::Relaxed);
    Ok(())
}

pub fn list(state: &AppState) -> Vec<WatchFolderConfig> {
    let mut output = state
        .watch_folders
        .lock()
        .values()
        .map(|runtime| runtime.config.clone())
        .collect::<Vec<_>>();
    output.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
    });
    output
}
