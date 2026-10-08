"use client";
import { useCallback, useEffect, useState } from "react";

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
    async function load() {
      if (busy || document.visibilityState === "hidden") return;
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
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
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
