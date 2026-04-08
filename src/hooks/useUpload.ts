import { useState, useRef, useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { uploadAndShare } from "../services/uploadService";
import { error as logError } from "@tauri-apps/plugin-log";

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
    let active = true;
    const unlisteners: Array<() => void> = [];

    function register(promise: Promise<() => void>) {
      promise.then(u => {
        if (active) unlisteners.push(u);
        else u();
      });
    }

    register(listen("tauri://drag-enter", () => {
      setIsDragActive(true);
    }));

    register(listen("tauri://drag-leave", () => {
      setIsDragActive(false);
    }));

    register(listen<DragDropPayload>("tauri://drag-drop", async (event) => {
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
        await invoke("write_text_to_clipboard", { text: signedUrl });
        scheduleReset(3000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload falhou";
        setStatus("error");
        setError(message);
        emit("upload-progress", { progress: 0 });
        scheduleReset(4000);
        logError(`Upload failed for file "${name}": ${message}`).catch(() => {});
      }
    }));

    return () => {
      active = false;
      unlisteners.forEach(u => u());
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    };
  }, []);

  return { filename, progress, isDragActive, status, error };
}
