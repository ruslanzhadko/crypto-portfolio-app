"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * A forgotten but visible tab must not poll forever: every poll keeps the
 * database awake and the worker in its fast mode. Watching without touching
 * the page is normal for positions, so the timeout is generous.
 */
const IDLE_AFTER_MS = 30 * 60_000;
let lastInteraction = Date.now();
let listening = false;
function trackInteraction() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const touch = () => {
    lastInteraction = Date.now();
  };
  for (const event of ["pointermove", "keydown", "scroll", "touchstart"])
    window.addEventListener(event, touch, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") touch();
  });
}
const userIdle = () => Date.now() - lastInteraction >= IDLE_AFTER_MS;

/** Poll persisted data only; no request to exchanges originates in a browser. */
export function useExchangeData<T>(
  url: string,
  interval = 15_000,
  keepPreviousData = false,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true,
      busy = false;
    if (!keepPreviousData) setData(null);
    setLoading(true);
    trackInteraction();
    let first = true;
    async function load() {
      if (busy || document.visibilityState === "hidden") return;
      if (!first && userIdle()) return;
      first = false;
      busy = true;
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.code ?? "UNAVAILABLE");
        if (active) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (active && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "UNAVAILABLE");
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, interval);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    // Coming back after the idle timeout refreshes within a few seconds.
    let wasIdle = false;
    const idleCheck = setInterval(() => {
      if (userIdle()) wasIdle = true;
      else if (wasIdle) {
        wasIdle = false;
        void load();
      }
    }, 5_000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      clearInterval(idleCheck);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [url, interval, revision, keepPreviousData]);
  return { data, error, refresh, loading };
}
export async function exchangeAction(
  url: string,
  method: string,
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.code ?? "UNAVAILABLE");
  return data;
}
