"use client";
import { useEffect, useRef, useState } from "react";

const TWEEN_MS = 350;

/**
 * Eases a shown number toward a new value instead of jumping. The first value is shown as is, and
 * so is every change for people who prefer reduced motion.
 */
export function useTween(target: number | null): number | null {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (
      target === null ||
      from === null ||
      from === target ||
      !Number.isFinite(from) ||
      !Number.isFinite(target) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - progress) ** 3;
      current.current = progress === 1 ? target : from + (target - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
