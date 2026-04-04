# Supabase Storage Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Supabase Storage into the Bark Tauri app so users can drag-and-drop a file, have it uploaded to a private bucket, and automatically receive a temporary signed URL copied to their clipboard.

**Architecture:** Supabase JS SDK runs entirely in the frontend (React) using the anon key — no server involved. The Tauri `@tauri-apps/plugin-fs` reads local file bytes from the drag-dropped path, which are then uploaded directly to Supabase. Upload state flows through `useUpload` → `DropZone` with `idle | uploading | success | error` states.

**Tech Stack:** React 19 + TypeScript, Vite (env via `VITE_` prefix), `@supabase/supabase-js`, `@tauri-apps/plugin-fs`, `tauri-plugin-fs` (Rust), Vitest for unit tests.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.env` | Create | VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored) |
| `.env.example` | Create | Template committed to git |
| `.gitignore` | Modify | Add `.env` entry |
| `src/lib/supabase.ts` | Create | Supabase client singleton |
| `src/services/uploadService.ts` | Create | `uploadAndShare(filePath)` → signed URL |
| `src/services/__tests__/uploadService.test.ts` | Create | Unit tests for uploadService |
| `src/hooks/useUpload.ts` | Modify | Replace fake simulation with real upload + status/error state |
| `src/components/DropZone.tsx` | Modify | Add error/success state rendering |
| `src/App.tsx` | Modify | Pass `status` and `error` props to DropZone |
| `src/App.css` | Modify | Add `.drop-zone.error`, `.drop-zone.success`, `.error-text`, `.success-text` |
| `package.json` | Modify | Add `@supabase/supabase-js`, `@tauri-apps/plugin-fs`, `vitest` |
| `vite.config.ts` | Modify | Add `test` config for Vitest |
| `src-tauri/Cargo.toml` | Modify | Add `tauri-plugin-fs = "2"` |
| `src-tauri/src/lib.rs` | Modify | Register `.plugin(tauri_plugin_fs::init())` |
| `src-tauri/capabilities/default.json` | Modify | Add `"fs:read-all"` permission |

---

### Task 1: Install Dependencies, Configure Env & Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `.env`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install frontend packages**

```bash
bun add @supabase/supabase-js @tauri-apps/plugin-fs
bun add -d vitest @vitest/globals jsdom @testing-library/react @testing-library/jest-dom
```

Expected: `bun.lock` updates with the new packages.

- [ ] **Step 2: Add test script and configure Vitest in vite.config.ts**

Replace the full content of `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
}));
```

- [ ] **Step 3: Create test setup file**

Create `src/test-setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Add test script to package.json**

Edit `package.json`, add `"test": "vitest"` to the `scripts` block:

```json
{
  "name": "bark",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest"
  }
}
```

- [ ] **Step 5: Create .env with Supabase credentials**

Create `.env` at the project root. Replace the placeholder values with your actual Supabase project credentials:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> Find these at: Supabase Dashboard → Project Settings → API → Project URL and anon/public key.

- [ ] **Step 6: Create .env.example for teammates**

Create `.env.example` at the project root:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 7: Add .env to .gitignore**

Edit `.gitignore`, add these lines before the end of the file:

```
# Environment variables (credentials)
.env
.env.local
.env.*.local
```

- [ ] **Step 8: Commit**

```bash
git add package.json vite.config.ts src/test-setup.ts .env.example .gitignore
git commit -m "chore: add Supabase, fs plugin, vitest dependencies and env template"
```

---

### Task 2: Add Tauri fs Plugin (Rust Side)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add tauri-plugin-fs to Cargo.toml**

Edit `src-tauri/Cargo.toml`. Add after the `tauri-plugin-clipboard = "2"` line:

```toml
tauri-plugin-fs = "2"
```

The dependencies block should now contain:
```toml
tauri-plugin-clipboard = "2"
tauri-plugin-fs = "2"
```

- [ ] **Step 2: Register the fs plugin in lib.rs**

Edit `src-tauri/src/lib.rs`. Add `.plugin(tauri_plugin_fs::init())` after the clipboard plugin registration (line 23):

```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_fs::init())
```

- [ ] **Step 3: Add fs read permission to capabilities**

Replace the full content of `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["tray-window"],
  "permissions": [
    "core:default",
    "opener:default",
    "fs:read-all"
  ]
}
```

> `fs:read-all` allows reading files from any location on disk — appropriate for a drag-and-drop tool where users can drop files from anywhere.

- [ ] **Step 4: Verify Rust compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished` with no errors. If `tauri-plugin-fs` isn't found, run `cargo update` first.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: add tauri-plugin-fs for reading dropped files"
```

---

### Task 3: Create Supabase Client

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create the Supabase client module**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run build 2>&1 | head -20
```

Expected: No TypeScript errors related to `supabase.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add Supabase client singleton"
```

---

### Task 4: Create Upload Service (TDD)

**Files:**
- Create: `src/services/__tests__/uploadService.test.ts`
- Create: `src/services/uploadService.ts`

- [ ] **Step 1: Create the test file**

Create `src/services/__tests__/uploadService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/plugin-fs before importing uploadService
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
}));

// Mock the supabase module
vi.mock("../../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "../../lib/supabase";
import { uploadAndShare } from "../uploadService";

const mockReadFile = vi.mocked(readFile);
const mockFrom = vi.mocked(supabase.storage.from);

describe("uploadAndShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads file bytes, uploads to Supabase, and returns a signed URL", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockReadFile.mockResolvedValue(fakeBytes);

    const mockUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://supabase.co/signed?token=abc" },
      error: null,
    });
    mockFrom.mockReturnValue({
      upload: mockUpload,
      createSignedUrl: mockCreateSignedUrl,
    } as any);

    const url = await uploadAndShare("/Users/test/photo.png");

    expect(mockReadFile).toHaveBeenCalledWith("/Users/test/photo.png");
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+-photo\.png$/),
      expect.any(File)
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+-photo\.png$/),
      3600
    );
    expect(url).toBe("https://supabase.co/signed?token=abc");
  });

  it("throws if upload fails", async () => {
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const mockUpload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "bucket not found" },
    });
    mockFrom.mockReturnValue({ upload: mockUpload } as any);

    await expect(uploadAndShare("/tmp/file.txt")).rejects.toThrow(
      "Upload failed: bucket not found"
    );
  });

  it("throws if signed URL generation fails", async () => {
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const mockUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    mockFrom.mockReturnValue({
      upload: mockUpload,
      createSignedUrl: mockCreateSignedUrl,
    } as any);

    await expect(uploadAndShare("/tmp/file.txt")).rejects.toThrow(
      "Failed to generate link: permission denied"
    );
  });
});
```

- [ ] **Step 2: Run tests — verify they fail (no implementation yet)**

```bash
bun run test --run 2>&1 | tail -20
```

Expected: Tests fail with `Cannot find module '../uploadService'`.

- [ ] **Step 3: Create the upload service implementation**

Create `src/services/uploadService.ts`:

```typescript
import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "../lib/supabase";

const BUCKET = "bark-files";
const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour in seconds

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    zip: "application/zip",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
  };
  return mimeTypes[ext] ?? "application/octet-stream";
}

export async function uploadAndShare(filePath: string): Promise<string> {
  const fileName = filePath.split("/").pop() ?? filePath;
  const uniqueName = `${crypto.randomUUID()}-${fileName}`;
  const mimeType = getMimeType(fileName);

  const bytes = await readFile(filePath);
  const file = new File([bytes], uniqueName, { type: mimeType });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(uniqueName, file);

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(uniqueName, SIGNED_URL_EXPIRES_IN);

  if (signedUrlError || !data?.signedUrl) {
    throw new Error(
      `Failed to generate link: ${signedUrlError?.message ?? "Unknown error"}`
    );
  }

  return data.signedUrl;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun run test --run 2>&1 | tail -20
```

Expected: `3 passed` with no failures.

- [ ] **Step 5: Commit**

```bash
git add src/services/uploadService.ts src/services/__tests__/uploadService.test.ts
git commit -m "feat: add uploadAndShare service with Supabase Storage integration"
```

---

### Task 5: Update useUpload Hook

**Files:**
- Modify: `src/hooks/useUpload.ts`

This replaces the fake interval-based simulation with real async upload logic. New states added: `status` (`idle | uploading | success | error`) and `error`.

- [ ] **Step 1: Replace the full content of src/hooks/useUpload.ts**

```typescript
import { useState, useRef, useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { uploadAndShare } from "../services/uploadService";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export function useUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const resetRef = useRef<number | null>(null);

  function scheduleReset(ms: number) {
    if (resetRef.current !== null) clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => {
      resetRef.current = null;
      setFilename(null);
      setProgress(0);
      setStatus("idle");
      setError(null);
      emit("upload-progress", { progress: 0 });
    }, ms);
  }

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen("tauri://drag-enter", () => {
      setIsDragActive(true);
    }).then(u => unlisteners.push(u));

    listen("tauri://drag-leave", () => {
      setIsDragActive(false);
    }).then(u => unlisteners.push(u));

    listen<DragDropPayload>("tauri://drag-drop", async (event) => {
      setIsDragActive(false);
      const paths = event.payload.paths;
      if (paths.length === 0) return;

      if (resetRef.current !== null) {
        clearTimeout(resetRef.current);
        resetRef.current = null;
      }

      const filePath = paths[0];
      const name = filePath.split("/").pop() ?? filePath;
      setFilename(name);
      setProgress(0);
      setStatus("uploading");
      setError(null);
      emit("upload-progress", { progress: 10 });

      try {
        const signedUrl = await uploadAndShare(filePath);
        setProgress(100);
        setStatus("success");
        emit("upload-progress", { progress: 100 });
        await navigator.clipboard.writeText(signedUrl);
        scheduleReset(3000);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Upload falhou");
        emit("upload-progress", { progress: 0 });
        scheduleReset(4000);
      }
    }).then(u => unlisteners.push(u));

    return () => {
      unlisteners.forEach(u => u());
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    };
  }, []);

  return { filename, progress, isDragActive, status, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useUpload.ts
git commit -m "feat: replace fake upload simulation with real Supabase upload in useUpload"
```

---

### Task 6: Update DropZone, App.tsx, and App.css

**Files:**
- Modify: `src/components/DropZone.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Replace DropZone.tsx with error/success state support**

Replace the full content of `src/components/DropZone.tsx`:

```tsx
import { UploadIcon } from "./Icons";
import type { UploadStatus } from "../hooks/useUpload";

interface DropZoneProps {
  filename: string | null;
  progress: number;
  isDragActive: boolean;
  status: UploadStatus;
  error: string | null;
}

export function DropZone({ filename, progress, isDragActive, status, error }: DropZoneProps) {
  const isUploading = status === "uploading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <footer
      className={[
        "drop-zone",
        isDragActive ? "drag-over" : "",
        isUploading ? "uploading" : "",
        isSuccess ? "success" : "",
        isError ? "error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isError ? (
        <>
          <UploadIcon />
          <span className="dropzone-main error-text">Falha no upload</span>
          <span className="dropzone-sub">{error}</span>
        </>
      ) : isSuccess ? (
        <>
          <UploadIcon />
          <span className="dropzone-main success-text">Link copiado!</span>
          <span className="dropzone-sub">{filename}</span>
        </>
      ) : filename ? (
        <>
          <UploadIcon />
          <div className="upload-filename">{filename}</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="upload-percent">{isUploading ? `${progress}%` : ""}</div>
        </>
      ) : (
        <>
          <UploadIcon />
          <span className="dropzone-main">
            {isDragActive ? "Solte para compartilhar" : "Arraste arquivos para compartilhar"}
          </span>
          <span className={`dropzone-sub${isDragActive ? " invisible" : ""}`}>
            Um link será gerado automaticamente
          </span>
        </>
      )}
    </footer>
  );
}
```

- [ ] **Step 2: Update App.tsx to pass status and error to DropZone**

In `src/App.tsx`, change line 20 from:
```typescript
  const { filename, progress, isDragActive } = useUpload();
```
to:
```typescript
  const { filename, progress, isDragActive, status, error } = useUpload();
```

Change line 179 from:
```tsx
      <DropZone filename={filename} progress={progress} isDragActive={isDragActive} />
```
to:
```tsx
      <DropZone filename={filename} progress={progress} isDragActive={isDragActive} status={status} error={error} />
```

- [ ] **Step 3: Add error and success CSS states to App.css**

In `src/App.css`, after the `.drop-zone.uploading` block (after line 457), add:

```css
.drop-zone.success {
  border-color: #30d158;
  background: rgba(48, 209, 88, 0.08);
  color: #f2f2f7;
}

.drop-zone.error {
  border-color: #ff453a;
  background: rgba(255, 69, 58, 0.08);
  color: #f2f2f7;
}

.success-text {
  color: #30d158;
}

.error-text {
  color: #ff453a;
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
bun run build 2>&1 | head -30
```

Expected: Successful build with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DropZone.tsx src/App.tsx src/App.css
git commit -m "feat: add success/error states to DropZone UI and wire Supabase upload"
```

---

### Task 7: End-to-End Verification

- [ ] **Step 1: Run all unit tests**

```bash
bun run test --run
```

Expected: All tests pass (at minimum the 3 uploadService tests).

- [ ] **Step 2: Start the Tauri dev app**

```bash
bun run tauri dev
```

Expected: App starts without errors. The Rust compiler should pick up `tauri-plugin-fs`.

- [ ] **Step 3: Verify drag-and-drop upload flow**

1. Drag any small file (e.g., a PNG or PDF) onto the Bark drop zone
2. Verify the drop zone shows the uploading state (file name + progress bar)
3. Verify the tray icon animates (upload-progress event fires)
4. On success: drop zone shows green "Link copiado!" with the file name
5. Open a text editor or browser and paste — should be a valid Supabase signed URL starting with `https://`
6. Verify the URL is accessible in the browser and serves the file

- [ ] **Step 4: Verify error state**

To test the error state, temporarily change `BUCKET` in `uploadService.ts` to `"nonexistent-bucket"`, drop a file, and confirm the drop zone shows red "Falha no upload" with the error message. Revert after testing.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Supabase Storage integration — drag-drop upload with signed URL sharing"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered By |
|-------------|------------|
| `.env` with SUPABASE_URL + SUPABASE_ANON_KEY | Task 1 Step 5 |
| No hardcoded credentials | `src/lib/supabase.ts` reads from `import.meta.env` |
| Reusable Supabase client in `src/lib/supabase.ts` | Task 3 |
| `uploadAndShare(file: File)` (adapted to path) | Task 4 — `uploadAndShare(filePath: string)` |
| `crypto.randomUUID()` for unique names | `uploadService.ts` |
| Upload to "bark-files" bucket | `BUCKET = "bark-files"` constant |
| Upload error handling | `uploadService.ts` throws; `useUpload` catches |
| `createSignedUrl` with 3600s expiry | `uploadService.ts` |
| Copy link to clipboard | `useUpload` uses `navigator.clipboard.writeText` |
| Connect to drag-and-drop | `useUpload` handles `tauri://drag-drop` |
| UI states: idle/uploading/success/error | `DropZone.tsx` + `App.css` |
| Error feedback in UI | DropZone error state with message |
| Only anon key in frontend | Only `VITE_SUPABASE_ANON_KEY` used |
| Bucket remains private | Bucket was pre-created as private; upload policy exists |
| Separate lib / service concerns | `src/lib/supabase.ts` vs `src/services/uploadService.ts` |

### Note on `uploadAndShare` Signature

The spec says `uploadAndShare(file: File)` but in this Tauri app, the drag-drop event yields file *paths* (strings), not `File` objects. The implementation takes `filePath: string`, reads bytes via `@tauri-apps/plugin-fs`, then constructs a `File` internally. This is the correct approach for Tauri.

### No Placeholders Found

All steps contain actual code. No "TBD" or "add error handling" without showing how.
