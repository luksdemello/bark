# Clipboard History — Design Spec

## Overview

Implementar a listagem funcional do histórico de clipboard no Bark, substituindo os dados mock atuais por monitoramento real do clipboard do sistema. Usar o plugin `tauri-plugin-clipboard` (CrossCopy) para captura de texto e imagem, com persistência em SQLite.

## Decisões

- **Arquitetura:** Backend-heavy — toda a lógica no Rust, frontend apenas renderiza
- **Persistência:** SQLite via `rusqlite`, sobrevive ao reiniciar o app
- **Tipos suportados:** Texto e imagem desde o início
- **Monitoramento:** Tempo real via clipboard monitor do plugin
- **Limite:** 50 itens por padrão, configurável
- **Imagens:** Salvas como PNG em disco, path no SQLite, thumbnail BLOB para lista
- **Feedback de cópia:** Animação das orelhas do dog no tray icon
- **Plugin:** https://github.com/CrossCopy/tauri-plugin-clipboard

## Arquitetura

```
┌─────────────────────────────────────┐
│           Rust Backend              │
│                                     │
│  ┌──────────┐   ┌───────────────┐   │
│  │ Clipboard │──▶│  ClipboardDB  │   │
│  │  Monitor  │   │   (SQLite)    │   │
│  └──────────┘   └───────┬───────┘   │
│       │                 │           │
│       │          ┌──────┴───────┐   │
│       │          │ Image Store  │   │
│       │          │ (PNG files)  │   │
│       │          └──────────────┘   │
│       │                             │
│  ┌────▼─────────────────────────┐   │
│  │     Tauri Commands / Events  │   │
│  └────┬─────────────────────────┘   │
│       │                             │
└───────┼─────────────────────────────┘
        │ IPC
┌───────▼─────────────────────────────┐
│         React Frontend              │
│  ┌──────────┐  ┌─────────────────┐  │
│  │ Clipboard │  │  Event Listener │  │
│  │   List    │  │ (new_clip event)│  │
│  └──────────┘  └─────────────────┘  │
└─────────────────────────────────────┘
```

### Fluxo Principal

1. O **Clipboard Monitor** (Rust) detecta mudança no clipboard do sistema
2. Lê o conteúdo (texto ou imagem) via `tauri-plugin-clipboard`
3. Salva no **SQLite** (texto inline, imagem como path para PNG)
4. Emite um **Tauri event** (`clipboard://new-item`) para o frontend
5. O frontend atualiza a lista em tempo real

### Tauri Commands

- `get_clipboard_history(page, limit)` — lista paginada do histórico
- `copy_item(id)` — copia um item do histórico para o clipboard
- `delete_item(id)` — remove um item do histórico
- `clear_history()` — limpa todo o histórico
- `get_settings()` / `update_settings(max_items)` — configurações

## Modelo de Dados

### Tabela `clipboard_items`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK | Auto-increment |
| `content_type` | TEXT | `"text"` ou `"image"` |
| `text_content` | TEXT | Conteúdo quando é texto (null para imagens) |
| `image_path` | TEXT | Path relativo do PNG (null para texto) |
| `image_thumb` | BLOB | Thumbnail ~64px para lista (null para texto) |
| `created_at` | INTEGER | Timestamp Unix |

### Tabela `settings`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `key` | TEXT PK | Nome da configuração |
| `value` | TEXT | Valor serializado |

Settings iniciais: `max_items = 50`.

### Armazenamento de Imagens

- Diretório: `{app_data_dir}/images/`
- Nome: `{timestamp}_{hash_short}.png`
- Thumbnail: ~64px largura, armazenado como BLOB no SQLite

### Deduplicação

Antes de inserir, verificar se o último item é idêntico:
- **Texto:** comparação direta do conteúdo
- **Imagem:** comparação do hash SHA-256 dos bytes

## Clipboard Monitor

### Inicialização

- Registrar o plugin no Tauri builder: `.plugin(tauri_plugin_clipboard::init())`
- Ao iniciar o app, chamar `start_monitor` para começar a escutar mudanças
- O plugin emite eventos Tauri (`plugin:clipboard://clipboard-monitor/update`) que o backend escuta via `app.listen`
- No handler, verificar o tipo de conteúdo e processar

### Fluxo de Captura — Texto

1. Monitor detecta mudança
2. Lê texto via plugin API
3. Compara com último item — se idêntico, ignora
4. Insere no SQLite
5. Se total de itens > `max_items`, deleta os mais antigos
6. Emite event `clipboard://new-item` para o frontend

### Fluxo de Captura — Imagem

1. Monitor detecta mudança
2. Lê imagem via plugin API (bytes)
3. Calcula hash SHA-256 para deduplicação
4. Salva PNG em `{app_data_dir}/images/{timestamp}_{hash_short}.png`
5. Gera thumbnail (redimensiona para ~64px largura)
6. Insere no SQLite (path + thumbnail BLOB)
7. Limpa itens antigos se necessário (deleta PNG do disco também)
8. Emite event para o frontend

### Auto-limpeza

- Quando um item de imagem é deletado (manual ou por limite), o arquivo PNG correspondente é removido do disco.
- **Expiração de 24h:** itens que não forem copiados dentro de 24 horas são automaticamente removidos do histórico. Uma tarefa periódica (a cada 5 minutos) verifica e remove itens expirados.

## Animação do Tray Icon

### Feedback de Cópia

Ao executar `copy_item`, o tray icon anima as orelhas do dog mascot:

- **Frames:** 3-4 variantes do ícone PNG
  1. `tray_normal.png` — orelhas na posição padrão
  2. `tray_ears_up.png` — orelhas levantadas
  3. `tray_ears_down.png` — orelhas abaixadas
- **Sequência:** normal → up → down → up → normal
- **Duração:** ~600ms total (~150ms por frame)
- **Implementação:** task async no Rust que alterna o tray icon entre os frames

## Frontend

### Estado

- `clipboardItems: ClipboardItem[]` — lista carregada do backend
- `settings: Settings` — configurações (max_items)
- Listener no event `clipboard://new-item` para adicionar itens em tempo real

### Modificações no App.tsx

Substituir os dados mock por dados reais. A estrutura visual existente se mantém:
- Lista com item types (text, image, link)
- Hover actions (copy, delete)
- Timestamps relativos

### Interações

- **Copiar:** `invoke("copy_item", { id })` → backend copia + anima tray
- **Deletar:** `invoke("delete_item", { id })` → remove do state local
- **Scroll infinito:** ao chegar no fim da lista, carrega mais via `get_clipboard_history(page, limit)`

### Imagens na Lista

- Thumbnail (base64 do BLOB) vem no payload para renderização rápida
- Ao copiar imagem, backend lê o arquivo PNG completo do disco

### Detecção de Links

No frontend: se texto começa com `http://` ou `https://`, renderiza como tipo "link" com o ícone de link existente.

## Dependências Novas

### Rust (Cargo.toml)

- `tauri-plugin-clipboard` — monitoramento e manipulação do clipboard
- `rusqlite` (com feature `bundled`) — banco SQLite
- `sha2` — hash SHA-256 para deduplicação de imagens
- `image` — redimensionamento para thumbnails

### Frontend (package.json)

- `tauri-plugin-clipboard-api` — API JS do plugin, necessária para registrar o plugin no frontend (`register` call)
