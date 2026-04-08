use crate::commands::ClipboardItemResponse;
use crate::db::{ClipboardItem, Database};
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard::Clipboard;

pub fn save_text(app: &AppHandle, db: &Arc<Database>, text: String) {
    let hash = sha256_hex(text.as_bytes());

    if db.hash_exists(&hash) {
        log::debug!("Text already in history (duplicate), skipping");
        return;
    }

    match db.insert_item("text", Some(&text), None, None, Some(&hash)) {
        Ok(item) => {
            log::debug!("Text item saved (id={})", item.id);
            enforce_and_emit(app, db, &item);
        }
        Err(e) => {
            log::error!("Failed to save text item: {}", e);
        }
    }
}

pub fn save_image(app: &AppHandle, db: &Arc<Database>, bytes: Vec<u8>, images_dir: &PathBuf) {
    let hash = sha256_hex(&bytes);

    if db.hash_exists(&hash) {
        log::debug!("Image already in history (duplicate), skipping");
        return;
    }

    let hash_short = &hash[..12];
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let filename = format!("{}_{}.png", timestamp, hash_short);
    let full_path = images_dir.join(&filename);

    if let Err(e) = fs::write(&full_path, &bytes) {
        log::error!("Failed to write image to disk at {}: {}", full_path.display(), e);
        return;
    }

    let thumb_bytes = generate_thumbnail(&bytes).unwrap_or_default();
    let path_str = full_path.to_string_lossy().to_string();
    let thumb = if thumb_bytes.is_empty() { None } else { Some(thumb_bytes.as_slice()) };

    match db.insert_item("image", None, Some(&path_str), thumb, Some(&hash)) {
        Ok(item) => {
            log::debug!("Image item saved (id={}, path={})", item.id, path_str);
            enforce_and_emit(app, db, &item);
        }
        Err(e) => {
            log::error!("Failed to save image item to DB: {}", e);
            fs::remove_file(&full_path).ok();
        }
    }
}

pub fn copy_item(
    app: &AppHandle,
    db: &Arc<Database>,
    clipboard: &Clipboard,
    id: i64,
) -> Result<(), String> {
    let item = db
        .get_item_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| {
            log::warn!("copy_item: item id={} not found", id);
            "Item not found".to_string()
        })?;

    match item.content_type.as_str() {
        "text" => {
            let text = item
                .text_content
                .ok_or_else(|| "Text item has no content".to_string())?;
            clipboard.write_text(text).map_err(|e| {
                log::error!("Failed to write text to clipboard: {}", e);
                e.to_string()
            })?;
        }
        "image" => {
            let path = item
                .image_path
                .ok_or_else(|| "Image item has no path".to_string())?;
            let bytes = fs::read(&path).map_err(|e| {
                log::error!("Failed to read image file at {}: {}", path, e);
                e.to_string()
            })?;
            clipboard.write_image_binary(bytes).map_err(|e| {
                log::error!("Failed to write image to clipboard: {}", e);
                e.to_string()
            })?;
        }
        other => {
            log::warn!("copy_item: unknown content type '{}' for id={}", other, id);
            return Err("Unknown content type".into());
        }
    }

    db.mark_as_copied(id).ok();
    crate::tray_animation::animate_ears(app.clone());
    Ok(())
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

fn enforce_and_emit(app: &AppHandle, db: &Arc<Database>, item: &ClipboardItem) {
    let max_items = db.get_max_items();
    let removed_paths = db.enforce_max_items(max_items).unwrap_or_default();
    for path in removed_paths {
        fs::remove_file(&path).ok();
    }
    app.emit("clipboard://new-item", ClipboardItemResponse::from(item.clone())).ok();
}

fn generate_thumbnail(image_bytes: &[u8]) -> Option<Vec<u8>> {
    let img = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;
    let thumb = img.thumbnail(64, 64);
    let mut buf = Vec::new();
    thumb.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png).ok()?;
    Some(buf)
}
