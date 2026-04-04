# DropZone com Progresso & Anel no DogIcon — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIO: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Goal:** Migrar DropZone para react-dropzone e adicionar feedback visual de progresso (barra no DropZone, anel SVG no DogIcon e animação de orelhas) durante upload simulado.

**Architecture:** Um novo hook `useUpload` gerencia o estado de upload (filename + progress + simulação). `useEars` ganha `startWiggle`/`stopWiggle` para ciclar as orelhas durante o upload. `App` conecta tudo via props.

**Tech Stack:** React 19, TypeScript, react-dropzone, SVG inline, CSS transitions.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `package.json` | Modificar | Adicionar dependência react-dropzone |
| `src/hooks/useUpload.ts` | Criar | Estado e simulação de progresso de upload |
| `src/hooks/useEars.ts` | Modificar | Adicionar startWiggle / stopWiggle |
| `src/components/Icons.tsx` | Modificar | DogIcon aceita prop `progress`, renderiza anel SVG |
| `src/components/DropZone.tsx` | Substituir | Usar useDropzone, exibir estados idle/drag/uploading |
| `src/App.tsx` | Modificar | Conectar useUpload + useEars wiggle + props |
| `src/App.css` | Modificar | Estilos do anel e do estado uploading |

---

## Tarefa 1: Instalar react-dropzone e adicionar estilos CSS

**Arquivos:**
- Modificar: `package.json`
- Modificar: `src/App.css`

> Sem framework de testes no projeto. A verificação é feita via `npx tsc --noEmit` e inspeção visual no app.

- [ ] **Passo 1: Instalar react-dropzone**

```bash
npm install react-dropzone
```

Saída esperada: `added 1 package` (react-dropzone não tem dependências extras).

- [ ] **Passo 2: Verificar que o TypeScript encontra os tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 3: Adicionar estilos ao final de `src/App.css`**

Adicionar ao final do arquivo:

```css
/* --- Anel do DogIcon --- */
.dog-ring-wrap {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ring-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 36px;
  height: 36px;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 2.5;
}

.ring-fill {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.1s linear;
}

/* --- DropZone — estado de envio --- */
.drop-zone.uploading {
  border-color: #0a84ff;
  background: rgba(10, 132, 255, 0.08);
  color: #f2f2f7;
}

.upload-filename {
  font-size: 13px;
  font-weight: 600;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #0a84ff;
  border-radius: 4px;
  transition: width 0.1s linear;
}

.upload-percent {
  font-size: 11px;
  color: #8e8e93;
}
```

- [ ] **Passo 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 5: Commit**

```bash
git add package.json package-lock.json src/App.css
git commit -m "feat: install react-dropzone and add upload progress styles"
```

---

## Tarefa 2: Criar hook `useUpload`

**Arquivos:**
- Criar: `src/hooks/useUpload.ts`

- [ ] **Passo 1: Criar `src/hooks/useUpload.ts`**

```ts
import { useState, useRef, useCallback } from "react";

export function useUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const onDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const file = files[0];
    setFilename(file.name);
    setProgress(0);

    let current = 0;
    intervalRef.current = window.setInterval(() => {
      current += 5;
      if (current >= 100) {
        setProgress(100);
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        window.setTimeout(() => {
          setFilename(null);
          setProgress(0);
        }, 500);
      } else {
        setProgress(current);
      }
    }, 100);
  }, []);

  return { filename, progress, onDrop };
}
```

- [ ] **Passo 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 3: Commit**

```bash
git add src/hooks/useUpload.ts
git commit -m "feat: add useUpload hook with simulated progress"
```

---

## Tarefa 3: Adicionar `startWiggle` e `stopWiggle` ao `useEars`

**Arquivos:**
- Modificar: `src/hooks/useEars.ts`

- [ ] **Passo 1: Substituir o conteúdo de `src/hooks/useEars.ts`**

```ts
import { useState, useCallback, useRef } from "react";
import { EarState } from "../types";

const WIGGLE_STATES: EarState[] = ["up", "normal", "down", "normal"];

export function useEars() {
  const [ears, setEars] = useState<EarState>("normal");
  const timeoutRef = useRef<number | null>(null);
  const wiggleRef = useRef<number | null>(null);

  const triggerBark = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const frames: { state: EarState; delay: number }[] = [
      { state: "up",     delay: 0   },
      { state: "down",   delay: 150 },
      { state: "up",     delay: 300 },
      { state: "normal", delay: 450 },
    ];

    frames.forEach(({ state, delay }) => {
      const timeout = window.setTimeout(() => setEars(state), delay);
      if (state === "normal") timeoutRef.current = null;
      else timeoutRef.current = timeout;
    });
  }, []);

  const startWiggle = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (wiggleRef.current) clearInterval(wiggleRef.current);

    let i = 0;
    wiggleRef.current = window.setInterval(() => {
      setEars(WIGGLE_STATES[i % WIGGLE_STATES.length]);
      i++;
    }, 250);
  }, []);

  const stopWiggle = useCallback(() => {
    if (wiggleRef.current) {
      clearInterval(wiggleRef.current);
      wiggleRef.current = null;
    }
    setEars("normal");
  }, []);

  return { ears, triggerBark, startWiggle, stopWiggle };
}
```

- [ ] **Passo 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 3: Commit**

```bash
git add src/hooks/useEars.ts
git commit -m "feat: add startWiggle and stopWiggle to useEars"
```

---

## Tarefa 4: Modificar `DogIcon` para aceitar prop `progress` e renderizar anel SVG

**Arquivos:**
- Modificar: `src/components/Icons.tsx`

- [ ] **Passo 1: Atualizar a função `DogIcon` em `src/components/Icons.tsx`**

Substituir apenas a função `DogIcon` (linhas 18–32 do arquivo original):

```tsx
export function DogIcon({ ears, progress = 0 }: { ears: EarState; progress?: number }) {
  const { left, right } = EAR_PATHS[ears];
  const circumference = 100.53; // 2π × 16
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="dog-ring-wrap">
      {progress > 0 && (
        <svg className="ring-svg" viewBox="0 0 36 36">
          <circle className="ring-bg" cx="18" cy="18" r="16" />
          <circle
            className="ring-fill"
            cx="18"
            cy="18"
            r="16"
            stroke="#0a84ff"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
      )}
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d={left}  fill="#8B4513" />
        <path d={right} fill="#8B4513" />
        <ellipse cx="12" cy="11" rx="7" ry="6" fill="#A0522D" />
        <ellipse cx="12" cy="14" rx="4" ry="3.5" fill="#DEB887" />
        <ellipse cx="12" cy="14" rx="1.5" ry="1.2" fill="#333333" />
        <circle cx="9.5" cy="10" r="1" fill="#000000" />
        <circle cx="14.5" cy="10" r="1" fill="#000000" />
        <path d="M8 15C7 15 6 16 6 18C6 20 7 21 8 21H16C17 21 18 20 18 18C18 16 17 15 16 15H8Z" fill="#A0522D" />
      </svg>
    </div>
  );
}
```

- [ ] **Passo 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 3: Commit**

```bash
git add src/components/Icons.tsx
git commit -m "feat: add progress ring to DogIcon"
```

---

## Tarefa 5: Substituir `DropZone` para usar react-dropzone

**Arquivos:**
- Substituir: `src/components/DropZone.tsx`

- [ ] **Passo 1: Substituir o conteúdo de `src/components/DropZone.tsx`**

```tsx
import { useDropzone } from "react-dropzone";
import { UploadIcon } from "./Icons";

interface DropZoneProps {
  filename: string | null;
  progress: number;
  onDrop: (files: File[]) => void;
}

export function DropZone({ filename, progress, onDrop }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <footer
      {...getRootProps()}
      className={`drop-zone${isDragActive ? " drag-over" : ""}${filename ? " uploading" : ""}`}
    >
      <input {...getInputProps()} />
      {filename ? (
        <>
          <UploadIcon />
          <div className="upload-filename">{filename}</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="upload-percent">{progress}%</div>
        </>
      ) : (
        <>
          <UploadIcon />
          <span>{isDragActive ? "Solte aqui" : "Arraste arquivos aqui"}</span>
        </>
      )}
    </footer>
  );
}
```

- [ ] **Passo 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 3: Commit**

```bash
git add src/components/DropZone.tsx
git commit -m "feat: migrate DropZone to react-dropzone with upload progress UI"
```

---

## Tarefa 6: Conectar tudo em `App.tsx`

**Arquivos:**
- Modificar: `src/App.tsx`

- [ ] **Passo 1: Substituir o conteúdo de `src/App.tsx`**

```tsx
import { useState, useRef, useEffect } from "react";
import { useClipboard } from "./hooks/useClipboard";
import { useEars } from "./hooks/useEars";
import { useSearch } from "./hooks/useSearch";
import { useUpload } from "./hooks/useUpload";
import { ClipboardListItem } from "./components/Item";
import { DogIcon } from "./components/Icons";
import { DropZone } from "./components/DropZone";
import { clipboardService } from "./services/clipboardService";
import "./App.css";

export default function App() {
  const { items, loading: clipLoading, hasMore, loadMore, deleteItem } = useClipboard();
  const { ears, triggerBark, startWiggle, stopWiggle } = useEars();
  const [searchQuery, setSearchQuery] = useState("");
  const { results: searchResults, loading: searchLoading, isActive: isSearching } = useSearch(searchQuery);
  const listRef = useRef<HTMLDivElement>(null);
  const { filename, progress, onDrop } = useUpload();

  useEffect(() => {
    if (filename) startWiggle();
    else stopWiggle();
  }, [filename]);

  const handleCopy = async (id: number) => {
    await clipboardService.copyItem(id);
    triggerBark();
  };

  const onScroll = () => {
    if (isSearching || !listRef.current || clipLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) loadMore();
  };

  const displayItems = isSearching ? searchResults : items;
  const loading = isSearching ? searchLoading : clipLoading;

  return (
    <div className="widget">
      <header className="widget-header">
        <DogIcon ears={ears} progress={progress} />
        <div className="header-info">
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard</span>
        </div>
      </header>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Pesquisar..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {isSearching && (
          <button className="search-clear" onClick={() => setSearchQuery("")} title="Limpar">
            ×
          </button>
        )}
      </div>

      <div className="clipboard-list" ref={listRef} onScroll={onScroll}>
        {displayItems.length === 0 && !loading && (
          <div className="empty-state">
            {isSearching ? (
              <>
                <span className="empty-text">Nenhum resultado</span>
                <span className="empty-subtext">Tente outra busca</span>
              </>
            ) : (
              <>
                <span className="empty-text">Nenhum item no clipboard</span>
                <span className="empty-subtext">Copie algo para começar</span>
              </>
            )}
          </div>
        )}
        {displayItems.map(item => (
          <ClipboardListItem
            key={item.id}
            item={item}
            onCopy={handleCopy}
            onDelete={deleteItem}
          />
        ))}
        {loading && <div className="loader">Carregando...</div>}
      </div>

      <DropZone filename={filename} progress={progress} onDrop={onDrop} />
    </div>
  );
}
```

- [ ] **Passo 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem erros.

- [ ] **Passo 3: Build completo**

```bash
npm run build 2>&1 | tail -20
```

Saída esperada: `✓ built in Xs` sem erros.

- [ ] **Passo 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire useUpload and ear wiggle animation in App"
```

---

## Verificação Visual Final

Após os commits, testar o app no Tauri:

```bash
npm run tauri dev
```

Checar:
- [ ] Estado idle: DropZone mostra ícone + "Arraste arquivos aqui", DogIcon sem anel
- [ ] Drag ativo: borda azul + "Solte aqui"
- [ ] Arquivo solto: DropZone mostra nome do arquivo + barra de progresso azul avançando, DogIcon exibe anel azul crescendo, orelhas ciclam (cima/normal/baixo)
- [ ] Após 100% + 500ms: tudo volta ao estado idle, anel desaparece, orelhas param
- [ ] Copy de item: `triggerBark` ainda funciona normalmente (orelhas one-shot)
