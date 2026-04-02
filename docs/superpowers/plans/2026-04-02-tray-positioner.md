# Tray Positioner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual tray-icon positioning logic with `tauri-plugin-positioner`, centering the widget below the tray icon via `Position::TrayBottomCenter`.

**Architecture:** Add `tauri-plugin-positioner` as a Cargo dependency, register it in the Tauri builder, then replace the ~15-line manual `tray.rect()` calculation in the tray click handler with a single `window.move_window(Position::TrayBottomCenter)` call.

**Tech Stack:** Rust, Tauri 2, tauri-plugin-positioner 2

---

## File Map

- Modify: `src-tauri/Cargo.toml` — add plugin dependency
- Modify: `src-tauri/src/lib.rs` — register plugin, add import, replace positioning block

---

### Task 1: Add `tauri-plugin-positioner` to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add the dependency**

Open `src-tauri/Cargo.toml` and add to `[dependencies]`:

```toml
tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }
```

The `tray-icon` feature is required — without it `Position::TrayBottomCenter` is not available.

- [ ] **Step 2: Fetch the crate**

```bash
cd src-tauri && cargo fetch
```

Expected: downloads `tauri-plugin-positioner` and its dependencies, no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add tauri-plugin-positioner dependency"
```

---

### Task 2: Register plugin and replace positioning logic in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the import**

At the top of `src-tauri/src/lib.rs`, add after the existing `use tauri::` block:

```rust
use tauri_plugin_positioner::{WindowExt, Position};
```

- [ ] **Step 2: Register the plugin**

In the `tauri::Builder::default()` chain (inside `run()`), add `.plugin(tauri_plugin_positioner::init())` before `.invoke_handler`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_positioner::init())
    .invoke_handler(tauri::generate_handler![greet])
```

- [ ] **Step 3: Replace the manual positioning block**

Inside the tray click handler, remove this entire block:

```rust
if let Ok(Some(tray_rect)) = tray.rect() {
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = tray_rect.position.to_physical::<f64>(scale);
    let size = tray_rect.size.to_physical::<f64>(scale);
    let window_width = 300.0_f64;

    let x = pos.x + (size.width / 2.0) - (window_width / 2.0);
    let y = pos.y + size.height;

    let _ = window.set_position(
        tauri::PhysicalPosition::new(x as i32, y as i32)
    );
}
```

Replace with:

```rust
let _ = window.move_window(Position::TrayBottomCenter);
```

The final `else` branch (the full `if is_visible { hide } else { show }` block) should look like this after the change:

```rust
} else {
    let _ = window.move_window(Position::TrayBottomCenter);

    #[cfg(target_os = "macos")]
    let _ = app.show();

    let _ = window.show();
    let _ = window.set_focus();
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd src-tauri && cargo build
```

Expected: compiles with no errors. Warnings about unused imports (e.g. `tauri::PhysicalPosition`) may appear — remove them if so.

- [ ] **Step 5: Remove any now-unused imports**

If `cargo build` warns about unused imports, remove from the top of `lib.rs` any that are no longer needed. The `tauri::Manager` and tray-related imports should remain. `tauri::PhysicalPosition` is no longer needed and can be removed if it was imported explicitly.

- [ ] **Step 6: Run the app and verify behavior**

```bash
cd /Users/lucas/www/clipboard_widget && cargo tauri dev
```

Verify:
- Clicking the tray icon shows the widget centered below the icon
- Clicking again hides it
- Widget is correctly positioned on Retina displays

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: use tauri-plugin-positioner for tray positioning"
```
