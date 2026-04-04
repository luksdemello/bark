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
            std::fs::create_dir_all(&images_dir).ok();
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

            let quit_item =
                MenuItem::with_id(app, "quit", "Encerrar Bark", true, None::<&str>)?;
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
                                let _ = std::panic::catch_unwind(
                                    std::panic::AssertUnwindSafe(|| {
                                        let _ = window.move_window(Position::TrayBottomCenter);
                                    }),
                                );
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
