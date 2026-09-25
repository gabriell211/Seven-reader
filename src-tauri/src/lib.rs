mod advanced;
mod annotations;
mod capabilities;
mod commands;
mod document_ops;
mod editing;
mod error;
mod forms;
mod jobs;
mod ocr;
mod pdf;
mod redaction;
mod signatures;
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
            commands::start_delete_pages,
            commands::start_insert_pages,
            commands::start_replace_pages,
            commands::start_ocr,
            commands::start_optimize_pdf,
            commands::find_redaction_matches,
            commands::apply_redactions,
            commands::edit_add_text,
            commands::edit_replace_text,
            commands::edit_add_image,
            commands::edit_add_link,
            commands::edit_overlay_text,
            commands::edit_set_background,
            commands::inspect_advanced_pdf,
            commands::add_pdf_attachment,
            commands::extract_pdf_attachment,
            commands::add_pdf_bookmark,
            commands::rename_pdf_bookmark,
            commands::set_pdf_layer_visibility,
            commands::list_annotations,
            commands::add_annotation,
            commands::delete_annotation,
            commands::list_form_fields,
            commands::fill_form_fields,
            commands::create_form_field,
            commands::get_document_metadata,
            commands::update_document_metadata,
            commands::sanitize_document,
            commands::get_accessibility_report,
            commands::compare_documents,
            commands::start_encrypt_pdf,
            commands::start_decrypt_pdf,
            commands::start_convert_to_pdf,
            commands::start_export_pdf,
            commands::sign_document,
            commands::validate_signatures,
            commands::list_pdf_files_in_folder,
            commands::start_print_document,
            commands::reveal_in_file_manager,
            commands::get_job_status,
            commands::cancel_job,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Seven Reader");
}
