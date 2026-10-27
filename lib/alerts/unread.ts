"use client";

import { useEffect, useState } from "react";

/**
 * "New alerts" state for the navigation dot. One poll per browser tab, shared by every component,
 * against an endpoint that reads only the Runtime Cache. The moment of the last alert the user saw
 * lives in localStorage, like the changelog dot.
 */
const SEEN_KEY = "alerts-seen";
/** Also how soon a new alert pops up on an open page (AlertToasts); reads only the Runtime Cache. */
const POLL_MS = 20_000;

let latestAt: number | null | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let inflight: Promise<void> | undefined;
const listeners = new Set<() => void>();

function readSeen(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw === null ? null : Number(raw) || 0;
  } catch {
    return null;
  }
}

function writeSeen(at: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // Storage may be unavailable (private mode); the dot then simply stays.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function poll(): Promise<void> {
  inflight ??= fetch("/api/alerts/latest")
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { latestAt?: number | null } | null) => {
      if (!body || body.latestAt === undefined) return;
      latestAt = body.latestAt;
      // First visit: older alerts are history, not news.
      if (readSeen() === null) writeSeen(latestAt ?? 0);
      notify();
    })
    .catch(() => {})
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

function onVisible() {
  if (document.visibilityState === "visible") void poll();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (latestAt !== undefined) listener();
  if (listeners.size === 1) {
    void poll();
    // Hidden tabs skip the poll and catch up when shown again.
    timer = setInterval(() => document.visibilityState === "visible" && void poll(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", notify);
    }
  };
}

/** The moment of the last alert the user has seen (0 when none), null before anything is stored. */
export function alertsSeenAt(): number | null {
  return readSeen();
}

/** Marks every alert up to the newest known one as seen. */
export function markAlertsSeen() {
  const at = Math.max(latestAt ?? 0, readSeen() ?? 0);
  writeSeen(at);
  notify();
}

/** Newest alert moment (null: none, undefined: not loaded yet). */
export function useLatestAlertAt(): number | null | undefined {
  const [value, setValue] = useState<number | null | undefined>(undefined);
  useEffect(() => subscribe(() => setValue(latestAt)), []);
  return value;
}

/** True while an alert newer than the last one the user saw exists. */
export function useAlertsUnread(): boolean {
  // Starts hidden so server and client render the same markup.
  const [unread, setUnread] = useState(false);
  useEffect(
    () =>
      subscribe(() => {
        const seen = readSeen();
        setUnread(latestAt != null && seen !== null && latestAt > seen);
      }),
    [],
  );
  return unread;
}
