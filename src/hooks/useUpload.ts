import { useState, useRef, useCallback, useEffect } from "react";

export function useUpload() {
  const [filename, setFilename] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    };
  }, []);

  const onDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (resetRef.current !== null) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }

    const file = files[0];
    setFilename(file.name);
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
  }, []);

  return { filename, progress, onDrop };
}
