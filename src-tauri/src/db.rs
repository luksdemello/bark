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

fn add_column_if_missing(conn: &Connection, sql: &str) -> Result<(), rusqlite::Error> {
    match conn.execute(sql, []) {
        Ok(_) => Ok(()),
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::Unknown => Ok(()),
        Err(e) => Err(e),
    }
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clipboard_items (
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
            INSERT OR IGNORE INTO settings (key, value) VALUES ('max_items', '50');
            CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_items(hash);"
        )?;
        add_column_if_missing(&conn, "ALTER TABLE clipboard_items ADD COLUMN hash TEXT")?;
        add_column_if_missing(&conn, "ALTER TABLE clipboard_items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")?;
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
            |row| row.get::<_, i64>(0).map(|v| v != 0),
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
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let mut stmt = tx.prepare(
            "SELECT image_path FROM clipboard_items
             WHERE pinned = 0
             AND id NOT IN (
                 SELECT id FROM clipboard_items
                 WHERE pinned = 0
                 ORDER BY id DESC
                 LIMIT ?1
             )
             AND image_path IS NOT NULL"
        )?;
        let image_paths: Vec<String> = stmt
            .query_map(params![max_items], |row| row.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        tx.execute(
            "DELETE FROM clipboard_items
             WHERE pinned = 0
             AND id NOT IN (
                 SELECT id FROM clipboard_items
                 WHERE pinned = 0
                 ORDER BY id DESC
                 LIMIT ?1
             )",
            params![max_items],
        )?;
        tx.commit()?;
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
        let mut conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let cutoff = now - max_age_secs;
        let tx = conn.transaction()?;
        let mut stmt = tx.prepare(
            "SELECT image_path FROM clipboard_items
             WHERE last_copied_at IS NULL AND created_at < ?1 AND pinned = 0
             AND image_path IS NOT NULL"
        )?;
        let image_paths: Vec<String> = stmt
            .query_map(params![cutoff], |row| row.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        tx.execute(
            "DELETE FROM clipboard_items WHERE last_copied_at IS NULL AND created_at < ?1 AND pinned = 0",
            params![cutoff],
        )?;
        tx.commit()?;
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
        (db, tmp)
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
            db.insert_item(
                "text",
                Some(&format!("item{}", i)),
                None,
                None,
                Some(&format!("hash{}", i)),
            )
            .unwrap();
        }
        let removed = db.enforce_max_items(3).unwrap();
        assert!(removed.is_empty()); // no image paths
        let items = db.get_items(0, 10).unwrap();
        assert_eq!(items.len(), 3);
    }

    #[test]
    fn test_enforce_max_items_respects_pinned() {
        let (db, _tmp) = make_db();
        // Insert 3 items, pin the oldest one
        let pinned = db.insert_item("text", Some("pinned"), None, None, Some("phash")).unwrap();
        db.insert_item("text", Some("item1"), None, None, Some("h1")).unwrap();
        db.insert_item("text", Some("item2"), None, None, Some("h2")).unwrap();
        // Pin the first item directly via SQL
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("UPDATE clipboard_items SET pinned = 1 WHERE id = ?1", params![pinned.id]).unwrap();
        }
        // enforce with max_items=1: should keep 1 unpinned + 1 pinned = 2 total
        db.enforce_max_items(1).unwrap();
        let items = db.get_items(0, 10).unwrap();
        assert_eq!(items.len(), 2); // 1 pinned + 1 unpinned
        assert!(items.iter().any(|i| i.pinned));
    }
}
