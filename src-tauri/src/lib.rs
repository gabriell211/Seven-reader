mod capabilities;
mod commands;
mod document_ops;
mod error;
mod jobs;
mod ocr;
mod pdf;
mod state;

use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let cache_dir = app.path().app_cache_dir()?.join("seven-reader");
            let resource_dir = app.path().resource_dir()?;
            fs::create_dir_all(cache_dir.join("render"))?;
            app.manage(state::AppState::new(cache_dir, resource_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_capabilities,
            commands::open_document,
            commands::close_document,
            commands::render_page,
            commands::search_document,
            commands::save_document_as,
            commands::create_blank_document,
            commands::create_pdf_from_images,
            commands::start_ocr_advanced,
            commands::review_ocr_page,
            commands::scan_page_to_pdf,
            commands::start_combine_documents,
            commands::start_split_pages,
            commands::start_extract_pages,
            commands::start_reorder_pages,
            commands::start_rotate_pages,
            commands::start_ocr,
            commands::start_optimize_pdf,
            commands::get_document_metadata,
            commands::update_document_metadata,
            commands::sanitize_document,
            commands::get_accessibility_report,
            commands::compare_documents,
            commands::start_encrypt_pdf,
            commands::start_decrypt_pdf,
            commands::start_convert_to_pdf,
            commands::start_export_pdf,
            commands::get_job_status,
            commands::cancel_job,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Seven Reader");
}
