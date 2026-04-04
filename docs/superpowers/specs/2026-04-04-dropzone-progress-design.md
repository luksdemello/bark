# DropZone Progress & DogIcon Ring — Design Spec

**Date:** 2026-04-04  
**Status:** Approved

## Overview

Migrate `DropZone` from native drag events to `react-dropzone`. When a file is dropped, show the filename and a simulated progress bar inside the DropZone, and display a circular progress ring around the `DogIcon` in the header — both synchronized via a shared `useUpload` hook.

## Architecture

State lives exclusively in a new `useUpload` hook. `App` consumes the hook and passes derived props down to `DropZone` and `DogIcon`. No context, no prop drilling beyond one level.

```
useUpload() → { filename, progress, onDrop }
                        │
             ┌──────────┴───────────┐
          App.tsx               App.tsx
             │                      │
        <DropZone              <DogIcon
          filename               progress={progress} />
          progress
          onDrop />
```

## Components

### `src/hooks/useUpload.ts` (new)

**Interface:**
```ts
{ filename: string | null, progress: number, onDrop: (files: File[]) => void }
```

**Behavior:**
- `filename`: name of the file currently uploading; `null` when idle.
- `progress`: integer 0–100.
- `onDrop(files)`: takes the first file in the array, sets `filename`, then starts a `setInterval` that increments `progress` by ~5 every 100ms (reaching 100% in ~2s). At 100%, clears the interval, waits 500ms, then resets `filename → null` and `progress → 0`.
- If `onDrop` is called while an upload is already running, the current one is cancelled and the new file starts fresh.

### `src/components/DropZone.tsx` (replace)

**Props:**
```ts
{ filename: string | null, progress: number, onDrop: (files: File[]) => void }
```

Uses `useDropzone({ onDrop })` from `react-dropzone`. The existing `clipboardService.uploadFile` call is removed for now (pure visual).

**Visual states:**

| State | Trigger | UI |
|---|---|---|
| Idle | `filename === null && !isDragActive` | UploadIcon + "Arraste arquivos aqui" |
| Drag active | `isDragActive` (from useDropzone) | Blue border + "Solte aqui" |
| Uploading | `filename !== null` | File icon + filename (truncated) + progress bar + "N%" |

The uploading state uses CSS class `drop-zone uploading` (blue border, blue tinted background). The progress bar is a full-width track with a blue fill div whose `width` is `${progress}%`.

### `src/components/Icons.tsx` — `DogIcon` (modify)

Add optional prop `progress?: number` (default `0`).

Always render a `<div className="dog-ring-wrap">` (36×36px) to avoid layout shift in the header. Inside:
- The existing dog `<svg>` (28×28, centered by flexbox).
- When `progress > 0`, overlay an `<svg className="ring-svg">` (36×36, `rotate(-90deg)`) containing:
  - Background circle: `r=16`, stroke `rgba(255,255,255,0.08)`, `strokeWidth=2.5`
  - Fill circle: `r=16`, stroke `#0a84ff`, `strokeWidth=2.5`, `strokeLinecap="round"`, `strokeDasharray="100.5"` (2π×16), `strokeDashoffset = 100.5 × (1 - progress/100)`

### `src/App.tsx` (modify)

```tsx
const { filename, progress, onDrop } = useUpload();
// ...
<DogIcon ears={ears} progress={progress} />
// ...
<DropZone filename={filename} progress={progress} onDrop={onDrop} />
```

### `src/App.css` (modify)

New rules to add:

```css
/* Dog ring */
.dog-ring-wrap { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ring-svg { position: absolute; top: 0; left: 0; width: 36px; height: 36px; transform: rotate(-90deg); }

/* DropZone uploading state */
.drop-zone.uploading { border-color: #0a84ff; background: rgba(10,132,255,0.08); color: #f2f2f7; }
.upload-filename { font-size: 13px; font-weight: 600; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.progress-bar-track { width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: #0a84ff; border-radius: 4px; transition: width 0.1s linear; }
.upload-percent { font-size: 11px; color: #8e8e93; }
```

## Dependencies

- Install `react-dropzone` (`npm install react-dropzone`).

## What is NOT in scope

- Actual file upload (no `clipboardService.uploadFile` call).
- Multiple simultaneous uploads.
- Error states.
- File type filtering.
