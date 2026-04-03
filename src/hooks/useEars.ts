import { useState, useCallback, useRef } from "react";
import { EarState } from "../types";

export function useEars() {
  const [ears, setEars] = useState<EarState>("normal");
  const timeoutRef = useRef<number | null>(null);

  const triggerBark = useCallback(() => {
    // Limpa animações anteriores se houver
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const frames: { state: EarState; delay: number }[] = [
      { state: "up", delay: 0 },
      { state: "down", delay: 150 },
      { state: "up", delay: 300 },
      { state: "normal", delay: 450 },
    ];

    frames.forEach(({ state, delay }) => {
      const timeout = window.setTimeout(() => setEars(state), delay);
      if (state === "normal") timeoutRef.current = null;
      else timeoutRef.current = timeout;
    });
  }, []);

  return { ears, triggerBark };
}