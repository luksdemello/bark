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
