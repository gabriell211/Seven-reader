use crate::{
    error::SevenError,
    jobs,
    state::{AppState, WatchFolderRuntime},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread,
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFolderConfig {
    pub id: String,
    pub name: String,
    pub input_directory: String,
    pub output_directory: String,
    pub recursive: bool,
    pub enabled: bool,
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

fn supported_extension(path: &Path, extensions: &[String]) -> bool {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
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

fn validate_config(mut config: WatchFolderConfig) -> Result<(WatchFolderConfig, PathBuf, PathBuf), SevenError> {
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
    let allowed = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "html", "htm"];
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
    if config.id.trim().is_empty() {
        config.id = Uuid::new_v4().to_string();
    }
    Ok((config, input, output))
}

pub fn start(
    app: AppHandle,
    state: &AppState,
    config: WatchFolderConfig,
) -> Result<WatchFolderConfig, SevenError> {
    let (config, input, output) = validate_config(config)?;
    let executable = jobs::require_executable(&["soffice", "libreoffice"], "LibreOffice")?;

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

    let id = config.id.clone();
    let extensions = config.extensions.clone();
    let recursive = config.recursive;
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

        // Baseline existing files so enabling a watcher does not unexpectedly process an old archive.
        let mut baseline = Vec::new();
        if collect_files(&input, recursive, &extensions, &mut baseline).is_ok() {
            for path in baseline {
                if let Ok(metadata) = fs::metadata(&path) {
                    converted.insert(path, (metadata.len(), metadata.modified().ok()));
                }
            }
        }

        let _ = app_thread.emit("seven://watch-folder", WatchFolderEvent {
            watcher_id: id.clone(),
            state: "watching".into(),
            path: None,
            detail: "Pasta monitorada ativa".into(),
        });

        while !stop.load(Ordering::Relaxed) {
            let mut files = Vec::new();
            if let Err(error) = collect_files(&input, recursive, &extensions, &mut files) {
                let _ = app_thread.emit("seven://watch-folder", WatchFolderEvent {
                    watcher_id: id.clone(),
                    state: "error".into(),
                    path: None,
                    detail: error.to_string(),
                });
                thread::sleep(Duration::from_secs(5));
                continue;
            }

            let mut seen = std::collections::HashSet::new();
            for path in files {
                seen.insert(path.clone());
                let Ok(metadata) = fs::metadata(&path) else { continue };
                let size = metadata.len();
                let modified = metadata.modified().ok();

                if converted.get(&path).is_some_and(|previous| previous.0 == size && previous.1 == modified) {
                    continue;
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

                let args = vec![
                    "--headless".into(),
                    "--convert-to".into(),
                    "pdf".into(),
                    "--outdir".into(),
                    output.to_string_lossy().into_owned(),
                    path.to_string_lossy().into_owned(),
                ];
                let started = jobs::start_process_job(
                    app_thread.clone(),
                    &jobs_state,
                    "watch-folder-convert",
                    executable.clone(),
                    args,
                    Some(output.clone()),
                );
                converted.insert(path.clone(), (size, modified));
                known.remove(&path);

                let _ = app_thread.emit("seven://watch-folder", WatchFolderEvent {
                    watcher_id: id.clone(),
                    state: "queued".into(),
                    path: Some(path.to_string_lossy().into_owned()),
                    detail: format!("Conversão adicionada à fila · {}", started.job_id),
                });
            }

            known.retain(|path, _| seen.contains(path));
            thread::sleep(Duration::from_secs(2));
        }

        let _ = app_thread.emit("seven://watch-folder", WatchFolderEvent {
            watcher_id: id,
            state: "stopped".into(),
            path: None,
            detail: "Monitoramento encerrado".into(),
        });
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
    output.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    output
}
