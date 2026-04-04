# Bark Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Bark clipboard manager backend and frontend for better performance, consistent deduplication, and clean separation of concerns.

**Architecture:** WAL-enabled SQLite with hash-based deduplication; image processing offloaded to a tokio mpsc worker; business logic centralised in `use_cases.rs`; frontend drops polling in favour of Tauri events and moves all `invoke` calls into a `clipboardService`.

**Tech Stack:** Rust, Tauri v2, rusqlite, tokio mpsc, React, TypeScript

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src-tauri/src/db.rs` | WAL, hash/pinned columns, `get_item_by_id`, batch cleanup, `hash_exists` |
| Create | `src-tauri/src/use_cases.rs` | `save_text`, `save_image`, `copy_item` |
| Modify | `src-tauri/src/monitor.rs` | mpsc channel + async image worker, delegate to use_cases |
| Modify | `src-tauri/src/commands.rs` | thin wrappers, add `get_item_by_id` + `upload_file` commands |
| Modify | `src-tauri/src/lib.rs` | manage `images_dir` as state, register new commands |
| Modify | `src-tauri/Cargo.toml` | add `tempfile` dev-dependency |
| Modify | `src/types.ts` | add `hash?`, `pinned?`, `last_copied_at?` fields |
| Create | `src/services/clipboardService.ts` | centralise all `invoke` calls |
| Modify | `src/hooks/useClipboard.ts` | remove setInterval polling, add window-shown listener |
| Modify | `src/hooks/useSearch.ts` | use clipboardService instead of direct invoke |
| Create | `src/components/DropZone.tsx` | functional drag-and-drop footer |
| Modify | `src/App.tsx` | use DropZone component, use clipboardService for copy |

---

## Task 1: DB — WAL, schema migration, ClipboardItem struct

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add `tempfile` dev-dependency to Cargo.toml**

Open `src-tauri/Cargo.toml` and add at the end:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Update `ClipboardItem` struct and `Database::new()` in `db.rs`**

Replace the top of `db.rs` (struct + `new`) with:

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
    pub hash: Option<String>,
    pub pinned: bool,
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
            "PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS clipboard_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type TEXT NOT NULL,
                text_content TEXT,
                image_path TEXT,
                image_thumb BLOB,
                hash TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_copied_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO settings (key, value) VALUES ('max_items', '50');"
        )?;
        // Migrations for existing installs that lack hash/pinned columns
        let _ = conn.execute("ALTER TABLE clipboard_items ADD COLUMN hash TEXT", []);
        let _ = conn.execute("ALTER TABLE clipboard_items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0", []);
        Ok(Self { conn: Mutex::new(conn) })
    }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error"
```

Expected: errors about `text_exists`, `get_last_item` callers — those are removed in Task 2. If there are other unexpected errors, fix them before proceeding.

---

## Task 2: DB — update all methods, add `get_item_by_id`, `hash_exists`, batch cleanup

**Files:**
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Replace the full body of `db.rs` with the updated implementation**

Replace the entire file content with:

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
    pub hash: Option<String>,
    pub pinned: bool,
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
            "PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS clipboard_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type TEXT NOT NULL,
                text_content TEXT,
                image_path TEXT,
                image_thumb BLOB,
                hash TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_copied_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO settings (key, value) VALUES ('max_items', '50');"
        )?;
        let _ = conn.execute("ALTER TABLE clipboard_items ADD COLUMN hash TEXT", []);
        let _ = conn.execute("ALTER TABLE clipboard_items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0", []);
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn insert_item(
        &self,
        content_type: &str,
        text_content: Option<&str>,
        image_path: Option<&str>,
        image_thumb: Option<&[u8]>,
        hash: Option<&str>,
    ) -> Result<ClipboardItem, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        conn.execute(
            "INSERT INTO clipboard_items (content_type, text_content, image_path, image_thumb, hash, created_at, last_copied_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            params![content_type, text_content, image_path, image_thumb, hash, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(ClipboardItem {
            id,
            content_type: content_type.to_string(),
            text_content: text_content.map(|s| s.to_string()),
            image_path: image_path.map(|s| s.to_string()),
            image_thumb: image_thumb.map(|b| b.to_vec()),
            hash: hash.map(|s| s.to_string()),
            pinned: false,
            created_at: now,
            last_copied_at: None,
        })
    }

    pub fn hash_exists(&self, hash: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM clipboard_items WHERE hash = ?1)",
            params![hash],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false)
    }

    pub fn get_item_by_id(&self, id: i64) -> Result<Option<ClipboardItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, content_type, text_content, image_path, image_thumb, hash, pinned, created_at, last_copied_at FROM clipboard_items WHERE id = ?1",
            params![id],
            |row| {
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content_type: row.get(1)?,
                    text_content: row.get(2)?,
                    image_path: row.get(3)?,
                    image_thumb: row.get(4)?,
                    hash: row.get(5)?,
                    pinned: row.get::<_, i64>(6)? != 0,
                    created_at: row.get(7)?,
                    last_copied_at: row.get(8)?,
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
    }

    pub fn get_items(&self, page: u32, limit: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let offset = page * limit;
        let mut stmt = conn.prepare(
            "SELECT id, content_type, text_content, image_path, image_thumb, hash, pinned, created_at, last_copied_at FROM clipboard_items ORDER BY id DESC LIMIT ?1 OFFSET ?2"
        )?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                text_content: row.get(2)?,
                image_path: row.get(3)?,
                image_thumb: row.get(4)?,
                hash: row.get(5)?,
                pinned: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                last_copied_at: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn search_items(&self, query: &str, limit: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, content_type, text_content, image_path, image_thumb, hash, pinned, created_at, last_copied_at FROM clipboard_items WHERE text_content LIKE ?1 ORDER BY id DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![pattern, limit], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                text_content: row.get(2)?,
                image_path: row.get(3)?,
                image_thumb: row.get(4)?,
                hash: row.get(5)?,
                pinned: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                last_copied_at: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_item(&self, id: i64) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let image_path: Option<String> = conn
            .query_row(
                "SELECT image_path FROM clipboard_items WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .ok();
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        Ok(image_path)
    }

    pub fn clear_all(&self) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT image_path FROM clipboard_items WHERE image_path IS NOT NULL",
        )?;
        let paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        conn.execute("DELETE FROM clipboard_items", [])?;
        Ok(paths)
    }

    pub fn enforce_max_items(&self, max_items: u32) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT image_path FROM clipboard_items WHERE pinned = 0 ORDER BY id DESC LIMIT -1 OFFSET ?1"
        )?;
        let image_paths: Vec<String> = stmt
            .query_map(params![max_items], |row| row.get::<_, Option<String>>(0))?
            .filter_map(|r| r.ok().flatten())
            .collect();
        conn.execute(
            "DELETE FROM clipboard_items WHERE id IN (SELECT id FROM clipboard_items WHERE pinned = 0 ORDER BY id DESC LIMIT -1 OFFSET ?1)",
            params![max_items],
        )?;
        Ok(image_paths)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
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
            "SELECT image_path FROM clipboard_items WHERE last_copied_at IS NULL AND created_at < ?1 AND pinned = 0"
        )?;
        let image_paths: Vec<String> = stmt
            .query_map(params![cutoff], |row| row.get::<_, Option<String>>(0))?
            .filter_map(|r| r.ok().flatten())
            .collect();
        conn.execute(
            "DELETE FROM clipboard_items WHERE last_copied_at IS NULL AND created_at < ?1 AND pinned = 0",
            params![cutoff],
        )?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn make_db() -> (Database, NamedTempFile) {
        let tmp = NamedTempFile::new().unwrap();
        let db = Database::new(tmp.path()).unwrap();
        (db, tmp) // keep tmp alive so the file isn't deleted
    }

    #[test]
    fn test_insert_and_get_by_id() {
        let (db, _tmp) = make_db();
        let item = db
            .insert_item("text", Some("hello"), None, None, Some("abc123"))
            .unwrap();
        let found = db.get_item_by_id(item.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().text_content.as_deref(), Some("hello"));
    }

    #[test]
    fn test_get_item_by_id_missing() {
        let (db, _tmp) = make_db();
        assert!(db.get_item_by_id(9999).unwrap().is_none());
    }

    #[test]
    fn test_hash_exists() {
        let (db, _tmp) = make_db();
        db.insert_item("text", Some("hello"), None, None, Some("abc123"))
            .unwrap();
        assert!(db.hash_exists("abc123"));
        assert!(!db.hash_exists("notexist"));
    }

    #[test]
    fn test_enforce_max_items_batch() {
        let (db, _tmp) = make_db();
        for i in 0..5u32 {
            db.insert_item("text", Some(&format!("item{}", i)), None, None, Some(&format!("hash{}", i)))
                .unwrap();
        }
        let removed = db.enforce_max_items(3).unwrap();
        assert!(removed.is_empty()); // no image paths
        let items = db.get_items(0, 10).unwrap();
        assert_eq!(items.len(), 3);
    }
}
```

- [ ] **Step 2: Run the unit tests**

```bash
cd src-tauri && cargo test 2>&1
```

Expected output includes:
```
test tests::test_insert_and_get_by_id ... ok
test tests::test_get_item_by_id_missing ... ok
test tests::test_hash_exists ... ok
test tests::test_enforce_max_items_batch ... ok
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/Cargo.toml
git commit -m "refactor(db): WAL mode, hash/pinned columns, get_item_by_id, batch cleanup"
```

---

## Task 3: Create `use_cases.rs`

**Files:**
- Create: `src-tauri/src/use_cases.rs`

- [ ] **Step 1: Create the file**

```rust
// src-tauri/src/use_cases.rs
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
        return;
    }

    if let Ok(item) = db.insert_item("text", Some(&text), None, None, Some(&hash)) {
        enforce_and_emit(app, db, &item);
    }
}

pub fn save_image(app: &AppHandle, db: &Arc<Database>, bytes: Vec<u8>, images_dir: &PathBuf) {
    let hash = sha256_hex(&bytes);

    if db.hash_exists(&hash) {
        return;
    }

    let hash_short = &hash[..12];
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let filename = format!("{}_{}.png", timestamp, hash_short);
    let full_path = images_dir.join(&filename);

    if fs::write(&full_path, &bytes).is_err() {
        return;
    }

    let thumb_bytes = generate_thumbnail(&bytes).unwrap_or_default();
    let path_str = full_path.to_string_lossy().to_string();
    let thumb = if thumb_bytes.is_empty() { None } else { Some(thumb_bytes.as_slice()) };

    if let Ok(item) = db.insert_item("image", None, Some(&path_str), thumb, Some(&hash)) {
        enforce_and_emit(app, db, &item);
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
        .ok_or_else(|| "Item not found".to_string())?;

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
    app.emit("clipboard://new-item", item).ok();
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
```

- [ ] **Step 2: Declare the module in `lib.rs`**

Add `mod use_cases;` after the existing `mod tray_animation;` line in `src-tauri/src/lib.rs`.

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/use_cases.rs src-tauri/src/lib.rs
git commit -m "feat(use_cases): save_text, save_image, copy_item with hash dedup"
```

---

## Task 4: Update `monitor.rs` — mpsc channel + async image worker

**Files:**
- Modify: `src-tauri/src/monitor.rs`

- [ ] **Step 1: Replace the full content of `monitor.rs`**

```rust
use crate::use_cases;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Listener, Manager};
use tauri_plugin_clipboard::Clipboard;
use tokio::sync::mpsc;

use crate::db::Database;

const TWENTY_FOUR_HOURS: i64 = 24 * 60 * 60;

struct ImageJob {
    bytes: Vec<u8>,
    images_dir: PathBuf,
}

pub fn start(app: &AppHandle, db: Arc<Database>, images_dir: PathBuf) {
    fs::create_dir_all(&images_dir).ok();

    let clipboard = app.state::<Clipboard>();
    clipboard.start_monitor(app.clone()).ok();

    // Periodic cleanup: remove uncoped items older than 24h
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
            use_cases::save_image(&image_app, &image_db, job.bytes, &job.images_dir);
        }
    });

    let app_handle = app.clone();
    app.listen("plugin:clipboard://clipboard-monitor/update", move |_event| {
        let clipboard = app_handle.state::<Clipboard>();

        if let Ok(types) = clipboard.available_types() {
            if types.image {
                if let Ok(bytes) = clipboard.read_image_binary() {
                    if !bytes.is_empty() {
                        // Non-blocking send — drops silently if worker is full (32 cap)
                        tx.try_send(ImageJob { bytes, images_dir: images_dir.clone() }).ok();
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
                    tx.try_send(ImageJob { bytes, images_dir: images_dir.clone() }).ok();
                }
            }
        }
    });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | grep -E "^error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/monitor.rs
git commit -m "refactor(monitor): offload image processing to mpsc worker task"
```

---

## Task 5: Update `commands.rs` and `lib.rs`

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Replace the full content of `commands.rs`**

```rust
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
    use_cases::copy_item(&app, &db, &*clipboard, id) // State<T> derefs to T
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
```

- [ ] **Step 2: Update `lib.rs` — manage `images_dir` as state and register new commands**

Replace the full content of `src-tauri/src/lib.rs` with:

```rust
mod commands;
mod db;
mod monitor;
mod tray_animation;
mod use_cases;

use db::Database;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
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
            commands::search_clipboard_history,
            commands::get_item_by_id,
            commands::copy_item,
            commands::delete_item,
            commands::clear_history,
            commands::get_settings,
            commands::update_settings,
            commands::upload_file,
            commands::quit_app,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("clipboard.db");
            let db = Arc::new(Database::new(&db_path).expect("Failed to init database"));
            app.manage(db.clone());

            let images_dir: PathBuf = app_data_dir.join("images");
            app.manage(images_dir.clone()); // available to upload_file command

            monitor::start(&app.handle(), db, images_dir);

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

            let quit_item = MenuItem::with_id(app, "quit", "Encerrar Bark", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&quit_item])?;

            TrayIconBuilder::with_id("bark-tray")
                .icon(tauri::include_image!("icons/tray_normal.png"))
                .icon_as_template(false)
                .tooltip("Bark")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
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
                                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                    let _ = window.move_window(Position::TrayBottomCenter);
                                }));
                                #[cfg(target_os = "macos")]
                                let _ = app.show();
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = app.emit("window-shown", ());
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

- [ ] **Step 3: Build the backend**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error"
```

Expected: no errors.

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
cd src-tauri && cargo test 2>&1
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "refactor(commands): thin wrappers over use_cases, add get_item_by_id + upload_file"
```

---

## Task 6: Frontend — `types.ts` and `clipboardService.ts`

**Files:**
- Modify: `src/types.ts`
- Create: `src/services/clipboardService.ts`

- [ ] **Step 1: Update `src/types.ts`**

```typescript
export type ClipboardItem = {
  id: number;
  content_type: "text" | "image";
  text_content: string | null;
  image_path: string | null;
  image_thumb_base64: string | null;
  hash: string | null;
  pinned: boolean;
  created_at: number;
  last_copied_at: number | null;
};

export type EarState = "normal" | "up" | "down";
```

- [ ] **Step 2: Create `src/services/clipboardService.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { ClipboardItem } from "../types";

export const clipboardService = {
  getHistory(page: number, limit: number): Promise<ClipboardItem[]> {
    return invoke("get_clipboard_history", { page, limit });
  },

  searchHistory(query: string, limit: number): Promise<ClipboardItem[]> {
    return invoke("search_clipboard_history", { query, limit });
  },

  copyItem(id: number): Promise<void> {
    return invoke("copy_item", { id });
  },

  deleteItem(id: number): Promise<void> {
    return invoke("delete_item", { id });
  },

  clearHistory(): Promise<void> {
    return invoke("clear_history");
  },

  getItemById(id: number): Promise<ClipboardItem | null> {
    return invoke("get_item_by_id", { id });
  },

  uploadFile(name: string, bytes: number[]): Promise<void> {
    return invoke("upload_file", { name, bytes });
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/services/clipboardService.ts
git commit -m "feat(frontend): add clipboardService, extend ClipboardItem type"
```

---

## Task 7: Update `useClipboard.ts` — remove polling, add window-shown listener

**Files:**
- Modify: `src/hooks/useClipboard.ts`

- [ ] **Step 1: Replace the full content of `src/hooks/useClipboard.ts`**

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { ClipboardItem } from "../types";
import { clipboardService } from "../services/clipboardService";

const PAGE_SIZE = 20;

export function useClipboard() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await clipboardService.getHistory(pageNum, PAGE_SIZE);
      setItems(prev => (append ? [...prev, ...result] : result));
      setHasMore(result.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems(0, false);

    const unlistenNew = listen<ClipboardItem>("clipboard://new-item", event => {
      setItems(prev => [event.payload, ...prev]);
    });

    // Re-sync when the popover becomes visible (covers items added while closed)
    const unlistenShown = listen("window-shown", () => {
      pageRef.current = 0;
      loadItems(0, false);
    });

    return () => {
      unlistenNew.then(fn => fn());
      unlistenShown.then(fn => fn());
    };
  }, [loadItems]);

  const deleteItem = async (id: number) => {
    await clipboardService.deleteItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const loadMore = () => {
    const next = pageRef.current + 1;
    pageRef.current = next;
    loadItems(next, true);
  };

  return {
    items,
    loading,
    hasMore,
    loadMore,
    deleteItem,
    refresh: () => loadItems(0, false),
  };
}
```

- [ ] **Step 2: Update `src/hooks/useSearch.ts` to use clipboardService**

```typescript
import { useState, useEffect } from "react";
import { ClipboardItem } from "../types";
import { clipboardService } from "../services/clipboardService";

const SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 200;

export function useSearch(query: string) {
  const [results, setResults] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const isActive = query.trim().length > 0;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await clipboardService.searchHistory(q, SEARCH_LIMIT);
        setResults(result);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading, isActive };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useClipboard.ts src/hooks/useSearch.ts
git commit -m "refactor(hooks): remove polling, use clipboardService, add window-shown sync"
```

---

## Task 8: Create `DropZone.tsx` and update `App.tsx`

**Files:**
- Create: `src/components/DropZone.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/DropZone.tsx`**

The existing CSS already has `.drop-zone` and `.drag-over` classes in `App.css`.

```tsx
import { useState, DragEvent } from "react";
import { UploadIcon } from "./Icons";
import { clipboardService } from "../services/clipboardService";

export function DropZone() {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      await clipboardService.uploadFile(file.name, bytes).catch(() => {});
    }
  };

  return (
    <footer
      className={`drop-zone${dragging ? " drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <UploadIcon />
      <span>{dragging ? "Solte aqui" : "Arraste arquivos aqui"}</span>
    </footer>
  );
}
```

- [ ] **Step 2: Replace the full content of `src/App.tsx`**

```tsx
import { useState, useRef } from "react";
import { useClipboard } from "./hooks/useClipboard";
import { useEars } from "./hooks/useEars";
import { useSearch } from "./hooks/useSearch";
import { ClipboardListItem } from "./components/Item";
import { DogIcon } from "./components/Icons";
import { DropZone } from "./components/DropZone";
import { clipboardService } from "./services/clipboardService";
import "./App.css";

export default function App() {
  const { items, loading: clipLoading, hasMore, loadMore, deleteItem } = useClipboard();
  const { ears, triggerBark } = useEars();
  const [searchQuery, setSearchQuery] = useState("");
  const { results: searchResults, loading: searchLoading, isActive: isSearching } = useSearch(searchQuery);
  const listRef = useRef<HTMLDivElement>(null);

  const handleCopy = async (id: number) => {
    await clipboardService.copyItem(id);
    triggerBark();
  };

  const onScroll = () => {
    if (isSearching || !listRef.current || clipLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) loadMore();
  };

  const displayItems = isSearching ? searchResults : items;
  const loading = isSearching ? searchLoading : clipLoading;

  return (
    <div className="widget">
      <header className="widget-header">
        <DogIcon ears={ears} />
        <div className="header-info">
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard</span>
        </div>
      </header>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Pesquisar..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {isSearching && (
          <button className="search-clear" onClick={() => setSearchQuery("")} title="Limpar">
            ×
          </button>
        )}
      </div>

      <div className="clipboard-list" ref={listRef} onScroll={onScroll}>
        {displayItems.length === 0 && !loading && (
          <div className="empty-state">
            {isSearching ? (
              <>
                <span className="empty-text">Nenhum resultado</span>
                <span className="empty-subtext">Tente outra busca</span>
              </>
            ) : (
              <>
                <span className="empty-text">Nenhum item no clipboard</span>
                <span className="empty-subtext">Copie algo para começar</span>
              </>
            )}
          </div>
        )}
        {displayItems.map(item => (
          <ClipboardListItem
            key={item.id}
            item={item}
            onCopy={handleCopy}
            onDelete={deleteItem}
          />
        ))}
        {loading && <div className="loader">Carregando...</div>}
      </div>

      <DropZone />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DropZone.tsx src/App.tsx
git commit -m "feat(frontend): functional DropZone, App uses clipboardService"
```

---

## Task 9: Full build verification

**Files:** none — verify only

- [ ] **Step 1: Run Rust tests**

```bash
cd src-tauri && cargo test 2>&1
```

Expected: 4 tests pass, 0 failures.

- [ ] **Step 2: TypeScript type-check**

```bash
cd /Users/lucas/www/clipboard_widget && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Full Tauri build**

```bash
cd /Users/lucas/www/clipboard_widget && npm run tauri build 2>&1 | tail -20
```

Expected: build succeeds, `.app` bundle produced.

- [ ] **Step 4: Smoke test the running app**

Launch the app. Verify:
1. Copy a text item — appears in list without polling delay
2. Copy the same text again — no duplicate appears
3. Copy an image — appears in list
4. Copy the same image again — no duplicate
5. Drag a file onto the drop zone — it highlights blue, file appears in history on drop
6. Close and reopen the popover — list is fresh (window-shown event)

- [ ] **Step 5: Final commit if any last-minute fixes**

```bash
git add -p && git commit -m "fix: post-build corrections"
```
