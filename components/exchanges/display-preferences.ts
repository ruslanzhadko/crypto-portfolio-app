"use client";
import { useSyncExternalStore } from "react";

const event = "exchange-display-preferences";
function subscribe(update: () => void) {
  window.addEventListener(event, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(event, update);
    window.removeEventListener("storage", update);
  };
}
function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function useDisplayPreference(key: string, fallback: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  return [
    value,
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* Storage may be disabled. */
      }
      window.dispatchEvent(new Event(event));
    },
  ] as const;
}
export const warningPreference = "exchange-hide-valuation-warnings";
