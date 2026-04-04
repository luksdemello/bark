# DropZone com Progresso & Anel no DogIcon — Spec de Design

**Data:** 2026-04-04  
**Status:** Aprovado

## Visão Geral

Migrar o `DropZone` dos eventos nativos de drag para a biblioteca `react-dropzone`. Quando um arquivo é solto, exibir o nome do arquivo e uma barra de progresso simulada dentro do DropZone, mostrar um anel de progresso circular ao redor do `DogIcon` no cabeçalho e animar as orelhas do cachorro continuamente enquanto o upload estiver em andamento — tudo sincronizado via um hook `useUpload` compartilhado.

## Arquitetura

O estado vive exclusivamente no novo hook `useUpload`. O `App` consome o hook e passa as props derivadas para `DropZone` e `DogIcon`. Sem context, sem prop drilling além de um nível.

```
useUpload() → { filename, progress, onDrop }
useEars()   → { ears, triggerBark, startWiggle, stopWiggle }
                        │
             ┌──────────┴───────────┐
          App.tsx               App.tsx
             │                      │
        <DropZone              <DogIcon
          filename               ears={ears}
          progress               progress={progress} />
          onDrop />
```

O `App` usa um `useEffect` observando `filename` para chamar `startWiggle()` quando o upload começa e `stopWiggle()` quando termina.

## Componentes

### `src/hooks/useUpload.ts` (novo)

**Interface:**
```ts
{ filename: string | null, progress: number, onDrop: (files: File[]) => void }
```

**Comportamento:**
- `filename`: nome do arquivo em upload; `null` quando ocioso.
- `progress`: inteiro de 0 a 100.
- `onDrop(files)`: pega o primeiro arquivo da lista, define `filename`, e inicia um `setInterval` que incrementa `progress` em ~5 a cada 100ms (chegando a 100% em ~2s). Ao atingir 100%, limpa o interval, aguarda 500ms e reseta `filename → null` e `progress → 0`.
- Se `onDrop` for chamado com um upload já em andamento, o atual é cancelado e o novo arquivo começa do zero.

### `src/hooks/useEars.ts` (modificar)

Adicionar duas novas funções exportadas junto ao `triggerBark` existente:

- **`startWiggle()`** — inicia um `setInterval` (~250ms) que cicla os estados das orelhas: `up → normal → down → normal → up → …`. Limpa qualquer timeout one-shot do `triggerBark` antes de começar.
- **`stopWiggle()`** — limpa o interval e reseta as orelhas para `"normal"`.

O ref do interval é separado do `timeoutRef` existente para não conflitar com o `triggerBark`.

### `src/components/DropZone.tsx` (substituir)

**Props:**
```ts
{ filename: string | null, progress: number, onDrop: (files: File[]) => void }
```

Usa `useDropzone({ onDrop })` do `react-dropzone`. A chamada existente ao `clipboardService.uploadFile` é removida por ora (apenas visual).

**Estados visuais:**

| Estado | Gatilho | UI |
|---|---|---|
| Ocioso | `filename === null && !isDragActive` | UploadIcon + "Arraste arquivos aqui" |
| Drag ativo | `isDragActive` (do useDropzone) | Borda azul + "Solte aqui" |
| Enviando | `filename !== null` | Ícone de arquivo + nome (truncado) + barra de progresso + "N%" |

O estado de envio usa a classe CSS `drop-zone uploading` (borda azul, fundo levemente azul). A barra de progresso é uma track de largura total com um div de preenchimento azul cuja `width` é `${progress}%`.

### `src/components/Icons.tsx` — `DogIcon` (modificar)

Adicionar prop opcional `progress?: number` (padrão `0`).

Sempre renderizar um `<div className="dog-ring-wrap">` (36×36px) para evitar layout shift no cabeçalho. Dentro:
- O `<svg>` existente do cachorro (28×28, centralizado via flexbox).
- Quando `progress > 0`, sobrepor um `<svg className="ring-svg">` (36×36, `rotate(-90deg)`) contendo:
  - Círculo de fundo: `r=16`, stroke `rgba(255,255,255,0.08)`, `strokeWidth=2.5`
  - Círculo de preenchimento: `r=16`, stroke `#0a84ff`, `strokeWidth=2.5`, `strokeLinecap="round"`, `strokeDasharray="100.5"` (2π×16), `strokeDashoffset = 100.5 × (1 - progress/100)`

### `src/App.tsx` (modificar)

```tsx
const { filename, progress, onDrop } = useUpload();
const { ears, triggerBark, startWiggle, stopWiggle } = useEars();

useEffect(() => {
  if (filename) startWiggle();
  else stopWiggle();
}, [filename]);

// ...
<DogIcon ears={ears} progress={progress} />
// ...
<DropZone filename={filename} progress={progress} onDrop={onDrop} />
```

### `src/App.css` (modificar)

Novos estilos a adicionar:

```css
/* Anel do DogIcon */
.dog-ring-wrap { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ring-svg { position: absolute; top: 0; left: 0; width: 36px; height: 36px; transform: rotate(-90deg); }

/* Estado de envio do DropZone */
.drop-zone.uploading { border-color: #0a84ff; background: rgba(10,132,255,0.08); color: #f2f2f7; }
.upload-filename { font-size: 13px; font-weight: 600; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.progress-bar-track { width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: #0a84ff; border-radius: 4px; transition: width 0.1s linear; }
.upload-percent { font-size: 11px; color: #8e8e93; }
```

## Dependências

- Instalar `react-dropzone` (`npm install react-dropzone`).

## Fora do Escopo

- Upload real de arquivo (sem chamada ao `clipboardService.uploadFile`).
- Múltiplos uploads simultâneos.
- Estados de erro.
- Filtragem por tipo de arquivo.
