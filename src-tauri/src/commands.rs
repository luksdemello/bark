use crate::db::{ClipboardItem, Database};
use base64::Engine;
use serde::Serialize;
use std::fs;
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
    pub created_at: i64,
    pub last_copied_at: Option<i64>,
}

impl From<ClipboardItem> for ClipboardItemResponse {
    fn from(item: ClipboardItem) -> Self {
        let image_thumb_base64 = item.image_thumb.as_ref().map(|bytes| {
            base64::engine::general_purpose::STANDARD.encode(bytes)
        });
        Self {
            id: item.id,
            content_type: item.content_type,
            text_content: item.text_content,
            image_path: item.image_path,
            image_thumb_base64,
            created_at: item.created_at,
            last_copied_at: item.last_copied_at,
        }
    }
}

#[tauri::command]
pub fn get_clipboard_history(db: State<'_, Arc<Database>>, page: u32, limit: u32) -> Result<Vec<ClipboardItemResponse>, String> {
    db.get_items(page, limit)
        .map(|items| items.into_iter().map(ClipboardItemResponse::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_item(app: tauri::AppHandle, db: State<'_, Arc<Database>>, clipboard: State<'_, Clipboard>, id: i64) -> Result<(), String> {
    let items = db.get_items(0, 1000).map_err(|e| e.to_string())?;
    let item = items.into_iter().find(|i| i.id == id).ok_or("Item not found")?;

    match item.content_type.as_str() {
        "text" => {
            if let Some(text) = &item.text_content {
                clipboard.write_text(text.clone()).map_err(|e| e.to_string())?;
            }
        }
        "image" => {
            if let Some(path) = &item.image_path {
                let bytes = fs::read(path).map_err(|e| e.to_string())?;
                clipboard.write_image_binary(bytes).map_err(|e| e.to_string())?;
            }
        }
        _ => return Err("Unknown content type".into()),
    }

    // Mark as copied (prevents 24h auto-deletion)
    db.mark_as_copied(id).ok();

    // Trigger tray animation
    crate::tray_animation::animate_ears(app);

    Ok(())
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
    db.set_setting("max_items", &max_items.to_string()).map_err(|e| e.to_string())?;
    let removed_paths = db.enforce_max_items(max_items).unwrap_or_default();
    for path in removed_paths {
        fs::remove_file(&path).ok();
    }
    Ok(())
}
