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
                            let is_visible: bool = window.is_visible().unwrap_or(false);

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
