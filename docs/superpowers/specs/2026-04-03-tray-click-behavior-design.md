# Tray Icon Click Behavior

**Date:** 2026-04-03

## Problem

No macOS, o `TrayIconBuilder` do Tauri v2 exibe o menu de contexto no clique esquerdo por padrão quando um menu está configurado. Isso impede que o clique esquerdo acione o `on_tray_icon_event`, que é responsável pelo toggle do widget.

## Goal

- Clique esquerdo no ícone da barra de sistema → abre/fecha o widget
- Clique direito no ícone da barra de sistema → exibe menu com "Encerrar Bark"

## Solution

Adicionar `.menu_on_left_click(false)` no `TrayIconBuilder` em `src-tauri/src/lib.rs`.

Esta flag faz o Tauri exibir o menu apenas no clique direito, liberando o clique esquerdo para ser tratado pelo `on_tray_icon_event` — onde o toggle do widget já está implementado.

## Change

**File:** `src-tauri/src/lib.rs`

```rust
TrayIconBuilder::with_id("bark-tray")
    .icon(tauri::include_image!("icons/tray_normal.png"))
    .tooltip("Bark")
    .menu(&tray_menu)
    .menu_on_left_click(false)  // add this line
    .on_menu_event(|app, event| { ... })
    .on_tray_icon_event(|tray, event| { ... })
    .build(app)?;
```

## No other changes needed

O handler de menu (`on_menu_event`) e o handler de clique (`on_tray_icon_event`) já estão implementados corretamente.
