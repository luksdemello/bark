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
