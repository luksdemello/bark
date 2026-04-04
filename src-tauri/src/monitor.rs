use crate::db::Database;
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Listener, Manager};
use tauri_plugin_clipboard::Clipboard;

const TWENTY_FOUR_HOURS: i64 = 24 * 60 * 60;

pub fn start(app: &AppHandle, db: Arc<Database>, images_dir: PathBuf) {
    fs::create_dir_all(&images_dir).ok();

    let clipboard = app.state::<Clipboard>();
    clipboard.start_monitor(app.clone()).ok();

    // Periodic cleanup: remove items not copied within 24h (runs every 5 min)
    let cleanup_db = db.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            let removed_paths = cleanup_db.delete_expired_items(TWENTY_FOUR_HOURS).unwrap_or_default();
            for path in removed_paths {
                fs::remove_file(&path).ok();
            }
        }
    });

    let app_handle = app.clone();
    app.listen("plugin:clipboard://clipboard-monitor/update", move |_event| {
        let clipboard = app_handle.state::<Clipboard>();

        if let Ok(types) = clipboard.available_types() {
            if types.image {
                handle_image(&app_handle, &clipboard, &db, &images_dir);
            } else if types.text {
                handle_text(&app_handle, &clipboard, &db);
            }
        } else {
            // Fallback: try text first, then image
            if handle_text(&app_handle, &clipboard, &db) {
                return;
            }
            handle_image(&app_handle, &clipboard, &db, &images_dir);
        }
    });
}

fn handle_text(app: &AppHandle, clipboard: &Clipboard, db: &Arc<Database>) -> bool {
    let text = match clipboard.read_text() {
        Ok(t) if !t.trim().is_empty() => t,
        _ => return false,
    };

    // Deduplication: hash-based
    let text_hash = {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        format!("{:x}", hasher.finalize())
    };
    if db.hash_exists(&text_hash) {
        return true;
    }

    if let Ok(item) = db.insert_item("text", Some(&text), None, None, Some(&text_hash)) {
        let max_items = db.get_max_items();
        let removed_paths = db.enforce_max_items(max_items).unwrap_or_default();
        for path in removed_paths {
            fs::remove_file(&path).ok();
        }
        app.emit("clipboard://new-item", &item).ok();
    }
    true
}

fn handle_image(app: &AppHandle, clipboard: &Clipboard, db: &Arc<Database>, images_dir: &PathBuf) {
    let image_bytes = match clipboard.read_image_binary() {
        Ok(bytes) if !bytes.is_empty() => bytes,
        _ => return,
    };

    // Deduplication: hash-based
    let hash = {
        let mut hasher = Sha256::new();
        hasher.update(&image_bytes);
        format!("{:x}", hasher.finalize())
    };
    let hash_short = &hash[..12];

    if let Some(last) = db.get_items(0, 1).ok().and_then(|v| v.into_iter().next()) {
        if last.content_type == "image" {
            if let Some(ref path) = last.image_path {
                if path.contains(hash_short) {
                    return; // Same image
                }
            }
        }
    }

    // Save full image
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let filename = format!("{}_{}.png", timestamp, hash_short);
    let full_path = images_dir.join(&filename);

    if fs::write(&full_path, &image_bytes).is_err() {
        return;
    }

    // Generate thumbnail (~64px wide)
    let thumb_bytes = generate_thumbnail(&image_bytes).unwrap_or_default();

    let path_str = full_path.to_string_lossy().to_string();
    if let Ok(item) = db.insert_item("image", None, Some(&path_str), if thumb_bytes.is_empty() { None } else { Some(&thumb_bytes) }, Some(&hash)) {
        let max_items = db.get_max_items();
        let removed_paths = db.enforce_max_items(max_items).unwrap_or_default();
        for path in removed_paths {
            fs::remove_file(&path).ok();
        }
        app.emit("clipboard://new-item", &item).ok();
    }
}

fn generate_thumbnail(image_bytes: &[u8]) -> Option<Vec<u8>> {
    let img = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

    let thumb = img.thumbnail(64, 64);
    let mut buf = Vec::new();
    let mut cursor = Cursor::new(&mut buf);
    thumb.write_to(&mut cursor, image::ImageFormat::Png).ok()?;
    Some(buf)
}
