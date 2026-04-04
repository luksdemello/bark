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
            hash: None,
            pinned: false,
            created_at: now,
            last_copied_at: None,
        })
    }

    pub fn text_exists(&self, text: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM clipboard_items WHERE content_type = 'text' AND text_content = ?1)",
            params![text],
            |row| row.get::<_, bool>(0),
        ).unwrap_or(false)
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
                hash: None,
                pinned: false,
                created_at: row.get(5)?,
                last_copied_at: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn search_items(&self, query: &str, limit: u32) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, content_type, text_content, image_path, image_thumb, created_at, last_copied_at FROM clipboard_items WHERE text_content LIKE ?1 ORDER BY id DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![pattern, limit], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                text_content: row.get(2)?,
                image_path: row.get(3)?,
                image_thumb: row.get(4)?,
                hash: None,
                pinned: false,
                created_at: row.get(5)?,
                last_copied_at: row.get(6)?,
            })
        })?;
        rows.collect()
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
                hash: None,
                pinned: false,
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
