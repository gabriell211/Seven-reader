mod advanced;
mod annotations;
mod capabilities;
mod catalog;
mod commands;
mod document_ops;
mod editing;
mod error;
mod forms;
mod jobs;
mod ocr;
mod optimizer;
mod pdf;
mod print_production;
mod redaction;
mod search;
mod session;
mod shared_review;
mod signatures;
mod state;

use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
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
            commands::export_review_xfdf,
            commands::session_import_review_xfdf,
            commands::build_catalog,
            commands::list_catalogs,
            commands::search_catalog,
            commands::delete_catalog,
            commands::open_document,
            commands::restore_document_session,
            commands::close_document,
            commands::render_page,
            commands::search_document,
            commands::search_document_advanced,
            commands::extract_text_in_rect,
            commands::crop_page_selection,
            commands::save_document,
            commands::undo_document,
            commands::redo_document,
            commands::session_add_annotation,
            commands::session_delete_annotation,
            commands::session_add_ink,
            commands::session_add_markup,
            commands::session_edit_add_text,
            commands::session_edit_replace_text,
            commands::get_image_dimensions,
            commands::list_page_image_objects,
            commands::session_replace_image_object,
            commands::session_remove_image_object,
            commands::session_edit_add_image,
            commands::session_edit_add_link,
            commands::session_edit_overlay_text,
            commands::session_edit_set_background,
            commands::session_fill_form_fields,
            commands::session_create_form_field,
            commands::list_form_field_actions,
            commands::session_set_form_field_action,
            commands::session_delete_form_field_action,
            commands::session_duplicate_form_field,
            commands::session_set_page_tab_order,
            commands::export_form_data,
            commands::session_import_form_data,
            commands::session_reset_form,
            commands::session_update_form_field,
            commands::session_delete_form_field,
            commands::session_add_pdf_bookmark,
            commands::session_rename_pdf_bookmark,
            commands::session_delete_pdf_bookmark,
            commands::session_move_pdf_bookmark,
            commands::session_set_pdf_bookmark_open,
            commands::session_add_pdf_attachment,
            commands::session_update_pdf_attachment,
            commands::session_remove_pdf_attachment,
            commands::session_apply_pdf_layer_overrides,
            commands::session_reset_pdf_layer_visibility,
            commands::session_update_pdf_layer_properties,
            commands::session_set_pdf_layer_visibility,
            commands::session_update_document_metadata,
            commands::save_document_as,
            commands::create_blank_document,
            commands::create_pdf_from_clipboard_image,
            commands::create_pdf_from_text,
            commands::start_web_to_pdf,
            commands::create_pdf_from_images,
            commands::start_ocr_advanced,
            commands::start_batch_ocr,
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
            commands::get_optimization_audit,
            commands::start_optimize_pdf_advanced,
            commands::start_optimize_pdf,
            commands::start_batch_optimize_pdf,
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
            commands::add_ink_annotation,
            commands::delete_annotation,
            commands::list_form_fields,
            commands::fill_form_fields,
            commands::create_form_field,
            commands::get_print_preflight,
            commands::session_set_page_boxes,
            commands::list_pdf_actions,
            commands::get_document_metadata,
            commands::update_document_metadata,
            commands::sanitize_document,
            commands::get_accessibility_report,
            commands::compare_documents,
            commands::start_encrypt_pdf,
            commands::start_decrypt_pdf,
            commands::start_convert_to_pdf,
            commands::start_batch_convert_to_pdf,
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
