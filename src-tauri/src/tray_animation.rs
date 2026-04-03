use std::time::Duration;

pub fn animate_ears(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let tray = match app.tray_by_id("bark-tray") {
            Some(t) => t,
            None => return,
        };

        let normal = tauri::include_image!("icons/tray_normal.png");
        let ears_up = tauri::include_image!("icons/tray_ears_up.png");
        let ears_down = tauri::include_image!("icons/tray_ears_down.png");

        let ears_up2 = ears_up.clone();
        let frames: Vec<(tauri::image::Image<'_>, u64)> = vec![
            (ears_up, 150),
            (ears_down, 150),
            (ears_up2, 150),
            (normal, 0),
        ];

        for (frame, delay_ms) in frames {
            tray.set_icon(Some(frame)).ok();
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
        }
    });
}
