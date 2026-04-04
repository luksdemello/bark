import { useState, useCallback, useRef } from "react";
import { EarState } from "../types";

const WIGGLE_STATES: EarState[] = ["up", "normal", "down", "normal"];

export function useEars() {
  const [ears, setEars] = useState<EarState>("normal");
  const timeoutRef = useRef<number | null>(null);
  const wiggleRef = useRef<number | null>(null);

  const triggerBark = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const frames: { state: EarState; delay: number }[] = [
      { state: "up",     delay: 0   },
      { state: "down",   delay: 150 },
      { state: "up",     delay: 300 },
      { state: "normal", delay: 450 },
    ];

    frames.forEach(({ state, delay }) => {
      const timeout = window.setTimeout(() => setEars(state), delay);
      if (state === "normal") timeoutRef.current = null;
      else timeoutRef.current = timeout;
    });
  }, []);

  const startWiggle = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (wiggleRef.current) clearInterval(wiggleRef.current);

    let i = 0;
    wiggleRef.current = window.setInterval(() => {
      setEars(WIGGLE_STATES[i % WIGGLE_STATES.length]);
      i++;
    }, 250);
  }, []);

  const stopWiggle = useCallback(() => {
    if (wiggleRef.current) {
      clearInterval(wiggleRef.current);
      wiggleRef.current = null;
    }
    setEars("normal");
  }, []);

  return { ears, triggerBark, startWiggle, stopWiggle };
}