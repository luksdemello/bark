import { useState, useCallback, useRef, useEffect } from "react";
import { EarState } from "../types";

const WIGGLE_STATES: EarState[] = ["up", "normal", "down", "normal"];

export function useEars() {
  const [ears, setEars] = useState<EarState>("normal");
  const timeoutRef = useRef<number | null>(null);
  const wiggleRef = useRef<number | null>(null);
  const barkTimeouts = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      barkTimeouts.current.forEach(clearTimeout);
      if (wiggleRef.current !== null) clearInterval(wiggleRef.current);
    };
  }, []);

  const triggerBark = useCallback(() => {
    const wasWiggling = wiggleRef.current !== null;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (wiggleRef.current) {
      clearInterval(wiggleRef.current);
      wiggleRef.current = null;
    }
    barkTimeouts.current.forEach(clearTimeout);
    barkTimeouts.current = [];

    const frames: { state: EarState; delay: number }[] = [
      { state: "up",     delay: 0   },
      { state: "down",   delay: 150 },
      { state: "up",     delay: 300 },
      { state: "normal", delay: 450 },
    ];

    frames.forEach(({ state, delay }) => {
      const id = window.setTimeout(() => {
        setEars(state);
        barkTimeouts.current = barkTimeouts.current.filter(t => t !== id);
      }, delay);
      barkTimeouts.current.push(id);
    });

    if (wasWiggling) {
      const resumeId = window.setTimeout(() => {
        barkTimeouts.current = barkTimeouts.current.filter(t => t !== resumeId);
        if (wiggleRef.current === null) {
          let i = 0;
          wiggleRef.current = window.setInterval(() => {
            setEars(WIGGLE_STATES[i % WIGGLE_STATES.length]);
            i++;
          }, 250);
        }
      }, 500);
      barkTimeouts.current.push(resumeId);
    }
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
