# Bark Refactor Design

**Date:** 2026-04-03  
**Status:** Approved  
**Scope:** Backend (`src-tauri/src/`) + Frontend (`src/`)

---

## Context

Bark is a macOS clipboard manager built with Tauri v2 (Rust) + React + TypeScript + SQLite (rusqlite). The app captures clipboard changes (text and images), stores them locally, and displays them in a tray popover.

### Problems being solved

1. `Mutex<Connection>` without WAL mode — reads block writes
2. Image processing (decode, thumbnail, hash, file write) runs on the clipboard listener thread, blocking it
3. Inconsistent deduplication — text uses global search, image compares only the last item
4. `copy_item` command fetches up to 1000 items to find one by ID — no `get_item_by_id`
5. Frontend polls every 1s via `setInterval` in addition to Tauri events — wasteful
6. Business logic scattered between `monitor.rs`, `commands.rs`, and `db.rs`
7. Cleanup (`enforce_max_items`) deletes in a loop instead of a single batch query
8. DB schema has no `hash` or `pinned` columns
9. Drag-and-drop upload footer is a static placeholder — not functional

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| DB concurrency | WAL mode on existing `Mutex<Connection>` | Sufficient for single-user; no new dependencies |
| Image processing | `tokio::sync::mpsc` channel + async worker task | Unblocks clipboard listener; tokio already in project |
| Business logic layer | Single `use_cases.rs` file | Avoids overengineering a small module count |

---

## Backend Design

### File structure

```
src-tauri/src/
├── lib.rs            — app setup (minor changes)
├── main.rs           — unchanged
├── db.rs             — WAL, hash/pinned columns, get_item_by_id, batch cleanup
├── monitor.rs        — listener delegates to mpsc channel
├── use_cases.rs      — NEW: save_text, save_image, copy_item logic
├── commands.rs       — thin wrappers over use_cases
└── tray_animation.rs — unchanged
```

### `db.rs` changes

- Enable WAL on open: `conn.execute_batch("PRAGMA journal_mode=WAL;")`
- Add columns to schema:
  - `hash TEXT UNIQUE` — SHA-256 hex of content (text or image bytes)
  - `pinned INTEGER DEFAULT 0`
- `insert_item` receives `hash: Option<&str>` and uses `INSERT OR IGNORE` — deduplication is now atomic for both text and images
- Remove `text_exists()` and `get_last_item()` — no longer needed
- Add `get_item_by_id(id: i64) -> Result<Option<ClipboardItem>>`
- `enforce_max_items`: replace per-row DELETE loop with a single:
  ```sql
  DELETE FROM clipboard_items
  WHERE id IN (SELECT id FROM clipboard_items ORDER BY id DESC LIMIT -1 OFFSET ?)
  AND pinned = 0
  ```

### `monitor.rs` changes

- Define `ImageJob { bytes: Vec<u8>, images_dir: PathBuf }`
- In `start()`, create `mpsc::channel::<ImageJob>(32)`
- Clipboard listener:
  - Text → call `use_cases::save_text()` directly (fast, no blocking)
  - Image → send `ImageJob` to channel sender (non-blocking)
- Spawn async worker task that receives from channel and calls `use_cases::save_image()`

### `use_cases.rs` (new)

```rust
pub fn save_text(db, app, text: String)
  // hash = SHA-256 of text
  // db.insert_item("text", ..., hash) — INSERT OR IGNORE handles dedup
  // enforce_max_items, emit "clipboard://new-item"

pub fn save_image(db, app, bytes: Vec<u8>, images_dir: PathBuf)
  // hash = SHA-256 of bytes
  // generate_thumbnail
  // write full image to disk
  // db.insert_item("image", ..., hash) — INSERT OR IGNORE handles dedup
  // enforce_max_items, emit "clipboard://new-item"

pub fn copy_item(db, clipboard, app, id: i64) -> Result<(), String>
  // db.get_item_by_id(id) — replaces get_items(0,1000).find()
  // write to clipboard
  // db.mark_as_copied(id)
  // tray_animation::animate_ears
```

### `commands.rs` changes

- `copy_item` becomes a thin wrapper calling `use_cases::copy_item`
- Add `get_item_by_id` as a public Tauri command
- Add `upload_file(name: String, bytes: Vec<u8>)` — calls `use_cases::save_image` with the provided bytes, treating the upload as an image clipboard item

---

## Frontend Design

### File structure

```
src/
├── App.tsx                     — minor: use DropZone component
├── types.ts                    — add hash?, pinned? to ClipboardItem
├── hooks/
│   ├── useClipboard.ts         — remove setInterval polling
│   ├── useSearch.ts            — unchanged
│   └── useEars.ts              — unchanged
├── components/
│   ├── Item.tsx                — unchanged
│   ├── Icons.tsx               — unchanged
│   └── DropZone.tsx            — NEW: functional drag-and-drop
└── services/
    └── clipboardService.ts     — NEW: centralise all invoke() calls
```

### `useClipboard.ts` changes

- Remove `setInterval` (1s polling)
- Keep `listen("clipboard://new-item")` — event payload contains the full item, no re-fetch needed
- Add `listen("window-shown")` → call `loadItems(0, false)` to sync state when popover opens

### `services/clipboardService.ts` (new)

Centralises all `invoke()` calls so hooks and components don't call `invoke` directly:

```ts
export const clipboardService = {
  getHistory(page, limit): Promise<ClipboardItem[]>
  searchHistory(query, limit): Promise<ClipboardItem[]>
  copyItem(id): Promise<void>
  deleteItem(id): Promise<void>
  clearHistory(): Promise<void>
  getItemById(id): Promise<ClipboardItem | null>
  uploadFile(name, bytes): Promise<void>
}
```

### `DropZone.tsx` (new)

- Replaces the static `<footer>` in App.tsx
- Handles `onDragOver`, `onDragLeave`, `onDrop` events
- Reads dropped files via File API, converts to `Uint8Array`
- Calls `clipboardService.uploadFile(name, bytes)`
- Visual highlight state while dragging

### `types.ts` changes

```ts
export interface ClipboardItem {
  // existing fields...
  hash?: string
  pinned?: boolean
}
```

---

## What is NOT in scope

- `pinned` UI (pin/unpin button) — column added to DB but no frontend toggle yet
- Windows/Linux support — macOS only, no change
- Cloud sync or encryption

---

## Success criteria

1. Clipboard listener thread never blocks on image processing
2. Deduplication works consistently for both text and images via hash
3. `copy_item` uses `get_item_by_id` — no full table scan
4. Frontend receives new items only via Tauri events — no polling
5. Dropped files appear in clipboard history
