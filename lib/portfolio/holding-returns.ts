/**
 * Honest 24h result of each coin position, built from 30-minute snapshots.
 *
 * Storage is split so that the price updater reads little per window:
 * - one shared price series (every coin key, one price per slot) for all users;
 * - per user only quantity changes, as a step function, so a coin that is not traded costs
 *   one entry for the whole day.
 *
 * Dollars = Σ quantity at segment start × (price at end − price at start).
 * Percent = Π (price at end / price at start) − 1 over the segments the coin was held:
 * a time-weighted return that ignores deposits, buys and sells.
 */

export const SLOT_MS = 30 * 60 * 1000;
/** 24 hours of 30-minute segments. */
export const WINDOW_SLOTS = 48;
/** Fewer covered slots than this: the dashboard keeps the old price-based estimate. */
export const MIN_COVERED_SLOTS = 2;

export function slotOf(ms: number): number {
  return Math.floor(ms / SLOT_MS);
}

/** Shared prices: `p[key][i]` is the price at `slots[i]`, null when unknown. */
export interface PriceSeries {
  v: 1;
  slots: number[];
  p: Record<string, (number | null)[]>;
}

/**
 * One user's quantities: `q[key]` is a flat list of `[slot, walletQty, exchangeQty]` triples, ascending;
 * each triple holds until the next one. `since` is the first slot recorded for this user.
 */
export interface HoldingSeries {
  v: 1;
  since: number;
  q: Record<string, number[]>;
}

/** `[usd, percent | null, heldHours, lastPrice]` as of the result's `at` slot. */
export type ReturnEntry = [number, number | null, number, number];

export interface HoldingResult {
  v: 1;
  /** Slot of the newest snapshot. */
  at: number;
  /** Oldest slot the result covers. */
  from: number;
  /** Wallets and exchanges together. */
  all: Record<string, ReturnEntry>;
  /** Wallets only; present only for coins also held on an exchange. */
  w: Record<string, ReturnEntry>;
}

export interface Holding {
  wallet: number;
  exchange: number;
}

const round = (x: number, digits: number) => Number(x.toPrecision(digits));
const sameQty = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;

/** Adds the prices of `slot` (replacing it when the updater runs twice in one slot) and drops old slots and unused keys. */
export function appendPrices(
  series: PriceSeries | null,
  slot: number,
  prices: Map<string, number>,
  keep: Set<string>,
): PriceSeries {
  const oldSlots = series?.slots ?? [];
  const oldP = series?.p ?? {};
  const firstKept = oldSlots.findIndex((s) => s >= slot - WINDOW_SLOTS && s < slot);
  const from = firstKept === -1 ? oldSlots.length : firstKept;
  const kept = oldSlots.slice(from).filter((s) => s < slot);
  const slots = [...kept, slot];
  const p: PriceSeries["p"] = {};
  for (const key of new Set([...Object.keys(oldP), ...prices.keys()])) {
    if (!keep.has(key) && !prices.has(key)) continue;
    const old = (oldP[key] ?? []).slice(from, from + kept.length);
    while (old.length < kept.length) old.unshift(null);
    const price = prices.get(key);
    const row = [...old, price && price > 0 ? round(price, 8) : null];
    if (row.some((x) => x !== null)) p[key] = row;
  }
  return { v: 1, slots, p };
}

/** Records the user's current quantities at `slot`; coins missing from `current` are recorded as closed. */
export function appendHoldings(
  series: HoldingSeries | null,
  slot: number,
  current: Map<string, Holding>,
): HoldingSeries {
  const windowStart = slot - WINDOW_SLOTS;
  const q: HoldingSeries["q"] = {};
  for (const key of new Set([...Object.keys(series?.q ?? {}), ...current.keys()])) {
    const triples = [...(series?.q[key] ?? [])];
    // A second run in the same slot replaces that slot's entry.
    while (triples.length && triples[triples.length - 3]! >= slot) triples.splice(-3);
    const now = current.get(key) ?? { wallet: 0, exchange: 0 };
    const n = triples.length;
    const changed =
      n === 0 ? now.wallet + now.exchange > 0 : !sameQty(triples[n - 2]!, now.wallet) || !sameQty(triples[n - 1]!, now.exchange);
    if (changed) triples.push(slot, round(now.wallet, 10), round(now.exchange, 10));
    // Keep the entry in force at the window start; older ones are not needed.
    let cut = 0;
    while (cut + 3 < triples.length && triples[cut + 3]! <= windowStart) cut += 3;
    const pruned = triples.slice(cut);
    const closedLongAgo =
      pruned.length === 3 && pruned[0]! <= windowStart && pruned[1] === 0 && pruned[2] === 0;
    if (pruned.length && !closedLongAgo) q[key] = pruned;
  }
  return { v: 1, since: series?.since ?? slot, q };
}

function qtyAt(triples: number[], slot: number): Holding {
  let wallet = 0;
  let exchange = 0;
  for (let i = 0; i < triples.length && triples[i]! <= slot; i += 3) {
    wallet = triples[i + 1]!;
    exchange = triples[i + 2]!;
  }
  return { wallet, exchange };
}

interface KeyReturn {
  entry: ReturnEntry;
  /** Same quantity over a fully covered window: percent must match the market's 24h change. */
  steady: boolean;
}

function keyReturn(
  slots: number[],
  prices: (number | null)[],
  triples: number[],
  pick: (h: Holding) => number,
): KeyReturn | null {
  const last = slots.length - 1;
  const lastPrice = prices[last] ?? null;
  if (lastPrice === null || pick(qtyAt(triples, slots[last]!)) <= 0) return null;
  let usd = 0;
  let growth = 1;
  let heldMs = 0;
  let steady = true;
  const firstQty = pick(qtyAt(triples, slots[0]!));
  for (let i = 0; i < last; i++) {
    const qty = pick(qtyAt(triples, slots[i]!));
    if (!sameQty(qty, firstQty)) steady = false;
    const a = prices[i];
    const b = prices[i + 1];
    if (qty <= 0 || !a || !b) {
      steady = false;
      continue;
    }
    usd += qty * (b - a);
    growth *= b / a;
    heldMs += (slots[i + 1]! - slots[i]!) * SLOT_MS;
  }
  const percent = heldMs > 0 ? round((growth - 1) * 100, 6) : null;
  return {
    entry: [round(usd, 8), percent, Math.round((heldMs / 3_600_000) * 10) / 10, lastPrice],
    steady: steady && last > 0,
  };
}

/**
 * The 24h result of every coin held at the newest slot. `steady` lists coins whose quantity did not change
 * over a full 24h window, for the correctness check against the market's 24h change.
 */
export function computeReturns(
  prices: PriceSeries,
  holdings: HoldingSeries,
  /** The user's own current prices: the live tail on the dashboard starts from them. */
  ownPrices?: Map<string, number>,
): { result: HoldingResult; steady: Map<string, number> } {
  const at = prices.slots[prices.slots.length - 1] ?? holdings.since;
  const start = Math.max(at - WINDOW_SLOTS, holdings.since);
  const first = prices.slots.findIndex((s) => s >= start);
  const slots = first === -1 ? [] : prices.slots.slice(first);
  const all: HoldingResult["all"] = {};
  const w: HoldingResult["w"] = {};
  const steady = new Map<string, number>();
  // One missed snapshot at the window start still counts as a full day.
  const fullWindow = slots.length > 0 && slots[0]! <= at - WINDOW_SLOTS + 1;
  for (const [key, triples] of Object.entries(holdings.q)) {
    const row = prices.p[key]?.slice(first);
    if (!row) continue;
    const total = keyReturn(slots, row, triples, (h) => h.wallet + h.exchange);
    if (!total) continue;
    const own = ownPrices?.get(key);
    if (own && own > 0) total.entry[3] = own;
    all[key] = total.entry;
    if (fullWindow && total.steady && total.entry[1] !== null) steady.set(key, total.entry[1]);
    const onExchange = triples.some((x, i) => i % 3 === 2 && x > 0);
    if (onExchange) {
      const walletOnly = keyReturn(slots, row, triples, (h) => h.wallet);
      if (walletOnly) {
        walletOnly.entry[3] = total.entry[3];
        w[key] = walletOnly.entry;
      }
    }
  }
  return { result: { v: 1, at, from: slots[0] ?? at, all, w }, steady };
}

/**
 * Extends a stored entry from its snapshot to the live price, using the current quantity for the short
 * stretch since the snapshot.
 */
export function withLiveTail(
  entry: ReturnEntry,
  currentPrice: number,
  currentQty: number,
): { usd: number; percent: number | null; hours: number } {
  const [usd, percent, hours, lastPrice] = entry;
  if (!(currentPrice > 0) || !(lastPrice > 0) || !(currentQty > 0)) return { usd, percent, hours };
  const ratio = currentPrice / lastPrice;
  return {
    usd: usd + currentQty * (currentPrice - lastPrice),
    percent: ((1 + (percent ?? 0) / 100) * ratio - 1) * 100,
    hours,
  };
}

export interface MoverChange {
  usd: number;
  percent: number;
  /** Hours the result covers; null for the old price-only estimate. */
  hours: number | null;
}

/**
 * The movers' 24h change of one coin: the snapshot result when there is one, otherwise the old estimate
 * that assumes the quantity did not change during the day.
 */
export function moverChange(
  tok: { key: string; totalBalance: number; totalUsd: number; currentPrice: number; priceChange24h: number },
  result: HoldingResult | null,
  scope: "all" | "wallets",
  now = Date.now(),
): MoverChange {
  const fraction = Math.max(-0.999, tok.priceChange24h / 100);
  const estimate = { usd: tok.totalUsd - tok.totalUsd / (1 + fraction), percent: tok.priceChange24h, hours: null };
  if (!result || result.at - result.from < MIN_COVERED_SLOTS || slotOf(now) - result.at > WINDOW_SLOTS) return estimate;
  const entry = (scope === "wallets" ? result.w[tok.key] : undefined) ?? result.all[tok.key];
  if (!entry) return estimate;
  const live = withLiveTail(entry, tok.currentPrice, tok.totalBalance);
  if (live.percent === null || !Number.isFinite(live.percent)) return estimate;
  return { usd: live.usd, percent: live.percent, hours: live.hours };
}
