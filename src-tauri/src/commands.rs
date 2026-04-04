use crate::db::{ClipboardItem, Database};
use crate::use_cases;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tauri_plugin_clipboard::Clipboard;

#[derive(Serialize)]
pub struct ClipboardItemResponse {
    pub id: i64,
    pub content_type: String,
    pub text_content: Option<String>,
    pub image_path: Option<String>,
    pub image_thumb_base64: Option<String>,
    pub hash: Option<String>,
    pub pinned: bool,
    pub created_at: i64,
    pub last_copied_at: Option<i64>,
}

impl From<ClipboardItem> for ClipboardItemResponse {
    fn from(item: ClipboardItem) -> Self {
        let image_thumb_base64 = item
            .image_thumb
            .as_ref()
            .map(|b| base64::engine::general_purpose::STANDARD.encode(b));
        Self {
            id: item.id,
            content_type: item.content_type,
            text_content: item.text_content,
            image_path: item.image_path,
            image_thumb_base64,
            hash: item.hash,
            pinned: item.pinned,
            created_at: item.created_at,
            last_copied_at: item.last_copied_at,
        }
    }
}

#[tauri::command]
pub fn get_clipboard_history(
    db: State<'_, Arc<Database>>,
    page: u32,
    limit: u32,
) -> Result<Vec<ClipboardItemResponse>, String> {
    db.get_items(page, limit)
        .map(|items| items.into_iter().map(ClipboardItemResponse::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_clipboard_history(
    db: State<'_, Arc<Database>>,
    query: String,
    limit: u32,
) -> Result<Vec<ClipboardItemResponse>, String> {
    db.search_items(&query, limit)
        .map(|items| items.into_iter().map(ClipboardItemResponse::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_item_by_id(
    db: State<'_, Arc<Database>>,
    id: i64,
) -> Result<Option<ClipboardItemResponse>, String> {
    db.get_item_by_id(id)
        .map(|opt| opt.map(ClipboardItemResponse::from))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_item(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    clipboard: State<'_, Clipboard>,
    id: i64,
) -> Result<(), String> {
    use_cases::copy_item(&app, &db, &*clipboard, id)
}

#[tauri::command]
pub fn delete_item(db: State<'_, Arc<Database>>, id: i64) -> Result<(), String> {
    if let Some(image_path) = db.delete_item(id).map_err(|e| e.to_string())? {
        fs::remove_file(&image_path).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn clear_history(db: State<'_, Arc<Database>>) -> Result<(), String> {
    let image_paths = db.clear_all().map_err(|e| e.to_string())?;
    for path in image_paths {
        fs::remove_file(&path).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings(db: State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let max_items = db.get_max_items();
    Ok(serde_json::json!({ "max_items": max_items }))
}

#[tauri::command]
pub fn update_settings(db: State<'_, Arc<Database>>, max_items: u32) -> Result<(), String> {
    db.set_setting("max_items", &max_items.to_string())
        .map_err(|e| e.to_string())?;
    let removed_paths = db.enforce_max_items(max_items).unwrap_or_default();
    for path in removed_paths {
        fs::remove_file(&path).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn upload_file(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    images_dir: State<'_, PathBuf>,
    _name: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    use_cases::save_image(&app, &db, bytes, &images_dir);
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
