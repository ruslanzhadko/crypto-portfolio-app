'use client';

import { useEffect, useState } from 'react';
import type { CapitalSummary, DayAgoCapital } from '@/lib/portfolio/capital-summary';
import { trackInteraction, userIdle } from '@/components/exchanges/use-exchange-data';

const POLL_MS = 120_000;

// One summary per tab: the header pill polls, the dashboard publishes what it already loaded.
let current: { summary: CapitalSummary; at: number } | null = null;
// Capital a day ago comes only from the pill's own request; the dashboard does not send it.
let dayAgo: DayAgoCapital | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let inflight = false;

function notify() {
  for (const listener of listeners) listener();
}

// Fresher position totals from the positions page; they win over an older summary for a short while.
let positionTotals: { pnlUsd: string; positions: number; at: number } | null = null;
const POSITION_TOTALS_TTL_MS = 30_000;

function withPositionTotals(summary: CapitalSummary): CapitalSummary {
  if (!positionTotals || Date.now() - positionTotals.at > POSITION_TOTALS_TTL_MS) return summary;
  const { pnlUsd, positions } = positionTotals;
  return { ...summary, pnlUsd: positions > 0 ? pnlUsd : null, positions };
}

/** Called by pages that load the full overview anyway, so the pill matches them without a request. */
export function publishCapitalSummary(summary: CapitalSummary) {
  current = { summary: withPositionTotals(summary), at: Date.now() };
  notify();
}

/**
 * The positions page refreshes positions every 15 seconds, more often than the pill: it passes its
 * unrealized PnL and count so the pill shows the same numbers as the page.
 */
export function publishPositionTotals(pnlUsd: string, positions: number) {
  positionTotals = { pnlUsd, positions, at: Date.now() };
  if (!current) return;
  current = { ...current, summary: withPositionTotals(current.summary) };
  notify();
}

async function poll(force = false) {
  if (inflight || document.visibilityState === 'hidden') return;
  if (!force && (userIdle() || (current && Date.now() - current.at < POLL_MS - 5_000))) return;
  inflight = true;
  try {
    const res = await fetch('/api/portfolio/summary', { cache: 'no-store' });
    const body = (await res.json()) as { summary?: CapitalSummary; dayAgo?: DayAgoCapital | null };
    if (res.ok && body.summary) {
      dayAgo = body.dayAgo ?? null;
      publishCapitalSummary(body.summary);
    }
  } catch {
    // Keeps the last value; the next poll retries.
  } finally {
    inflight = false;
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void poll();
}

export function useCapitalSummary(): { summary: CapitalSummary; dayAgo: DayAgoCapital | null } | null {
  // Empty on the first render, as on the server; filled after mount.
  const [state, setState] = useState<{ summary: CapitalSummary; dayAgo: DayAgoCapital | null } | null>(null);
  useEffect(() => {
    const listener = () => setState(current ? { summary: current.summary, dayAgo } : null);
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
  return state;
}
