---
date: 2026-04-02
topic: tray-positioner
status: approved
---

# Tray Positioner — Design Spec

**Date:** 2026-04-02

## Goal

Replace the manual tray-icon positioning logic in `src-tauri/src/lib.rs` with `tauri-plugin-positioner`, positioning the widget at `TrayBottomCenter` (centered below the tray icon).

## Motivation

The current implementation manually computes `x/y` from `tray.rect()` to position the window below the tray icon. `tauri-plugin-positioner` is the official Tauri plugin for this purpose — it handles multi-monitor, Retina displays, and edge cases internally, reducing ~15 lines of positioning code to a single call.

---

## Changes

### 1. `Cargo.toml` — add dependency

```toml
tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }
```

The `tray-icon` feature is required to enable `Position::TrayBottomCenter` and related tray-relative positions.

### 2. `src-tauri/src/lib.rs` — register plugin

Add to the builder chain in `run()`:

```rust
.plugin(tauri_plugin_positioner::init())
```

### 3. `src-tauri/src/lib.rs` — add import

```rust
use tauri_plugin_positioner::{WindowExt, Position};
```

### 4. `src-tauri/src/lib.rs` — replace manual positioning

Remove the entire `tray.rect()` block:

```rust
// REMOVE: manual positioning block (~15 lines)
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

---

## What Does NOT Change

- Frontend (`App.tsx`) — untouched
- `tauri.conf.json` — untouched
- Toggle (show/hide) logic — untouched
- macOS activation policy — untouched

---

## Relation to Previous Spec

The prior spec `2026-04-02-menu-bar-widget-design.md` stated "No new dependencies" and described the manual positioning calculation. This spec supersedes that positioning section. All other parts of the previous spec remain valid.

---

## Success Criteria

- Widget appears centered below the tray icon on click
- Behavior is identical on Retina and non-Retina displays
- No manual `tray.rect()` or `set_position` calls remain in `lib.rs`
- App compiles without warnings related to the removed code
