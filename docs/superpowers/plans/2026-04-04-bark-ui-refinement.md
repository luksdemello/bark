# Bark UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar visualmente e comportamentalmente o app Bark para aparência e fluidez de app macOS premium, em duas fases independentes.

**Architecture:** Fase 1 é CSS-only (sem lógica nova); Fase 2 adiciona state e comportamento em React. As fases são independentes — Fase 1 pode ir para produção sozinha. Não há framework de testes configurado; usa-se `npm run build` (TypeScript + Vite) como verificação de correctness.

**Tech Stack:** React 19, TypeScript, Tauri 2, CSS puro (sem CSS modules ou Tailwind)

---

## Mapa de Arquivos

| Arquivo | O que muda |
|---------|-----------|
| `src/App.css` | Densidade, hover, animações, pinned, copied, search icon, dropzone |
| `src/App.tsx` | Search ref/autofocus, copiedId state, selectedIndex, keydown listener |
| `src/components/Item.tsx` | Estrutura do timestamp (row), props isCopied/isSelected/onPin, botão pin |
| `src/components/DropZone.tsx` | Textos, subtítulo |
| `src/hooks/useClipboard.ts` | Expor `pinItem`, sort por pinned |
| `src/services/clipboardService.ts` | Método `pinItem` |

---

## FASE 1 — Visual (CSS puro)

---

### Task 1: Densidade dos cards + layout do timestamp

**Spec:** seções 1.1 e Item.tsx precisa mudar estrutura antes do CSS funcionar.

**Files:**
- Modify: `src/components/Item.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Atualizar estrutura do `Item.tsx` — timestamp na mesma linha do texto**

  Substitua o conteúdo de `src/components/Item.tsx` por:

  ```tsx
  import { memo } from "react";
  import { ClipboardItem } from "../types";
  import { formatTime, getDisplayType } from "../utils";
  import { ClipboardIcon, CopyIcon, DeleteIcon } from "./Icons";

  interface Props {
    item: ClipboardItem;
    onCopy: (id: number) => void;
    onDelete: (id: number) => void;
  }

  export const ClipboardListItem = memo(({ item, onCopy, onDelete }: Props) => {
    const type = getDisplayType(item);

    return (
      <div className="clipboard-item">
        <div className="item-icon">
          <ClipboardIcon type={type} />
        </div>

        <div className="item-content">
          {item.content_type === "image" ? (
            item.image_thumb_base64 ? (
              <img
                src={`data:image/png;base64,${item.image_thumb_base64}`}
                className="item-image"
                alt="Thumbnail"
              />
            ) : (
              <div className="item-row">
                <span className="item-text">[Imagem]</span>
                <span className="item-time">{formatTime(item.created_at)}</span>
              </div>
            )
          ) : (
            <div className="item-row">
              <span className="item-text">{item.text_content}</span>
              <span className="item-time">{formatTime(item.created_at)}</span>
            </div>
          )}
        </div>

        <div className="item-actions">
          <button
            onClick={() => onCopy(item.id)}
            className="action-btn copy-btn"
            title="Copiar"
          >
            <CopyIcon />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="action-btn delete-btn"
            title="Deletar"
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
    );
  });
  ```

- [ ] **Step 2: Atualizar CSS para nova densidade e layout do timestamp**

  No `src/App.css`, faça as seguintes substituições:

  Substitua o bloco `.clipboard-list`:
  ```css
  .clipboard-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  ```

  Substitua o bloco `.clipboard-item`:
  ```css
  .clipboard-item {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 9px 44px 9px 11px;

    background: rgba(44, 44, 46, 0.4);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);

    transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }
  ```

  Substitua o bloco `.item-icon`:
  ```css
  .item-icon {
    flex-shrink: 0;
    color: #0a84ff;
    padding-top: 2px;
  }
  ```

  Substitua o bloco `.item-content`:
  ```css
  .item-content {
    flex: 1;
    min-width: 0;
  }
  ```

  Adicione após `.item-content`:
  ```css
  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  ```

  Substitua `.item-text`:
  ```css
  .item-text {
    color: #f2f2f7;
    font-size: 13px;
    line-height: 1.35;
    word-break: break-word;
    flex: 1;
    min-width: 0;

    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  ```

  Substitua `.item-time`:
  ```css
  .item-time {
    color: #636366;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }
  ```

- [ ] **Step 3: Verificar build**

  ```bash
  cd /Users/lucas/www/clipboard_widget && npm run build
  ```
  Esperado: sem erros TypeScript ou Vite.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/Item.tsx src/App.css
  git commit -m "feat: reduce card density and align timestamp to right"
  ```

---

### Task 2: Hover com elevação + animação dos botões de ação

**Spec:** seções 1.2 e 1.3 (tamanho dos botões, velocidade da animação).

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Atualizar hover do card**

  Substitua `.clipboard-item:hover`:
  ```css
  .clipboard-item:hover {
    background: rgba(58, 58, 60, 0.85);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px) scale(1.004);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  ```

- [ ] **Step 2: Aumentar hit area dos botões e ajustar animação de entrada**

  Substitua `.item-actions`:
  ```css
  .item-actions {
    position: absolute;
    top: 7px;
    right: 7px;

    display: flex;
    gap: 5px;

    opacity: 0;
    transform: translateX(4px);
    transition: opacity 150ms ease, transform 150ms ease;

    pointer-events: none;
  }
  ```

  Substitua `.clipboard-item:hover .item-actions`:
  ```css
  .clipboard-item:hover .item-actions {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }
  ```

  Substitua `.action-btn`:
  ```css
  .action-btn {
    width: 32px;
    height: 32px;

    display: flex;
    align-items: center;
    justify-content: center;

    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);

    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;

    color: #f2f2f7;
    cursor: pointer;

    transition: all 120ms ease;
  }

  .action-btn:active {
    transform: scale(0.92);
  }
  ```

- [ ] **Step 3: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.css
  git commit -m "feat: improve hover elevation and action button animations"
  ```

---

### Task 3: Indicador de item fixado (pinned)

**Spec:** seção 1.4 — barra lateral âmbar via `::before`.

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Adicionar CSS para estado pinned**

  Adicione ao final da seção `/* --- Clipboard Item --- */` em `src/App.css`:

  ```css
  .clipboard-item.pinned {
    border-color: rgba(255, 214, 10, 0.15);
    overflow: hidden;
  }

  .clipboard-item.pinned::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #ffd60a, #ff9f0a);
    border-radius: 10px 0 0 10px;
  }
  ```

- [ ] **Step 2: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add src/App.css
  git commit -m "feat: add pinned item indicator (amber left bar)"
  ```

---

### Task 4: Feedback visual de cópia (.copied)

**Spec:** seção 1.5 — borda + glow azul por 1.5s.

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Adicionar classe `.copied` ao CSS**

  Adicione após `.clipboard-item.pinned::before`:

  ```css
  .clipboard-item.copied {
    border-color: rgba(10, 132, 255, 0.6);
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  .clipboard-item:not(.copied) {
    transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1),
                border-color 400ms ease,
                box-shadow 400ms ease;
  }
  ```

- [ ] **Step 2: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add src/App.css
  git commit -m "feat: add copied state CSS (blue border + glow)"
  ```

---

### Task 5: Animação de entrada dos itens

**Spec:** seção 1.6.

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Adicionar keyframe e aplicar em `.clipboard-item`**

  Adicione ao topo da seção de clipboard items em `src/App.css` (antes de `.clipboard-item`):

  ```css
  @keyframes itemEnter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  ```

  Adicione `animation: itemEnter 200ms ease forwards;` ao bloco `.clipboard-item` existente:

  ```css
  .clipboard-item {
    /* ... propriedades existentes ... */
    animation: itemEnter 200ms ease forwards;
  }
  ```

- [ ] **Step 2: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add src/App.css
  git commit -m "feat: animate clipboard items on entry"
  ```

---

### Task 6: Campo de busca — ícone de lupa + placeholder + dica de atalho

**Spec:** seção 1.7.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Adicionar ícone de lupa e dica ⌘K no `App.tsx`**

  Substitua o bloco `<div className="search-bar">` em `src/App.tsx`:

  ```tsx
  <div className="search-bar">
    <svg
      className="search-icon"
      width="14" height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input
      className="search-input"
      type="text"
      placeholder="Buscar no clipboard..."
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
    />
    {!searchQuery && (
      <span className="search-hint">⌘K</span>
    )}
    {isSearching && (
      <button className="search-clear" onClick={() => setSearchQuery("")} title="Limpar">
        ×
      </button>
    )}
  </div>
  ```

- [ ] **Step 2: Atualizar CSS da search bar**

  Substitua toda a seção `/* --- Search Bar --- */` em `src/App.css`:

  ```css
  /* --- Search Bar --- */
  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    color: #636366;
    pointer-events: none;
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 7px 32px 7px 32px;
    color: #f2f2f7;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s, background 0.2s;
  }

  .search-input:focus {
    border-color: #0a84ff;
    background: rgba(255, 255, 255, 0.08);
  }

  .search-input::placeholder {
    color: #636366;
  }

  .search-hint {
    position: absolute;
    right: 10px;
    color: #48484a;
    font-size: 11px;
    font-weight: 500;
    pointer-events: none;
    letter-spacing: 0.3px;
  }

  .search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #636366;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
    transition: color 0.15s;
  }

  .search-clear:hover {
    color: #f2f2f7;
  }
  ```

- [ ] **Step 3: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.tsx src/App.css
  git commit -m "feat: add search icon, updated placeholder and shortcut hint"
  ```

---

### Task 7: DropZone — textos e estado drag-over com pulse

**Spec:** seção 1.8.

**Files:**
- Modify: `src/components/DropZone.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Atualizar textos do `DropZone.tsx`**

  Substitua o conteúdo de `src/components/DropZone.tsx`:

  ```tsx
  import { UploadIcon } from "./Icons";

  interface DropZoneProps {
    filename: string | null;
    progress: number;
    isDragActive: boolean;
  }

  export function DropZone({ filename, progress, isDragActive }: DropZoneProps) {
    return (
      <footer
        className={`drop-zone${isDragActive ? " drag-over" : ""}${filename ? " uploading" : ""}`}
      >
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
            <span className="dropzone-main">
              {isDragActive ? "Solte para compartilhar" : "Arraste arquivos para compartilhar"}
            </span>
            {!isDragActive && (
              <span className="dropzone-sub">Um link será gerado automaticamente</span>
            )}
          </>
        )}
      </footer>
    );
  }
  ```

- [ ] **Step 2: Atualizar CSS da DropZone**

  Substitua toda a seção `/* --- Drop Zone --- */` em `src/App.css`:

  ```css
  /* --- Drop Zone --- */
  @keyframes borderPulse {
    0%, 100% {
      box-shadow: 0 0 0 2px #0a84ff, 0 0 12px rgba(10, 132, 255, 0.15);
    }
    50% {
      box-shadow: 0 0 0 2px #0a84ff, 0 0 24px rgba(10, 132, 255, 0.35);
    }
  }

  .drop-zone {
    margin: 8px;
    padding: 16px 20px;
    border: 1.5px dashed rgba(255, 255, 255, 0.15);
    border-radius: 12px;

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;

    color: #8e8e93;
    background: rgba(255, 255, 255, 0.02);

    transition: all 0.2s ease;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: #0a84ff;
    background: rgba(10, 132, 255, 0.08);
    color: #f2f2f7;
    animation: borderPulse 1.2s ease-in-out infinite;
  }

  .dropzone-main {
    font-size: 12px;
    font-weight: 500;
  }

  .dropzone-sub {
    font-size: 11px;
    color: #636366;
  }
  ```

  Mantenha os demais blocos da DropZone (`.drop-zone.uploading`, `.upload-filename`, etc.) inalterados.

- [ ] **Step 3: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/DropZone.tsx src/App.css
  git commit -m "feat: improve dropzone text and add drag-over pulse animation"
  ```

---

## FASE 2 — Comportamento (React)

---

### Task 8: `clipboardService.pinItem`

**Spec:** seção 2.2 — adicionar método que chama o comando Tauri `pin_item`.

**Files:**
- Modify: `src/services/clipboardService.ts`

- [ ] **Step 1: Adicionar `pinItem` ao service**

  Adicione após `deleteItem` em `src/services/clipboardService.ts`:

  ```ts
  pinItem(id: number): Promise<void> {
    return invoke("pin_item", { id });
  },
  ```

  O objeto final do service fica:
  ```ts
  export const clipboardService = {
    getHistory(page: number, limit: number): Promise<ClipboardItem[]> {
      return invoke("get_clipboard_history", { page, limit });
    },
    searchHistory(query: string, limit: number): Promise<ClipboardItem[]> {
      return invoke("search_clipboard_history", { query, limit });
    },
    copyItem(id: number): Promise<void> {
      return invoke("copy_item", { id });
    },
    deleteItem(id: number): Promise<void> {
      return invoke("delete_item", { id });
    },
    pinItem(id: number): Promise<void> {
      return invoke("pin_item", { id });
    },
    clearHistory(): Promise<void> {
      return invoke("clear_history");
    },
    getItemById(id: number): Promise<ClipboardItem | null> {
      return invoke("get_item_by_id", { id });
    },
    uploadFile(name: string, bytes: number[]): Promise<void> {
      return invoke("upload_file", { name, bytes });
    },
  };
  ```

- [ ] **Step 2: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/clipboardService.ts
  git commit -m "feat: add pinItem to clipboardService"
  ```

---

### Task 9: `useClipboard` — expor `pinItem` com optimistic update e sort

**Spec:** seção 2.2.

**Files:**
- Modify: `src/hooks/useClipboard.ts`

- [ ] **Step 1: Adicionar `pinItem` ao hook com sort por pinned**

  Substitua o conteúdo de `src/hooks/useClipboard.ts`:

  ```ts
  import { useState, useEffect, useCallback, useRef } from "react";
  import { listen } from "@tauri-apps/api/event";
  import { ClipboardItem } from "../types";
  import { clipboardService } from "../services/clipboardService";

  const PAGE_SIZE = 20;

  function sortItems(items: ClipboardItem[]): ClipboardItem[] {
    return [...items].sort((a, b) => {
      if (a.pinned === b.pinned) return 0;
      return a.pinned ? -1 : 1;
    });
  }

  export function useClipboard() {
    const [items, setItems] = useState<ClipboardItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const pageRef = useRef(0);

    const loadItems = useCallback(async (pageNum: number, append: boolean) => {
      setLoading(true);
      try {
        const result = await clipboardService.getHistory(pageNum, PAGE_SIZE);
        setItems(prev => sortItems(append ? [...prev, ...result] : result));
        setHasMore(result.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      loadItems(0, false);

      const unlistenNew = listen<ClipboardItem>("clipboard://new-item", event => {
        setItems(prev => sortItems([event.payload, ...prev]));
      });

      const unlistenShown = listen("window-shown", () => {
        pageRef.current = 0;
        loadItems(0, false);
      });

      return () => {
        unlistenNew.then(fn => fn());
        unlistenShown.then(fn => fn());
      };
    }, [loadItems]);

    const deleteItem = async (id: number) => {
      await clipboardService.deleteItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
    };

    const pinItem = async (id: number) => {
      // Optimistic update: inverte pinned localmente antes do round-trip
      setItems(prev => sortItems(
        prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i)
      ));
      try {
        await clipboardService.pinItem(id);
      } catch {
        // Reverte em caso de erro
        setItems(prev => sortItems(
          prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i)
        ));
      }
    };

    const loadMore = () => {
      const next = pageRef.current + 1;
      pageRef.current = next;
      loadItems(next, true);
    };

    return {
      items,
      loading,
      hasMore,
      loadMore,
      deleteItem,
      pinItem,
      refresh: () => loadItems(0, false),
    };
  }
  ```

- [ ] **Step 2: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/useClipboard.ts
  git commit -m "feat: add pinItem to useClipboard with optimistic update and sort"
  ```

---

### Task 10: `Item.tsx` — props `isCopied`, `isSelected`, `onPin` + botão de pin

**Spec:** seções 2.1, 2.2, 2.4. Adiciona botão de pin ao hover, aplica classes `copied` e `selected`.

**Files:**
- Modify: `src/components/Item.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Atualizar `Item.tsx` com novas props e botão de pin**

  Substitua o conteúdo de `src/components/Item.tsx`:

  ```tsx
  import { memo } from "react";
  import { ClipboardItem } from "../types";
  import { formatTime, getDisplayType } from "../utils";
  import { ClipboardIcon, CopyIcon, DeleteIcon, PinIcon } from "./Icons";

  interface Props {
    item: ClipboardItem;
    onCopy: (id: number) => void;
    onDelete: (id: number) => void;
    onPin: (id: number) => void;
    isCopied: boolean;
    isSelected: boolean;
  }

  export const ClipboardListItem = memo(({ item, onCopy, onDelete, onPin, isCopied, isSelected }: Props) => {
    const type = getDisplayType(item);

    const classes = [
      "clipboard-item",
      item.pinned ? "pinned" : "",
      isCopied ? "copied" : "",
      isSelected ? "selected" : "",
    ].filter(Boolean).join(" ");

    return (
      <div className={classes}>
        <div className="item-icon">
          <ClipboardIcon type={type} />
        </div>

        <div className="item-content">
          {item.content_type === "image" ? (
            item.image_thumb_base64 ? (
              <img
                src={`data:image/png;base64,${item.image_thumb_base64}`}
                className="item-image"
                alt="Thumbnail"
              />
            ) : (
              <div className="item-row">
                <span className="item-text">[Imagem]</span>
                <span className="item-time">{formatTime(item.created_at)}</span>
              </div>
            )
          ) : (
            <div className="item-row">
              <span className="item-text">{item.text_content}</span>
              <span className="item-time">{formatTime(item.created_at)}</span>
            </div>
          )}
        </div>

        <div className="item-actions">
          <button
            onClick={() => onPin(item.id)}
            className={`action-btn pin-btn${item.pinned ? " pinned-active" : ""}`}
            title={item.pinned ? "Desafixar" : "Fixar"}
          >
            <PinIcon filled={item.pinned} />
          </button>
          <button
            onClick={() => onCopy(item.id)}
            className="action-btn copy-btn"
            title="Copiar"
          >
            <CopyIcon />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="action-btn delete-btn"
            title="Deletar"
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
    );
  });
  ```

- [ ] **Step 2: Adicionar `PinIcon` ao `Icons.tsx`**

  Adicione ao final de `src/components/Icons.tsx`:

  ```tsx
  export const PinIcon = ({ filled = false }: { filled?: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
  ```

- [ ] **Step 3: Adicionar CSS para `.selected` e `.pin-btn`**

  Adicione ao final da seção de buttons em `src/App.css`:

  ```css
  /* Pin (âmbar) */
  .action-btn.pin-btn:hover {
    background: rgba(255, 214, 10, 0.15);
    border-color: rgba(255, 214, 10, 0.3);
    color: #ffd60a;
    transform: scale(1.05);
  }

  .action-btn.pin-btn.pinned-active {
    color: #ffd60a;
  }

  /* Selected (navegação por teclado) */
  .clipboard-item.selected {
    background: rgba(10, 132, 255, 0.12);
    border-color: rgba(10, 132, 255, 0.3);
    outline: none;
  }
  ```

- [ ] **Step 4: Verificar build**

  Build vai falhar porque `App.tsx` ainda não passa as novas props. Verifique apenas erros de sintaxe por agora executando somente o check TypeScript:

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```
  Esperado: erros apenas sobre props ausentes em `App.tsx` (resolvidos na próxima task).

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/Item.tsx src/components/Icons.tsx src/App.css
  git commit -m "feat: add pin button and isCopied/isSelected props to ClipboardListItem"
  ```

---

### Task 11: `App.tsx` — `copiedId`, autofocus e `pinItem`

**Spec:** seções 2.1, 2.2, 2.3.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Adicionar `copiedId`, autofocus e `pinItem`**

  Substitua o conteúdo de `src/App.tsx`:

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
    const { items, loading: clipLoading, hasMore, loadMore, deleteItem, pinItem } = useClipboard();
    const { ears, triggerBark, startWiggle, stopWiggle } = useEars();
    const [searchQuery, setSearchQuery] = useState("");
    const { results: searchResults, loading: searchLoading, isActive: isSearching } = useSearch(searchQuery);
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const { filename, progress, isDragActive } = useUpload();
    const [copiedId, setCopiedId] = useState<number | null>(null);

    useEffect(() => {
      searchRef.current?.focus();
    }, []);

    useEffect(() => {
      if (filename) startWiggle();
      else stopWiggle();
      return () => stopWiggle();
    }, [filename, startWiggle, stopWiggle]);

    const handleCopy = async (id: number) => {
      await clipboardService.copyItem(id);
      triggerBark();
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
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
          <div className="header-right">
            <div className="header-info">
              <span className="header-title">Bark</span>
              <span className="header-subtitle">Clipboard</span>
            </div>
            <div className="search-bar">
              <svg
                className="search-icon"
                width="14" height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                className="search-input"
                type="text"
                placeholder="Buscar no clipboard..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {!searchQuery && (
                <span className="search-hint">⌘K</span>
              )}
              {isSearching && (
                <button className="search-clear" onClick={() => setSearchQuery("")} title="Limpar">
                  ×
                </button>
              )}
            </div>
          </div>
        </header>

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
              onPin={pinItem}
              isCopied={copiedId === item.id}
              isSelected={false}
            />
          ))}
          {loading && <div className="loader">Carregando...</div>}
        </div>

        <DropZone filename={filename} progress={progress} isDragActive={isDragActive} />
      </div>
    );
  }
  ```

  > **Nota:** `isSelected={false}` é temporário — será substituído na Task 12.

- [ ] **Step 2: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros TypeScript.

- [ ] **Step 3: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat: add copiedId state, search autofocus and pinItem wiring"
  ```

---

### Task 12: Navegação por teclado

**Spec:** seção 2.4 — ↑↓ Enter Escape ⌘+número.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Adicionar navegação por teclado ao `App.tsx`**

  Substitua o conteúdo de `src/App.tsx`:

  ```tsx
  import { useState, useRef, useEffect, useCallback } from "react";
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
    const { items, loading: clipLoading, hasMore, loadMore, deleteItem, pinItem } = useClipboard();
    const { ears, triggerBark, startWiggle, stopWiggle } = useEars();
    const [searchQuery, setSearchQuery] = useState("");
    const { results: searchResults, loading: searchLoading, isActive: isSearching } = useSearch(searchQuery);
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const { filename, progress, isDragActive } = useUpload();
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const displayItems = isSearching ? searchResults : items;
    const loading = isSearching ? searchLoading : clipLoading;

    // Reset selectedIndex whenever the item list changes
    useEffect(() => {
      setSelectedIndex(-1);
    }, [displayItems.length]);

    useEffect(() => {
      searchRef.current?.focus();
    }, []);

    useEffect(() => {
      if (filename) startWiggle();
      else stopWiggle();
      return () => stopWiggle();
    }, [filename, startWiggle, stopWiggle]);

    const handleCopy = useCallback(async (id: number) => {
      await clipboardService.copyItem(id);
      triggerBark();
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }, [triggerBark]);

    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        // ⌘+1..9 — sempre ativo
        if (e.metaKey && e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          const idx = parseInt(e.key) - 1;
          if (displayItems[idx]) handleCopy(displayItems[idx].id);
          return;
        }

        // Escape — volta o foco para o search
        if (e.key === "Escape") {
          e.preventDefault();
          searchRef.current?.focus();
          setSelectedIndex(-1);
          return;
        }

        // ↑ ↓ Enter — só quando search não está focado
        if (isSearchFocused) return;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = Math.min(prev + 1, displayItems.length - 1);
            itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
            return next;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = Math.max(prev - 1, 0);
            itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
            return next;
          });
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (selectedIndex >= 0 && displayItems[selectedIndex]) {
            handleCopy(displayItems[selectedIndex].id);
          }
        }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [isSearchFocused, selectedIndex, displayItems, handleCopy]);

    const onScroll = () => {
      if (isSearching || !listRef.current || clipLoading || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) loadMore();
    };

    return (
      <div className="widget">
        <header className="widget-header">
          <DogIcon ears={ears} progress={progress} />
          <div className="header-right">
            <div className="header-info">
              <span className="header-title">Bark</span>
              <span className="header-subtitle">Clipboard</span>
            </div>
            <div className="search-bar">
              <svg
                className="search-icon"
                width="14" height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                className="search-input"
                type="text"
                placeholder="Buscar no clipboard..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
              {!searchQuery && (
                <span className="search-hint">⌘K</span>
              )}
              {isSearching && (
                <button className="search-clear" onClick={() => setSearchQuery("")} title="Limpar">
                  ×
                </button>
              )}
            </div>
          </div>
        </header>

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
          {displayItems.map((item, idx) => (
            <ClipboardListItem
              key={item.id}
              item={item}
              onCopy={handleCopy}
              onDelete={deleteItem}
              onPin={pinItem}
              isCopied={copiedId === item.id}
              isSelected={selectedIndex === idx}
              ref={(el: HTMLDivElement | null) => { itemRefs.current[idx] = el; }}
            />
          ))}
          {loading && <div className="loader">Carregando...</div>}
        </div>

        <DropZone filename={filename} progress={progress} isDragActive={isDragActive} />
      </div>
    );
  }
  ```

- [ ] **Step 2: Adicionar `forwardRef` ao `ClipboardListItem`**

  O `App.tsx` agora passa uma `ref` para cada item. Atualize `src/components/Item.tsx` para aceitar ref:

  ```tsx
  import { memo, forwardRef } from "react";
  import { ClipboardItem } from "../types";
  import { formatTime, getDisplayType } from "../utils";
  import { ClipboardIcon, CopyIcon, DeleteIcon, PinIcon } from "./Icons";

  interface Props {
    item: ClipboardItem;
    onCopy: (id: number) => void;
    onDelete: (id: number) => void;
    onPin: (id: number) => void;
    isCopied: boolean;
    isSelected: boolean;
  }

  export const ClipboardListItem = memo(forwardRef<HTMLDivElement, Props>(
    ({ item, onCopy, onDelete, onPin, isCopied, isSelected }, ref) => {
      const type = getDisplayType(item);

      const classes = [
        "clipboard-item",
        item.pinned ? "pinned" : "",
        isCopied ? "copied" : "",
        isSelected ? "selected" : "",
      ].filter(Boolean).join(" ");

      return (
        <div className={classes} ref={ref}>
          <div className="item-icon">
            <ClipboardIcon type={type} />
          </div>

          <div className="item-content">
            {item.content_type === "image" ? (
              item.image_thumb_base64 ? (
                <img
                  src={`data:image/png;base64,${item.image_thumb_base64}`}
                  className="item-image"
                  alt="Thumbnail"
                />
              ) : (
                <div className="item-row">
                  <span className="item-text">[Imagem]</span>
                  <span className="item-time">{formatTime(item.created_at)}</span>
                </div>
              )
            ) : (
              <div className="item-row">
                <span className="item-text">{item.text_content}</span>
                <span className="item-time">{formatTime(item.created_at)}</span>
              </div>
            )}
          </div>

          <div className="item-actions">
            <button
              onClick={() => onPin(item.id)}
              className={`action-btn pin-btn${item.pinned ? " pinned-active" : ""}`}
              title={item.pinned ? "Desafixar" : "Fixar"}
            >
              <PinIcon filled={item.pinned} />
            </button>
            <button
              onClick={() => onCopy(item.id)}
              className="action-btn copy-btn"
              title="Copiar"
            >
              <CopyIcon />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="action-btn delete-btn"
              title="Deletar"
            >
              <DeleteIcon />
            </button>
          </div>
        </div>
      );
    }
  ));
  ```

- [ ] **Step 3: Verificar build**

  ```bash
  npm run build
  ```
  Esperado: sem erros TypeScript.

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.tsx src/components/Item.tsx
  git commit -m "feat: add keyboard navigation (arrows, enter, cmd+n, escape)"
  ```

---

## Checklist de Cobertura da Spec

| Requisito | Task |
|-----------|------|
| Hover com elevação (sombra + scale) | Task 2 |
| Animação suave dos botões (fade + slide) | Task 2 |
| Botões com maior hit area | Task 2 |
| Tooltips nos botões | Task 10 (title attr já existe, mantido) |
| Padding vertical reduzido | Task 1 |
| Timestamp à direita | Task 1 |
| Multi-line clamp | Task 1 |
| Indicador de pinned | Task 3 |
| Botão de pin no hover | Task 10 |
| Animação de cópia mais rápida (150ms) | Task 2 |
| Feedback visual de cópia (borda + glow) | Task 4, 11 |
| Animação de entrada de novos itens | Task 5 |
| Ícone de lupa no search | Task 6 |
| Autofocus no search | Task 11 |
| Placeholder atualizado | Task 6 |
| Dica de atalho ⌘K | Task 6 |
| DropZone texto melhorado | Task 7 |
| DropZone subtítulo | Task 7 |
| Drag-over com glow animado | Task 7 |
| Navegação ↑↓ | Task 12 |
| Destaque do item selecionado | Task 10, 12 |
| Enter copia item selecionado | Task 12 |
| ⌘+número para copiar | Task 12 |
| pinItem no service | Task 8 |
| pinItem no hook com sort | Task 9 |
| Animação de clique (scale down) | Task 2 (`:active`) |
