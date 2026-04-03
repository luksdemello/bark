# Design: Encerrar o App Bark

**Data:** 2026-04-03  
**Status:** Aprovado

## Resumo

Adicionar dois pontos de entrada para encerrar o app Bark:
1. Item "Encerrar Bark" no menu de contexto (clique direito) do ícone do tray
2. Botão de encerrar no header da janela do app

## Arquitetura

### Backend — Rust

**`src-tauri/src/commands.rs`**

Adicionar o comando `quit_app`:

```rust
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
```

**`src-tauri/src/lib.rs`**

- Registrar `commands::quit_app` no `invoke_handler`
- Criar um `Menu` nativo do Tauri com um `MenuItem` de id `"quit"` e label `"Encerrar Bark"`
- Passar o menu para o `TrayIconBuilder` via `.menu(&menu)`
- Adicionar handler `.on_menu_event` que chama `app.exit(0)` quando `event.id == "quit"`

### Frontend — React/TypeScript

**`src/App.tsx`**

- Adicionar ícone SVG `QuitIcon` (X ou power)
- No header, à direita do título, adicionar `<button className="quit-btn">` que chama `invoke("quit_app")`

**`src/App.css`** (se necessário)

- Estilo para `.quit-btn` — discreto, alinhado à direita do header

## Fluxo de dados

```
Clique direito no tray → menu nativo macOS → on_menu_event → app.exit(0)
Clique no botão header → invoke("quit_app") → comando Rust → app.exit(0)
```

## O que não está incluído

- Confirmação antes de encerrar (YAGNI — não foi pedido)
- Opção de "minimizar para o tray" (comportamento atual já funciona assim)
