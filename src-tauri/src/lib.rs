use tauri::{
    Manager,
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    WindowEvent
};
use tauri_plugin_positioner::{WindowExt, Position};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // 🔥 Impede fechar ao perder foco
            if let Some(window) = app.get_webview_window("tray-window") {
                window.on_window_event(|event| {
                    if let WindowEvent::Focused(false) = event {
                        // Não faz nada → mantém janela aberta
                    }
                });
            }

            TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/icon.png"))
                .tooltip("Jimmy Widget")
                .on_tray_icon_event(|tray, event| {
                    // ✅ Corrige bug de abrir e fechar no mesmo clique
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("tray-window") {
                            let is_visible = window.is_visible().unwrap_or(false);

                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.move_window(Position::TrayBottomCenter);

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