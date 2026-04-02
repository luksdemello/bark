# Menu Bar Widget — Design Spec

**Date:** 2026-04-02

## Goal

Transform the clipboard_widget into a pure menu bar app: no Dock icon, no default window on launch. Clicking the tray icon toggles a floating widget positioned directly below the icon. The widget stays always on top and never closes when clicking outside.

## Scope

Single file change: `src-tauri/src/lib.rs`. No frontend changes. No new dependencies.

---

## Changes

### 1. Hide from Dock — macOS Activation Policy

Add inside `.setup()`:

```rust
#[cfg(target_os = "macos")]
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```

- Removes the app from the Dock and from Cmd+Tab App Switcher.
- App lives exclusively in the menu bar.
- Guarded by `#[cfg(target_os = "macos")]` so it doesn't affect other platforms.

### 2. Position Widget Below Tray Icon

On tray click, before calling `window.show()`, compute position using `tray.rect()`:

```
x = tray_rect.position.x + (tray_rect.size.width / 2) - (window_width / 2)
y = tray_rect.position.y + tray_rect.size.height
```

Then call `window.set_position(PhysicalPosition::new(x, y))`.

- `tray.rect()` returns `Option<Rect>` — if `None`, skip repositioning and show at last position.
- Window size is 300×200 as defined in `tauri.conf.json`.
- Physical coordinates are used to handle Retina displays correctly.

### 3. No Close on Click Outside

No `focus_changed` or `blur` handler is added. The widget is dismissed only by clicking the tray icon again (toggle). This is intentional per requirements.

### 4. Startup Visibility

`tauri.conf.json` already has `"visible": false` on the `tray-window`. No change needed — the window is hidden at launch.

---

## tauri.conf.json (no changes)

Already correct:
- `"label": "tray-window"` ✓
- `"visible": false` ✓
- `"alwaysOnTop": true` ✓
- `"decorations": false` ✓
- `"resizable": false` ✓

---

## What Does NOT Change

- Frontend (`App.tsx`) — untouched
- `tauri.conf.json` — untouched
- `Cargo.toml` — no new dependencies needed

---

## Success Criteria

- App launches with no window and no Dock icon
- Clicking tray icon shows the widget positioned below the icon
- Clicking tray icon again hides the widget
- Widget stays visible when clicking anywhere else on screen
- Widget renders above all other windows (`alwaysOnTop`)
