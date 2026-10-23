'use client';

import { useEffect, useState } from 'react';
import type { CapitalSummary } from '@/lib/portfolio/capital-summary';
import { trackInteraction, userIdle } from '@/components/exchanges/use-exchange-data';

const POLL_MS = 120_000;

// One summary per tab: the header pill polls, the dashboard publishes what it already loaded.
let current: { summary: CapitalSummary; at: number } | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let inflight = false;

function notify() {
  for (const listener of listeners) listener();
}

/** Called by pages that load the full overview anyway, so the pill matches them without a request. */
export function publishCapitalSummary(summary: CapitalSummary) {
  current = { summary, at: Date.now() };
  notify();
}

async function poll(force = false) {
  if (inflight || document.visibilityState === 'hidden') return;
  if (!force && (userIdle() || (current && Date.now() - current.at < POLL_MS - 5_000))) return;
  inflight = true;
  try {
    const res = await fetch('/api/portfolio/summary', { cache: 'no-store' });
    const body = (await res.json()) as { summary?: CapitalSummary };
    if (res.ok && body.summary) publishCapitalSummary(body.summary);
  } catch {
    // Keeps the last value; the next poll retries.
  } finally {
    inflight = false;
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void poll();
}

export function useCapitalSummary(): CapitalSummary | null {
  const [summary, setSummary] = useState<CapitalSummary | null>(current?.summary ?? null);
  useEffect(() => {
    const listener = () => setSummary(current?.summary ?? null);
    listeners.add(listener);
    listener();
    if (listeners.size === 1) {
      trackInteraction();
      void poll(!current);
      timer = setInterval(() => void poll(), POLL_MS);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);
  return summary;
}
