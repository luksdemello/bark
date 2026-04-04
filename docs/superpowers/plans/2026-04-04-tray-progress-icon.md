# Tray Progress Icon — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir um anel de progresso no ícone do tray durante uploads, trocando entre 10 PNGs pré-gerados conforme eventos emitidos pelo frontend.

**Architecture:** O frontend (`useUpload.ts`) emite o evento `"upload-progress"` a cada tick do interval. O backend (`lib.rs`) escuta esse evento, arredonda para o bucket de 10% mais próximo e troca o ícone do tray pelo PNG correspondente. Quando `progress` volta a 0, o ícone normal é restaurado.

**Tech Stack:** Python 3 + Pillow (geração dos PNGs), TypeScript + `@tauri-apps/api/event` (emit), Rust + Tauri 2 (listener + `set_icon`)

---

## Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `scripts/generate_tray_progress_icons.py` | Gera os 10 PNGs de progresso |
| Criar | `src-tauri/icons/tray_progress_10.png` … `tray_progress_100.png` | Ícones com arco parcial |
| Modificar | `src/hooks/useUpload.ts` | Emitir evento `"upload-progress"` a cada tick |
| Modificar | `src-tauri/src/lib.rs` | Registrar listener e trocar ícone |

---

## Task 1: Gerar os ícones PNG de progresso

**Files:**
- Create: `scripts/generate_tray_progress_icons.py`
- Create: `src-tauri/icons/tray_progress_10.png` … `tray_progress_100.png`

- [ ] **Step 1: Criar o script de geração**

Criar `scripts/generate_tray_progress_icons.py`:

```python
#!/usr/bin/env python3
"""
Gera tray_progress_10.png … tray_progress_100.png a partir de tray_normal.png.
Cada arquivo tem um arco de progresso azul (#0a84ff) sobreposto.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path(__file__).parent.parent / "src-tauri" / "icons" / "tray_normal.png"
OUT = Path(__file__).parent.parent / "src-tauri" / "icons"

RING_COLOR = (10, 132, 255, 220)   # #0a84ff com leve transparência
RING_WIDTH = 3
# bounding box do arco dentro dos 44×44 px
MARGIN = 1
BOX = [MARGIN, MARGIN, 44 - MARGIN, 44 - MARGIN]


def arc_end(progress: int) -> float:
    """Converte progresso (0-100) para ângulo final (partindo de -90°)."""
    return -90 + 360 * progress / 100


for step in range(10, 110, 10):
    base = Image.open(SRC).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    draw.arc(
        BOX,
        start=-90,
        end=arc_end(step),
        fill=RING_COLOR,
        width=RING_WIDTH,
    )

    result = Image.alpha_composite(base, overlay)
    out_path = OUT / f"tray_progress_{step}.png"
    result.save(out_path)
    print(f"  {out_path.name}")

print("Done.")
```

- [ ] **Step 2: Executar o script**

```bash
python3 scripts/generate_tray_progress_icons.py
```

Saída esperada:
```
  tray_progress_10.png
  tray_progress_20.png
  tray_progress_30.png
  tray_progress_40.png
  tray_progress_50.png
  tray_progress_60.png
  tray_progress_70.png
  tray_progress_80.png
  tray_progress_90.png
  tray_progress_100.png
Done.
```

- [ ] **Step 3: Verificar os arquivos gerados**

```bash
ls -la src-tauri/icons/tray_progress_*.png
```

Esperado: 10 arquivos, cada um com ~3-5 KB.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_tray_progress_icons.py src-tauri/icons/tray_progress_*.png
git commit -m "feat: add tray progress icon PNGs and generation script"
```

---

## Task 2: Frontend — emitir evento de progresso

**Files:**
- Modify: `src/hooks/useUpload.ts`

- [ ] **Step 1: Adicionar import do `emit`**

Em `src/hooks/useUpload.ts`, adicionar `emit` ao import existente do Tauri:

```typescript
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
```

(ou numa linha só: `import { listen, emit } from "@tauri-apps/api/event";`)

- [ ] **Step 2: Emitir progresso a cada tick do interval**

Dentro do callback do `setInterval`, após `setProgress(current)`, adicionar:

```typescript
emit("upload-progress", { progress: current });
```

A seção do interval fica assim:

```typescript
let current = 0;
intervalRef.current = window.setInterval(() => {
  current += 5;
  if (current >= 100) {
    const id = intervalRef.current;
    if (id !== null) clearInterval(id);
    intervalRef.current = null;
    setProgress(100);
    emit("upload-progress", { progress: 100 });
    resetRef.current = window.setTimeout(() => {
      resetRef.current = null;
      setFilename(null);
      setProgress(0);
      emit("upload-progress", { progress: 0 });
    }, 500);
  } else {
    setProgress(current);
    emit("upload-progress", { progress: current });
  }
}, 100);
```

- [ ] **Step 3: Verificar que o app builda sem erros**

```bash
npm run build
```

Esperado: sem erros de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUpload.ts
git commit -m "feat: emit upload-progress event from useUpload"
```

---

## Task 3: Backend — listener para trocar o ícone do tray

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Adicionar o listener em `lib.rs`**

Após a chamada `.build(app)?;` do `TrayIconBuilder` (linha ~114), e ainda dentro do bloco `.setup(|app| { ... })`, adicionar:

```rust
// listener de progresso de upload → troca ícone do tray
let progress_app = app.handle().clone();
app.listen("upload-progress", move |event| {
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
```

- [ ] **Step 2: Compilar e verificar**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Esperado: `Compiling clipboard-widget ...` terminando sem erros. Se algum PNG estiver faltando, o erro de compilação vai apontar o arquivo.

- [ ] **Step 3: Testar manualmente**

Iniciar o app em dev:

```bash
npm run tauri dev
```

Arrastar um arquivo para a janela do app. Observar:
- O ícone do tray deve exibir o arco de progresso crescendo de 10% a 100%
- Após ~500ms no 100%, o ícone deve voltar ao normal (`tray_normal.png`)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: swap tray icon based on upload-progress events"
```
