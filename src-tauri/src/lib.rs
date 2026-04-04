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
    Emitter, Listener, Manager, WindowEvent,
};
use tauri_plugin_positioner::{Position, WindowExt};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::search_clipboard_history,
            commands::get_item_by_id,
            commands::copy_item,
            commands::pin_item,
            commands::delete_item,
            commands::clear_history,
            commands::get_settings,
            commands::update_settings,
            commands::upload_file,
            commands::quit_app,
            commands::write_text_to_clipboard,
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

                let window_app = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::Focused(true) = event {
                        let _ = window_app.emit("window-shown", ());
                    }
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
                        position,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("tray-window") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                // Tenta usar o positioner; se falhar, posiciona manualmente
                                // a partir das coordenadas do clique no ícone do tray.
                                if window.move_window(Position::TrayBottomCenter).is_err() {
                                    if let (Ok(win_size), Ok(scale)) = (
                                        window.outer_size(),
                                        window.scale_factor(),
                                    ) {
                                        let x = (position.x - win_size.width as f64 / 2.0 / scale)
                                            .max(0.0) as i32;
                                        let y = (position.y / scale) as i32 + 4;
                                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                                    }
                                }
                                #[cfg(target_os = "macos")]
                                let _ = app.show();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // listener de progresso de upload → troca ícone do tray
            let progress_app = app.handle().clone();
            app.listen("upload-progress", move |event: tauri::Event| {
                #[derive(serde::Deserialize)]
                struct Payload { progress: u8 }

                let Ok(payload) = serde_json::from_str::<Payload>(event.payload()) else { return };
                let Some(tray) = progress_app.tray_by_id("bark-tray") else { return };

                // arredonda para o bucket de 10 mais próximo
                let bucket = ((payload.progress as u32 + 5) / 10 * 10).min(100);

                let icon = match bucket {
                    10  => tauri::include_image!("icons/tray_progress_10.png"),
                    20  => tauri::include_image!("icons/tray_progress_20.png"),
                    30  => tauri::include_image!("icons/tray_progress_30.png"),
                    40  => tauri::include_image!("icons/tray_progress_40.png"),
                    50  => tauri::include_image!("icons/tray_progress_50.png"),
                    60  => tauri::include_image!("icons/tray_progress_60.png"),
                    70  => tauri::include_image!("icons/tray_progress_70.png"),
                    80  => tauri::include_image!("icons/tray_progress_80.png"),
                    90  => tauri::include_image!("icons/tray_progress_90.png"),
                    100 => tauri::include_image!("icons/tray_progress_100.png"),
                    _   => tauri::include_image!("icons/tray_normal.png"),
                };

                tray.set_icon(Some(icon)).ok();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
