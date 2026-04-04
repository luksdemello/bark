# Ícone de Progresso no Tray — Especificação de Design

**Data:** 2026-04-04

## Visão Geral

Durante um upload de arquivo (drag-drop), o ícone da barra de menus do macOS não dá nenhum feedback visual. Esta spec adiciona um anel de progresso ao ícone do tray — espelhando o anel de progresso do `DogIcon` no app — usando frames PNG pré-gerados que o backend Rust troca conforme eventos emitidos pelo frontend.

---

## Arquitetura

```
useUpload (frontend)
  └─ emite "upload-progress" { progress: number }
        │
        ▼
lib.rs listen handler (backend)
  └─ mapeia progress → bucket (10, 20, …, 100, 0)
  └─ chama tray.set_icon(tray_progress_<bucket>.png)
        │   ou tray_normal.png quando progress = 0
```

---

## Componentes

### 1. Set de ícones PNG

- Arquivos: `src-tauri/icons/tray_progress_10.png` até `tray_progress_100.png` (10 arquivos)
- Cada um tem o mesmo cachorro do `tray_normal.png` com um arco parcial sobreposto (técnica stroke-dasharray), igual ao anel no app
- Gerados por um script único (`scripts/generate_tray_progress_icons.mjs`) usando `sharp` ou pipeline Node SVG→PNG
- Tamanho: igual aos ícones de tray existentes (mesmas dimensões do `tray_normal.png`, tipicamente 32×32 ou 44×44 @2x)
- Cor: `#0a84ff` (mesma do `ring-fill` em `Icons.tsx`)

### 2. Frontend — `useUpload.ts`

- Após cada chamada `setProgress(current)`, emitir `"upload-progress"` com `{ progress: current }` via `emit()` do `@tauri-apps/api/event`
- Após o reset (quando `setFilename(null)` + `setProgress(0)`), emitir `"upload-progress"` com `{ progress: 0 }` para o backend voltar ao ícone normal

Nenhuma outra alteração em `useUpload.ts`.

### 3. Backend — `lib.rs`

Dentro do `.setup()`, após o tray ser criado, registrar um listener global:

```rust
app.listen("upload-progress", move |event| {
    // desserializar { progress: u8 }
    // bucket = arredondar para o 10 mais próximo, clamp 0..=100
    // se bucket == 0 → tray_normal.png
    // senão          → tray_progress_<bucket>.png
    // tray.set_icon(...)
});
```

O listener guarda um clone do `AppHandle` para resolver o tray pelo id (`"bark-tray"`).

O reset para `tray_normal.png` acontece quando o frontend emite `progress: 0` — sem timer extra no backend.

---

## Fluxo de Dados

1. Usuário solta um arquivo → `tauri://drag-drop` dispara
2. `useUpload` inicia um `setInterval` incrementando `progress` em 5 a cada 100ms
3. A cada tick: `setProgress(current)` + `emit("upload-progress", { progress: current })`
4. Listener no backend recebe o evento, escolhe o PNG correto, chama `set_icon`
5. Ao chegar em 100%: frontend limpa o interval, aguarda 500ms, reseta `progress` para 0 e emite `{ progress: 0 }`
6. Backend recebe 0 → restaura `tray_normal.png`

---

## Tratamento de Erros

- Se o tray não for encontrado pelo id, o listener retorna silenciosamente (igual ao padrão do `tray_animation.rs`)
- Se a desserialização do JSON falhar, o listener retorna silenciosamente (sem crash)
- Os PNGs são embutidos em tempo de compilação com `tauri::include_image!` — arquivos faltando viram erros de compilação, não de runtime

---

## Fora do Escopo

- Geração dinâmica de ícones em Rust (adiado)
- Exibir progresso no badge do Dock ou na barra de progresso da janela
- Persistir estado do ícone entre reinicializações do app
