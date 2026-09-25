use parking_lot::Mutex;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};

#[derive(Debug, Clone)]
pub struct OpenDocument {
    pub id: String,
    pub path: PathBuf,
    pub name: String,
    pub password: Option<String>,
    pub page_count: usize,
    pub file_size: u64,
    pub pdf_version: Option<String>,
    pub encrypted: bool,
    pub has_signatures: bool,
    pub has_forms: bool,
    pub revision: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatus {
    pub id: String,
    pub kind: String,
    pub state: String,
    pub stage: String,
    pub progress: Option<f64>,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct JobRuntime {
    pub status: JobStatus,
    pub cancel: Arc<AtomicBool>,
}

pub struct AppState {
    pub documents: Arc<Mutex<HashMap<String, OpenDocument>>>,
    pub jobs: Arc<Mutex<HashMap<String, JobRuntime>>>,
    pub cache_dir: PathBuf,
    pub resource_dir: PathBuf,
}

impl AppState {
    pub fn new(cache_dir: PathBuf, resource_dir: PathBuf) -> Self {
        Self {
            documents: Arc::new(Mutex::new(HashMap::new())),
            jobs: Arc::new(Mutex::new(HashMap::new())),
            cache_dir,
            resource_dir,
        }
    }
}
