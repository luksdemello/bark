# Bark UI Refinement — Design Spec

**Data:** 2026-04-04  
**Status:** Aprovado  
**Escopo:** Refinamento visual e de usabilidade do app macOS Bark (gerenciador de clipboard)

---

## Contexto

O Bark é um gerenciador de clipboard construído com Tauri + React. Possui tema dark com cards arredondados, área de drag-and-drop e ícone animado no tray. O objetivo é elevar a interface ao nível de apps premium como Raycast ou Paste — mais fluida, com feedback rico e navegação por teclado — sem mudar o layout atual.

---

## Abordagem: Duas Fases

### Fase 1 — Visual (CSS puro, sem lógica nova)
CSS-only: densidade, animações, hover, indicadores, busca, dropzone.

### Fase 2 — Comportamento (React + state)
State de cópia com feedback, pin toggle, navegação por teclado, autofocus.

---

## Fase 1: Mudanças Visuais

### 1.1 Densidade dos Cards

**Decisão:** Opção C híbrida.

- Padding: `9px 11px` (era `12px`)
- Gap da lista: `7px` (era `10px`)
- Ícone de tipo: `14×14px` (era `18×18px`)
- Timestamp: alinhado à direita via `flexbox row` com `justify-content: space-between` + `align-items: baseline`
- Textos curtos ficam em 1 linha; textos longos usam `-webkit-line-clamp: 2`

### 1.2 Hover dos Cards

- `transform: translateY(-1px) scale(1.004)`
- `box-shadow: 0 4px 12px rgba(0,0,0,0.3)`
- Transição: `all 180ms cubic-bezier(0.4, 0, 0.2, 1)`

### 1.3 Botões de Ação

- Tamanho sobe de `28×28px` para `32×32px` (maior hit area)
- Ícone permanece `16×16px`
- Animação de entrada: `opacity 0→1` + `translateX(4px→0)` em `150ms` (era `200ms` com translateY)
- Adicionado botão de **pin** (âmbar) com ícone de thumbtack, visível apenas no hover
- Ordem: Pin | Copiar | Deletar

### 1.4 Indicador de Item Fixado (Pinned)

- `.clipboard-item.pinned::before`: pseudo-elemento absoluto, `width: 3px`, `top/bottom/left: 0`, `background: linear-gradient(180deg, #ffd60a, #ff9f0a)`, `border-radius: 9px 0 0 9px`
- Borda do card: `1px solid rgba(255,214,10,0.15)` quando pinado
- `border-radius` e `overflow: hidden` garantem que o pseudo-elemento não vaze

### 1.5 Feedback Visual de Cópia

**Decisão:** Borda + glow azul.

- Classe `.clipboard-item.copied` aplicada por 1500ms
- CSS: `border-color: rgba(10,132,255,0.6)` + `box-shadow: 0 0 0 3px rgba(10,132,255,0.15)`
- Transição de entrada: `150ms ease`; saída: `400ms ease` (fade suave ao remover a classe)

### 1.6 Animação de Entrada de Novos Itens

A animação é aplicada em todos os `.clipboard-item` via CSS, o que inclui o carregamento inicial da lista — esse comportamento é intencional (a lista "entra" suavemente ao abrir o app). Itens carregados via `loadMore` (scroll infinito) também animam, o que é desejável.

```css
@keyframes itemEnter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.clipboard-item {
  animation: itemEnter 200ms ease forwards;
}
```

> **Nota:** se o efeito de entrada em massa incomodar em lotes grandes (loadMore), pode-se adicionar `animation-delay` proporcional ao índice via prop `style` inline no componente — deixar para ajuste pós-implementação.

### 1.7 Campo de Busca

- Ícone de lupa SVG posicionado absolutamente à esquerda do input (`left: 10px`, `16×16px`, `color: #636366`)
- `padding-left` do input sobe para `34px`
- Placeholder: `"Buscar no clipboard..."`
- Dica de atalho `⌘K` exibida à direita do input quando vazio e sem foco (elemento `<span>` absoluto); desaparece ao focar
- Atalho real de abertura da janela é `⌘K` (confirmar com hook Tauri se já existir)

### 1.8 DropZone

- Texto principal: `"Arraste arquivos para compartilhar"`
- Subtítulo novo: `"Um link será gerado automaticamente"` (`font-size: 11px`, `color: #636366`)
- Estado `drag-over`:
  - `box-shadow: 0 0 0 2px #0a84ff, 0 0 20px rgba(10,132,255,0.2)`
  - Animação de borda pulsante:
    ```css
    @keyframes borderPulse {
      0%, 100% { box-shadow: 0 0 0 2px #0a84ff, 0 0 12px rgba(10,132,255,0.15); }
      50%       { box-shadow: 0 0 0 2px #0a84ff, 0 0 24px rgba(10,132,255,0.35); }
    }
    ```
  - Duração: `1.2s ease-in-out infinite`

---

## Fase 2: Mudanças de Comportamento

### 2.1 State de Cópia com Feedback

**Em `App.tsx`:**
```tsx
const [copiedId, setCopiedId] = useState<number | null>(null);

const handleCopy = async (id: number) => {
  await clipboardService.copyItem(id);
  triggerBark();
  setCopiedId(id);
  setTimeout(() => setCopiedId(null), 1500);
};
```

**Em `ClipboardListItem`:** nova prop `isCopied: boolean` → aplica `className="clipboard-item copied"`.

### 2.2 Pin Toggle

**`clipboardService`:** adicionar `pinItem(id: number): Promise<void>` chamando o comando Tauri correspondente.

**`useClipboard`:** expor `pinItem(id)` que:
1. Chama `clipboardService.pinItem(id)`
2. Faz optimistic update: inverte `item.pinned` localmente
3. Reordena: itens `pinned: true` sobem para o topo da lista (sort estável)

**`ClipboardListItem`:** nova prop `onPin: (id: number) => void`. Botão de pin chama `onPin`. Ícone do botão é um thumbtack; quando pinado, ícone fica âmbar e preenchido.

### 2.3 Autofocus no Campo de Busca

```tsx
const searchRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  searchRef.current?.focus();
}, []);
```

### 2.4 Navegação por Teclado

**State em `App.tsx`:**
```tsx
const [selectedIndex, setSelectedIndex] = useState<number>(-1);
const [isSearchFocused, setIsSearchFocused] = useState(false);
```

**Listener `keydown` (em `useEffect` com cleanup):**

| Tecla | Ação |
|-------|------|
| `↓` | `selectedIndex = min(selectedIndex + 1, displayItems.length - 1)` |
| `↑` | `selectedIndex = max(selectedIndex - 1, 0)` |
| `Enter` | copia `displayItems[selectedIndex]` (se `selectedIndex >= 0`) |
| `Escape` | foca search input, `setSelectedIndex(-1)` |
| `⌘+1..9` | copia `displayItems[n-1]` se existir |

Navegação por `↑`/`↓` e `Enter` fica desabilitada quando `isSearchFocused === true`.  
`Escape` e `⌘+número` funcionam sempre.

**Scroll automático:** ao mudar `selectedIndex`, chama `scrollIntoView({ block: 'nearest' })` no elemento do item selecionado via ref array.

**`ClipboardListItem`:** nova prop `isSelected: boolean` → classe `selected`:
```css
.clipboard-item.selected {
  background: rgba(10, 132, 255, 0.12);
  border-color: rgba(10, 132, 255, 0.3);
  outline: none;
}
```

`selectedIndex` reseta para `-1` sempre que `displayItems` mudar (nova busca ou novo item).

---

## Arquivos Modificados

### Fase 1
- `src/App.css` — maioria das mudanças CSS
- `src/App.tsx` — placeholder do search, ref do input, dica ⌘K
- `src/components/DropZone.tsx` — textos e subtítulo
- `src/components/Item.tsx` — estrutura do timestamp (mover para row)

### Fase 2
- `src/App.tsx` — `copiedId`, `selectedIndex`, `isSearchFocused`, `keydown` listener, `pinItem`
- `src/components/Item.tsx` — props `isCopied`, `isSelected`, `onPin`; botão de pin
- `src/hooks/useClipboard.ts` — expor `pinItem`, sort por pinned
- `src/services/clipboardService.ts` — método `pinItem`
- `src/App.css` — classes `.copied`, `.selected`, `.clipboard-item.pinned`

---

## Restrições Respeitadas

- Layout geral preservado (header + lista + dropzone)
- Sem bibliotecas novas (animações via CSS puro)
- Sem feature flags ou backwards-compat shims
- Grid de 8pt: todos os valores são múltiplos de 4 (8, 9≈8+1, 12, 16, 32, 40...)
- Performance: animações usam `transform` e `opacity` (compositor thread)
