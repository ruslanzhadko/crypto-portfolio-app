'use client';

import { useEffect, useState } from 'react';
import type { HoldingResult } from '@/lib/portfolio/holding-returns';

const REFRESH_MS = 10 * 60 * 1000;

// Shared by every movers card on the page; the result changes only every 30 minutes.
let cached: { at: number; promise: Promise<HoldingResult | null> } | null = null;

function load(): Promise<HoldingResult | null> {
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached.promise;
  const promise = fetch('/api/portfolio/holding-returns')
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { result?: HoldingResult | null } | null) => (body?.result?.v === 1 ? body.result : null))
    .catch(() => null);
  cached = { at: Date.now(), promise };
  return promise;
}

/** The 24h coin results from the last snapshot; null until loaded or when there is none. */
export function useHoldingReturns(): HoldingResult | null {
  const [result, setResult] = useState<HoldingResult | null>(null);
  useEffect(() => {
    let alive = true;
    const update = () => void load().then((r) => alive && setResult(r));
    update();
    const timer = setInterval(update, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return result;
}
