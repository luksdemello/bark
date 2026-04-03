# Clipboard History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock clipboard data with a real clipboard history system that monitors the system clipboard, persists items in SQLite, and provides copy/delete actions with tray icon animation feedback.

**Architecture:** Backend-heavy Rust approach. The clipboard monitor, SQLite persistence, image storage, and clipboard write-back all live in Rust. The React frontend is a thin view layer that receives data via Tauri commands/events and dispatches user actions via `invoke()`.

**Tech Stack:** Tauri 2, React 19, TypeScript, tauri-plugin-clipboard, rusqlite (bundled SQLite), sha2, image crate

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/db.rs` (create) | SQLite database: schema init, CRUD for clipboard_items and settings |
| `src-tauri/src/monitor.rs` (create) | Clipboard monitor: start/stop, event handler, deduplication, image processing, 24h cleanup task |
| `src-tauri/src/commands.rs` (create) | Tauri commands: get_clipboard_history, copy_item, delete_item, clear_history, settings |
| `src-tauri/src/tray_animation.rs` (create) | Tray icon ear-wiggle animation on copy |
| `src-tauri/src/lib.rs` (modify) | Wire up modules, register plugin + commands, start monitor in setup |
| `src-tauri/Cargo.toml` (modify) | Add dependencies |
| `src-tauri/tauri.conf.json` (modify) | Add clipboard plugin permissions if needed |
| `src/App.tsx` (modify) | Replace mock data with real Tauri commands/events |
| `src/App.css` (modify) | Add empty-state styles |
| `package.json` (modify) | Add tauri-plugin-clipboard-api |
| `src-tauri/icons/tray_normal.png` (create) | Tray icon frame: ears normal |
| `src-tauri/icons/tray_ears_up.png` (create) | Tray icon frame: ears up |
| `src-tauri/icons/tray_ears_down.png` (create) | Tray icon frame: ears down |

---

## Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add new dependencies to Cargo.toml**

Add these dependencies to the `[dependencies]` section:

```toml
tauri-plugin-clipboard = "2"
rusqlite = { version = "0.31", features = ["bundled"] }
sha2 = "0.10"
image = { version = "0.25", default-features = false, features = ["png"] }
base64 = "0.22"
tokio = { version = "1", features = ["time"] }
```

- [ ] **Step 2: Add JS dependency**

Run:
```bash
cd /Users/lucas/www/clipboard_widget && bun add tauri-plugin-clipboard-api
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd /Users/lucas/www/clipboard_widget/src-tauri && cargo check
```
Expected: compiles with no errors (warnings are OK)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml package.json bun.lockb
git commit -m "chore: add clipboard, sqlite, image processing dependencies"
```

---

## Task 2: SQLite Database Module

**Files:**
- Create: `src-tauri/src/db.rs`

- [ ] **Step 1: Create db.rs with schema initialization and CRUD operations**

```rust
use rusqlite::{Connection, params};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Serialize, Clone)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: String,
    pub text_content: Option<String>,
    pub image_path: Option<String>,
    pub image_thumb: Option<Vec<u8>>,
    pub created_at: i64,
    pub last_copied_at: Option<i64>,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clipboard_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type TEXT NOT NULL,
                text_content TEXT,
                image_path TEXT,
                image_thumb BLOB,
                created_at INTEGER NOT NULL,
                last_copied_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO settings (key, value) VALUES ('max_items', '50');
            "
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn insert_item(&self, content_type: &str, text_content: Option<&str>, image_path: Option<&str>, image_thumb: Option<&[u8]>) -> Result<ClipboardItem, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        conn.execute(
            "INSERT INTO clipboard_items (content_type, text_content, image_path, image_thumb, created_at, last_copied_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
            params![content_type, text_content, image_path, image_thumb, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(ClipboardItem {
            id,
            content_type: content_type.to_string(),
            text_content: text_content.map(|s| s.to_string()),
            image_path: image_path.map(|s| s.to_string()),
            image_thumb: image_thumb.map(|b| b.to_vec()),
            created_at: now,
            last_copied_at: None,
        })
    }

    pub fn get_last_item(&self) -> Result<Option<ClipboardItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, content_type, text_content, image_path, image_thumb, created_at, last_copied_at FROM clipboard_items ORDER BY id DESC LIMIT 1"
        )?;
        let mut rows = stmt.query_map([], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                text_content: row.get(2)?,
                image_path: row.get(3)?,
                image_thumb: row.get(4)?,
                created_at: row.get(5)?,
                last_copied_at: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn get_items(&self, page: u32, limit: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let offset = page * limit;
        let mut stmt = conn.prepare(
            "SELECT id, content_type, text_content, image_path, image_thumb, created_at, last_copied_at FROM clipboard_items ORDER BY id DESC LIMIT ?1 OFFSET ?2"
        )?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                text_content: row.get(2)?,
                image_path: row.get(3)?,
                image_thumb: row.get(4)?,
                created_at: row.get(5)?,
                last_copied_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_item(&self, id: i64) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let image_path: Option<String> = conn.query_row(
            "SELECT image_path FROM clipboard_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        ).ok();
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        Ok(image_path)
    }

    pub fn clear_all(&self) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT image_path FROM clipboard_items WHERE image_path IS NOT NULL")?;
        let paths: Vec<String> = stmt.query_map([], |row| row.get(0))?.filter_map(|r| r.ok()).collect();
        conn.execute("DELETE FROM clipboard_items", [])?;
        Ok(paths)
    }

    pub fn enforce_max_items(&self, max_items: u32) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, image_path FROM clipboard_items ORDER BY id DESC LIMIT -1 OFFSET ?1"
        )?;
        let overflow: Vec<(i64, Option<String>)> = stmt.query_map(params![max_items], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?.filter_map(|r| r.ok()).collect();

        let image_paths: Vec<String> = overflow.iter().filter_map(|(_, p)| p.clone()).collect();
        let ids: Vec<i64> = overflow.iter().map(|(id, _)| *id).collect();

        for id in ids {
            conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        }
        Ok(image_paths)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).map(Some).or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn mark_as_copied(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        conn.execute(
            "UPDATE clipboard_items SET last_copied_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn delete_expired_items(&self, max_age_secs: i64) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let cutoff = now - max_age_secs;
        let mut stmt = conn.prepare(
            "SELECT id, image_path FROM clipboard_items WHERE last_copied_at IS NULL AND created_at < ?1"
        )?;
        let expired: Vec<(i64, Option<String>)> = stmt.query_map(params![cutoff], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?.filter_map(|r| r.ok()).collect();

        let image_paths: Vec<String> = expired.iter().filter_map(|(_, p)| p.clone()).collect();
        for (id, _) in &expired {
            conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        }
        Ok(image_paths)
    }

    pub fn get_max_items(&self) -> u32 {
        self.get_setting("max_items")
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
            .unwrap_or(50)
    }
}
```

- [ ] **Step 2: Verify it compiles**

Add `mod db;` temporarily to `src-tauri/src/lib.rs` (at the top, before the `use` statements) and run:

```bash
cd /Users/lucas/www/clipboard_widget/src-tauri && cargo check
```
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/lib.rs
git commit -m "feat: add SQLite database module for clipboard history"
```

---

## Task 3: Clipboard Monitor Module

**Files:**
- Create: `src-tauri/src/monitor.rs`

- [ ] **Step 1: Create monitor.rs with clipboard monitoring and image processing**

```rust
use crate::db::Database;
use base64::Engine;
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
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
        let available = clipboard.available_types();

        if let Ok(types) = available {
            let types_str = format!("{:?}", types);
            if types_str.contains("Image") || types_str.contains("image") {
                handle_image(&app_handle, &clipboard, &db, &images_dir);
            } else if types_str.contains("Text") || types_str.contains("text") || types_str.contains("String") || types_str.contains("string") {
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

    // Deduplication: skip if identical to last item
    if let Ok(Some(last)) = db.get_last_item() {
        if last.content_type == "text" && last.text_content.as_deref() == Some(&text) {
            return true;
        }
    }

    if let Ok(item) = db.insert_item("text", Some(&text), None, None) {
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

    if let Ok(Some(last)) = db.get_last_item() {
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
    if let Ok(item) = db.insert_item("image", None, Some(&path_str), if thumb_bytes.is_empty() { None } else { Some(&thumb_bytes) }) {
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
```

- [ ] **Step 2: Add `mod monitor;` to lib.rs and verify compilation**

Add `mod monitor;` to `src-tauri/src/lib.rs` (below `mod db;`) and run:

```bash
cd /Users/lucas/www/clipboard_widget/src-tauri && cargo check
```
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/monitor.rs src-tauri/src/lib.rs
git commit -m "feat: add clipboard monitor with text/image capture and deduplication"
```

---

## Task 4: Tauri Commands Module

**Files:**
- Create: `src-tauri/src/commands.rs`

- [ ] **Step 1: Create commands.rs with all Tauri commands**

```rust
use crate::db::{ClipboardItem, Database};
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::sync::Arc;
use tauri::{Manager, State};
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
```

- [ ] **Step 2: Add `mod commands;` to lib.rs and verify compilation**

Add `mod commands;` to `src-tauri/src/lib.rs` (below `mod monitor;`) and run:

```bash
cd /Users/lucas/www/clipboard_widget/src-tauri && cargo check
```
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for clipboard history CRUD and settings"
```

---

## Task 5: Tray Icon Animation Module

**Files:**
- Create: `src-tauri/src/tray_animation.rs`
- Create: `src-tauri/icons/tray_normal.png`
- Create: `src-tauri/icons/tray_ears_up.png`
- Create: `src-tauri/icons/tray_ears_down.png`

- [ ] **Step 1: Create the 3 tray icon PNG variants**

Generate 3 variations of the dog mascot icon (22x22px recommended for macOS tray) as PNG files. These should be based on the existing dog SVG (`src/assets/dog.svg`) with modified ear positions:
- `tray_normal.png` — ears in default position (same as current icon)
- `tray_ears_up.png` — ears raised/tilted up
- `tray_ears_down.png` — ears lowered/tilted down

Place them in `src-tauri/icons/`.

Note: The existing tray icon is `src-tauri/icons/icon.png`. The new tray icon PNGs should be simpler/smaller versions suitable for the menu bar.

- [ ] **Step 2: Create tray_animation.rs**

```rust
use tauri::image::Image;
use tauri::Manager;
use std::time::Duration;

pub fn animate_ears(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let tray = match app.tray_by_id("bark-tray") {
            Some(t) => t,
            None => return,
        };

        let normal = Image::from_bytes(include_bytes!("../icons/tray_normal.png"));
        let ears_up = Image::from_bytes(include_bytes!("../icons/tray_ears_up.png"));
        let ears_down = Image::from_bytes(include_bytes!("../icons/tray_ears_down.png"));

        let (Ok(normal), Ok(ears_up), Ok(ears_down)) = (normal, ears_up, ears_down) else {
            return;
        };

        let frames: Vec<(&Image<'_>, u64)> = vec![
            (&ears_up, 150),
            (&ears_down, 150),
            (&ears_up, 150),
            (&normal, 0),
        ];

        for (frame, delay_ms) in frames {
            tray.set_icon(Some(frame.clone())).ok();
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
        }
    });
}
```

- [ ] **Step 3: Add `mod tray_animation;` to lib.rs and verify compilation**

Add `mod tray_animation;` to `src-tauri/src/lib.rs` and run:

```bash
cd /Users/lucas/www/clipboard_widget/src-tauri && cargo check
```
Expected: compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray_animation.rs src-tauri/icons/tray_normal.png src-tauri/icons/tray_ears_up.png src-tauri/icons/tray_ears_down.png src-tauri/src/lib.rs
git commit -m "feat: add tray icon ear-wiggle animation for copy feedback"
```

---

## Task 6: Wire Everything in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Rewrite lib.rs to integrate all modules**

Replace the entire contents of `src-tauri/src/lib.rs` with:

```rust
mod commands;
mod db;
mod monitor;
mod tray_animation;

use db::Database;
use std::sync::Arc;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_positioner::{Position, WindowExt};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_clipboard::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::copy_item,
            commands::delete_item,
            commands::clear_history,
            commands::get_settings,
            commands::update_settings,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Initialize database
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            let db_path = app_data_dir.join("clipboard.db");
            let db = Arc::new(Database::new(&db_path).expect("Failed to init database"));
            app.manage(db.clone());

            // Images directory
            let images_dir = app_data_dir.join("images");

            // Start clipboard monitor
            monitor::start(&app.handle(), db, images_dir);

            // Window setup
            if let Some(window) = app.get_webview_window("tray-window") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(8.0),
                )
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

                window.on_window_event(|event| {
                    if let WindowEvent::Focused(false) = event {}
                });
            }

            // Tray icon
            TrayIconBuilder::with_id("bark-tray")
                .icon(tauri::include_image!("icons/tray_normal.png"))
                .tooltip("Bark")
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("tray-window") {
                            let is_visible = window.is_visible().unwrap_or(false);

                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = std::panic::catch_unwind(
                                    std::panic::AssertUnwindSafe(|| {
                                        let _ = window.move_window(Position::TrayBottomCenter);
                                    }),
                                );

                                #[cfg(target_os = "macos")]
                                let _ = app.show();

                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/lucas/www/clipboard_widget/src-tauri && cargo check
```
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: wire up clipboard plugin, database, monitor, and commands in lib.rs"
```

---

## Task 7: Frontend — Replace Mock Data with Real Clipboard History

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Replace App.tsx with real data integration**

Replace the entire contents of `src/App.tsx` with:

```tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type ClipboardItem = {
  id: number;
  content_type: "text" | "image";
  text_content: string | null;
  image_path: string | null;
  image_thumb_base64: string | null;
  created_at: number;
  last_copied_at: number | null;
};

type DisplayType = "text" | "image" | "link";

function getDisplayType(item: ClipboardItem): DisplayType {
  if (item.content_type === "image") return "image";
  if (
    item.text_content &&
    (item.text_content.startsWith("http://") ||
      item.text_content.startsWith("https://"))
  ) {
    return "link";
  }
  return "text";
}

function formatTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function ClipboardIcon({ type }: { type: DisplayType }) {
  if (type === "image") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  if (type === "link") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

const PAGE_SIZE = 20;

function App() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await invoke<ClipboardItem[]>("get_clipboard_history", {
        page: pageNum,
        limit: PAGE_SIZE,
      });
      if (append) {
        setItems((prev) => [...prev, ...result]);
      } else {
        setItems(result);
      }
      setHasMore(result.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadItems(0, false);
  }, [loadItems]);

  // Listen for new clipboard items
  useEffect(() => {
    const unlisten = listen<ClipboardItem>("clipboard://new-item", (event) => {
      setItems((prev) => [event.payload, ...prev]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Scroll-based pagination
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadItems(nextPage, true);
    }
  }, [loading, hasMore, page, loadItems]);

  const handleCopy = async (id: number) => {
    await invoke("copy_item", { id });
  };

  const handleDelete = async (id: number) => {
    await invoke("delete_item", { id });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="widget">
      {/* Header */}
      <header className="widget-header">
        <div className="header-left">
          <img
            src="/src/assets/dog_colored.svg"
            alt="Bark"
            width="24"
            height="24"
          />
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard & File Sharing</span>
        </div>
      </header>

      {/* Clipboard List */}
      <div className="clipboard-list" ref={listRef} onScroll={handleScroll}>
        {items.length === 0 && !loading && (
          <div className="empty-state">
            <span className="empty-text">Nenhum item no clipboard</span>
            <span className="empty-subtext">
              Copie algo para começar
            </span>
          </div>
        )}
        {items.map((item) => {
          const displayType = getDisplayType(item);
          return (
            <div
              key={item.id}
              className="clipboard-item"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="item-icon">
                <ClipboardIcon type={displayType} />
              </div>
              <div className="item-content">
                {item.content_type === "image" ? (
                  item.image_thumb_base64 ? (
                    <img
                      src={`data:image/png;base64,${item.image_thumb_base64}`}
                      alt="Imagem copiada"
                      className="item-image"
                    />
                  ) : (
                    <span className="item-text">[Imagem]</span>
                  )
                ) : (
                  <span className="item-text">
                    {item.text_content || ""}
                  </span>
                )}
                <span className="item-time">
                  {formatTime(item.created_at)}
                </span>
              </div>
              <div
                className={`item-actions ${hoveredId === item.id ? "visible" : ""}`}
              >
                <button
                  className="action-btn copy-btn"
                  title="Copiar"
                  onClick={() => handleCopy(item.id)}
                >
                  <CopyIcon />
                </button>
                <button
                  className="action-btn delete-btn"
                  title="Deletar"
                  onClick={() => handleDelete(item.id)}
                >
                  <DeleteIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone ${isDragOver ? "drag-over" : ""}`}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => setIsDragOver(false)}
      >
        <UploadIcon />
        <span className="drop-title">Arraste arquivos aqui</span>
        <span className="drop-subtitle">Múltiplos arquivos permitidos</span>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Add empty-state styles to App.css**

Append to the end of `src/App.css`:

```css
/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 4px;
}

.empty-text {
  color: #a1a1aa;
  font-size: 13px;
  font-weight: 500;
}

.empty-subtext {
  color: #52525b;
  font-size: 11px;
}
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd /Users/lucas/www/clipboard_widget && bun run build
```
Expected: builds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: replace mock clipboard data with real Tauri commands and events"
```

---

## Task 8: Integration Test — Full App Build and Run

- [ ] **Step 1: Build the full Tauri app**

```bash
cd /Users/lucas/www/clipboard_widget && cargo tauri build 2>&1 | tail -20
```
Expected: builds successfully

- [ ] **Step 2: Manual smoke test**

Run the dev server and verify:
```bash
cd /Users/lucas/www/clipboard_widget && cargo tauri dev
```

Test these scenarios:
1. App launches with empty clipboard list showing "Nenhum item no clipboard"
2. Copy text in another app → appears in the Bark list in real time
3. Copy an image (e.g., screenshot) → appears with thumbnail in the list
4. Click the copy button on a text item → text is copied back, tray icon animates ears
5. Click the delete button → item is removed from the list
6. Close and reopen the app → history is persisted

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete clipboard history with monitoring, persistence, and tray animation"
```
