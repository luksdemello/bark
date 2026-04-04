import { useState, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

export function useUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen("tauri://drag-enter", () => {
      setIsDragActive(true);
    }).then(u => unlisteners.push(u));

    listen("tauri://drag-leave", () => {
      setIsDragActive(false);
    }).then(u => unlisteners.push(u));

    listen<DragDropPayload>("tauri://drag-drop", (event) => {
      setIsDragActive(false);
      const paths = event.payload.paths;
      if (paths.length === 0) return;

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (resetRef.current !== null) {
        clearTimeout(resetRef.current);
        resetRef.current = null;
      }

      const name = paths[0].split("/").pop() ?? paths[0];
      setFilename(name);
      setProgress(0);

      let current = 0;
      intervalRef.current = window.setInterval(() => {
        current += 5;
        if (current >= 100) {
          const id = intervalRef.current;
          if (id !== null) clearInterval(id);
          intervalRef.current = null;
          setProgress(100);
          resetRef.current = window.setTimeout(() => {
            resetRef.current = null;
            setFilename(null);
            setProgress(0);
          }, 500);
        } else {
          setProgress(current);
        }
      }, 100);
    }).then(u => unlisteners.push(u));

    return () => {
      unlisteners.forEach(u => u());
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    };
  }, []);

  return { filename, progress, isDragActive };
}
