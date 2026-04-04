use crate::db::Database;
use crate::use_cases;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Listener, Manager};
use tauri_plugin_clipboard::Clipboard;
use tokio::sync::mpsc;

const TWENTY_FOUR_HOURS: i64 = 24 * 60 * 60;

struct ImageJob {
    bytes: Vec<u8>,
    images_dir: PathBuf,
}

pub fn start(app: &AppHandle, db: Arc<Database>, images_dir: PathBuf) {
    fs::create_dir_all(&images_dir).ok();

    let clipboard = app.state::<Clipboard>();
    clipboard.start_monitor(app.clone()).ok();

    // Periodic cleanup: remove items not copied within 24h
    let cleanup_db = db.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            let removed = cleanup_db
                .delete_expired_items(TWENTY_FOUR_HOURS)
                .unwrap_or_default();
            for path in removed {
                fs::remove_file(&path).ok();
            }
        }
    });

    // Image processing worker — keeps heavy work off the clipboard listener thread
    let (tx, mut rx) = mpsc::channel::<ImageJob>(32);
    let image_db = db.clone();
    let image_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(job) = rx.recv().await {
            let db = image_db.clone();
            let app = image_app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                use_cases::save_image(&app, &db, job.bytes, &job.images_dir);
            })
            .await
            .ok();
        }
    });

    let app_handle = app.clone();
    app.listen("plugin:clipboard://clipboard-monitor/update", move |_event| {
        let clipboard = app_handle.state::<Clipboard>();

        if let Ok(types) = clipboard.available_types() {
            if types.image {
                if let Ok(bytes) = clipboard.read_image_binary() {
                    if !bytes.is_empty() {
                        if let Err(e) = tx.try_send(ImageJob {
                            bytes,
                            images_dir: images_dir.clone(),
                        }) {
                            eprintln!("[bark] image clipboard event dropped: {}", e);
                        }
                    }
                }
            } else if types.text {
                if let Ok(text) = clipboard.read_text() {
                    if !text.trim().is_empty() {
                        use_cases::save_text(&app_handle, &db, text);
                    }
                }
            }
        } else {
            // Fallback when available_types() fails
            if let Ok(text) = clipboard.read_text() {
                if !text.trim().is_empty() {
                    use_cases::save_text(&app_handle, &db, text);
                    return;
                }
            }
            if let Ok(bytes) = clipboard.read_image_binary() {
                if !bytes.is_empty() {
                    if let Err(e) = tx.try_send(ImageJob {
                        bytes,
                        images_dir: images_dir.clone(),
                    }) {
                        eprintln!("[bark] image clipboard event dropped: {}", e);
                    }
                }
            }
        }
    });
}
