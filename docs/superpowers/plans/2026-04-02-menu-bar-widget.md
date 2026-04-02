# Menu Bar Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o app em um widget de menu bar puro — sem ícone no Dock, sem janela padrão, com o widget posicionado abaixo do tray icon ao clicar.

**Architecture:** Todas as mudanças ficam em `src-tauri/src/lib.rs`. Usamos a macOS activation policy `Accessory` para remover o app do Dock, e `tray.rect()` para posicionar a janela antes de exibi-la. Nenhuma lógica de fechar ao perder foco é adicionada.

**Tech Stack:** Tauri v2 (Rust), `tauri::ActivationPolicy::Accessory`, `TrayIconEvent`, `tray.rect()`, `WebviewWindow::set_position()`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src-tauri/src/lib.rs` | Modificar | Activation policy + posicionamento |
| `src-tauri/tauri.conf.json` | Sem mudança | Janela já configurada corretamente |

---

### Task 1: Esconder o app do Dock (macOS activation policy)

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Adicionar activation policy no setup**

Abrir `src-tauri/src/lib.rs` e, dentro do closure `.setup(|app| {`, adicionar antes do `TrayIconBuilder`:

```rust
#[cfg(target_os = "macos")]
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```

O arquivo inteiro deve ficar assim:

```rust
use tauri::{
    Manager,
    tray::{TrayIconBuilder, TrayIconEvent}
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/icon.png"))
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("tray-window") {
                            let is_visible = window.is_visible().unwrap();

                            if is_visible {
                                window.hide().unwrap();
                            } else {
                                window.show().unwrap();
                                window.set_focus().unwrap();
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
```

- [ ] **Step 2: Compilar e verificar que não há erros**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error"
```

Esperado: nenhuma linha de output (sem erros de compilação).

- [ ] **Step 3: Rodar o app e verificar comportamento**

```bash
cargo tauri dev
```

Verificar manualmente:
- O app NÃO aparece no Dock
- O app NÃO aparece no Cmd+Tab
- O ícone aparece na menu bar
- Clicar no ícone mostra/esconde a janela (comportamento existente continua funcionando)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: hide app from Dock using macOS Accessory activation policy"
```

---

### Task 2: Posicionar o widget abaixo do tray icon

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Adicionar posicionamento no handler de clique**

Substituir o bloco `else` dentro do handler de clique (onde a janela é mostrada) para calcular a posição antes de chamar `show()`.

O arquivo final completo:

```rust
use tauri::{
    Manager,
    tray::{TrayIconBuilder, TrayIconEvent}
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/icon.png"))
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("tray-window") {
                            let is_visible = window.is_visible().unwrap_or(false);

                            if is_visible {
                                window.hide().unwrap();
                            } else {
                                if let Ok(Some(tray_rect)) = tray.rect() {
                                    let window_width = 300.0_f64;
                                    let x = tray_rect.position.x
                                        + (tray_rect.size.width / 2.0)
                                        - (window_width / 2.0);
                                    let y = tray_rect.position.y + tray_rect.size.height;
                                    let _ = window.set_position(
                                        tauri::PhysicalPosition::new(x as i32, y as i32)
                                    );
                                }
                                window.show().unwrap();
                                window.set_focus().unwrap();
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
```

Nota: `unwrap()` na visibilidade foi trocado por `unwrap_or(false)` para robustez. O `let _ =` no `set_position` ignora silenciosamente caso a posição não possa ser definida (raro).

- [ ] **Step 2: Compilar e verificar que não há erros**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error"
```

Esperado: nenhuma linha de output.

- [ ] **Step 3: Rodar o app e verificar posicionamento**

```bash
cargo tauri dev
```

Verificar manualmente:
- Clicar no ícone na menu bar: o widget aparece **abaixo e centralizado** no ícone
- Clicar novamente: o widget some
- Clicar fora do widget: o widget **permanece visível** (não fecha)
- O widget fica **na frente** de todas as outras janelas

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: position tray widget below menu bar icon on click"
```
