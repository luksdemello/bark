# Logging Design — Bark

**Date:** 2026-04-08
**Status:** Approved

## Objetivo

Adicionar logging persistente ao Bark para identificar a causa de crashes após o build de produção. Atualmente, erros silenciosos após `tauri build` não deixam rastro.

## Abordagem

Usar `tauri-plugin-log` (oficial Tauri v2), que integra com o crate `log` no Rust e expõe uma API JavaScript. Logs são despachados para dois targets simultâneos: arquivo em disco e stdout (Console.app).

## Arquitetura

```
Rust (log::warn!, log::error!, ...)
          ↘
            tauri-plugin-log ──→ arquivo ~/Library/Logs/com.bark.app/bark.log
          ↗                  ──→ stdout (Console.app / log stream)
JS (@tauri-apps/plugin-log)
```

### Targets

| Target | Localização | Visibilidade |
|--------|-------------|--------------|
| Arquivo | `~/Library/Logs/com.bark.app/bark.log` | `tail -f` ou Console.app |
| Stdout | stdout do processo | `log stream` ou Console.app |

### Rotação de arquivo

- Tamanho máximo por arquivo: 5 MB
- Máximo de arquivos: 3 (`bark.log`, `bark.log.1`, `bark.log.2`)
- Total máximo em disco: ~15 MB

### Níveis por ambiente

| Ambiente | Nível mínimo | O que é registrado |
|----------|--------------|--------------------|
| dev | `debug` | tudo |
| release | `warn` | warnings e erros |

## Instrumentação — Backend Rust

### `lib.rs` (inicialização)

- `info!` — app iniciada, caminho do app data dir
- `error!` — falha ao criar diretório de dados, falha ao inicializar DB
- `warn!` — falha ao aplicar vibrancy (não fatal)

### `db.rs`

- `info!` — DB inicializado, caminho do arquivo sqlite
- `error!` — falhas em queries e migrações

### `monitor.rs`

- `debug!` — novo item detectado no clipboard (filtrado em release)
- `error!` — falha ao salvar item no DB

### `commands.rs`

- `warn!` — operações que falham mas não crasham (ex: item não encontrado)
- `error!` — falhas inesperadas em comandos Tauri

### `use_cases.rs`

- `debug!` — entrada/saída dos use cases principais

## Instrumentação — Frontend React/TypeScript

- Substituir `console.error` por `error()` do `@tauri-apps/plugin-log` nos serviços:
  - `uploadService.ts`
  - `clipboardService.ts`
  - `useClipboard.ts`
  - `useUpload.ts`
- Adicionar handler global em `main.tsx`:
  - `window.addEventListener('unhandledrejection', ...)` → `error()`
  - `window.onerror` → `error()`

## Formato de log

```
2026-04-08T14:23:01.123Z [ERROR] bark > commands: failed to copy item: no such record id=42
```

Campos: timestamp ISO 8601, nível, módulo de origem, mensagem.

## Como visualizar logs

```bash
# Tempo real via sistema (dev)
log stream --predicate 'subsystem == "com.bark.app"' --level debug

# Arquivo diretamente
tail -f ~/Library/Logs/com.bark.app/bark.log

# Buscar erros após crash
grep -i error ~/Library/Logs/com.bark.app/bark.log
```

## Dependências a adicionar

**Rust (`Cargo.toml`):**
```toml
tauri-plugin-log = "2"
log = "0.4"
```

**Node (`package.json`):**
```
@tauri-apps/plugin-log
```

**Permissões (`capabilities`):**
```json
"tauri-plugin-log:default"
```
