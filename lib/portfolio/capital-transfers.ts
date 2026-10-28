import { normalizeHash } from "./own-transfers";

/**
 * Deposits and withdrawals of exchange accounts on the capital chart.
 *
 * A move between the user's own wallet and exchange leaves the total unchanged, but the two sides
 * are read at different times (an exchange every 30 s to 30 min, a wallet up to every few hours):
 * for a while the money is counted twice (deposit) or nowhere (withdrawal). Points of such a
 * transient — the total jumps by about the transfer and comes back — are dropped, so the line
 * simply joins the points around it. A jump that stays is real money in or out and is kept.
 */

export interface TransferInput {
  connectionId: string;
  /** Exchange connection label, shown on the chart. */
  label: string;
  direction: "deposit" | "withdrawal";
  asset: string;
  amount: string;
  /** Value at today's price; null when the asset has no known price. */
  usd: number | null;
  txHash: string | null;
  address: string | null;
  occurredAt: number;
}

export interface TransferMark {
  at: number;
  direction: "deposit" | "withdrawal";
  asset: string;
  amount: string;
  usd: number;
  /** The exchange connection the transfer belongs to. */
  label: string;
  /** Between own wallets and exchanges, or money from or to the outside. */
  own: boolean;
  /** The other own side when known: a wallet or another exchange. */
  counterpart: string | null;
}

interface Point {
  timestamp: number;
  totalUsd: string;
  walletsUsd: string;
  exchangesUsd: string;
}

/** Smaller transfers hide in price noise and would only clutter the chart. */
export const MIN_TRANSFER_USD = 50;
/** The other side shows up at the latest with the next wallet sync. */
const TRANSIT_WINDOW_MS = 6 * 3_600_000;
/** Snapshot buckets are five minutes: a bucket just before the transfer may already include it. */
const BUCKET_MS = 5 * 60_000;

export function markTransfers<P extends Point>(
  points: readonly P[],
  transfers: readonly TransferInput[],
  wallets: readonly { address: string; label: string }[],
): { points: P[]; transfers: TransferMark[] } {
  const walletByAddress = new Map(wallets.map((w) => [w.address.toLowerCase(), w.label]));
  // Exchange → exchange: both legs share the hash; keep the withdrawal and name the receiver.
  const deposits = new Map<string, TransferInput>();
  for (const t of transfers) {
    const hash = normalizeHash(t.txHash);
    if (t.direction === "deposit" && hash) deposits.set(hash, t);
  }
  const paired = new Set<TransferInput>();
  const marks: TransferMark[] = [];
  for (const t of transfers) {
    if (t.direction !== "withdrawal") continue;
    const hash = normalizeHash(t.txHash);
    const into = hash ? deposits.get(hash) : undefined;
    if (into && into.connectionId !== t.connectionId) paired.add(into);
  }
  for (const t of transfers) {
    if (paired.has(t) || t.usd === null || t.usd < MIN_TRANSFER_USD) continue;
    const hash = normalizeHash(t.txHash);
    const into = t.direction === "withdrawal" && hash ? deposits.get(hash) : undefined;
    const wallet =
      t.direction === "withdrawal" && t.address
        ? (walletByAddress.get(t.address.toLowerCase()) ?? null)
        : null;
    const counterpart = into && paired.has(into) ? into.label : wallet;
    marks.push({
      at: t.occurredAt,
      direction: t.direction,
      asset: t.asset,
      amount: t.amount,
      usd: t.usd,
      label: t.label,
      own: counterpart !== null,
      counterpart,
    });
  }
  marks.sort((a, b) => a.at - b.at);

  let kept = [...points];
  for (const mark of marks) {
    const found = transient(kept, mark);
    if (found.drop.size) kept = kept.filter((_, i) => !found.drop.has(i));
    if (found.drop.size || found.moved) mark.own = true;
  }
  return { points: kept, transfers: marks };
}

/**
 * Points between the transfer and the moment the total is back where it was, when all of them sit
 * about one transfer away in its direction. `moved` tells that money left one side (wallets or
 * exchanges) and arrived on the other, which also means an own transfer.
 */
function transient(points: readonly Point[], mark: TransferMark) {
  const drop = new Set<number>();
  let moved = false;
  let base = -1;
  for (let i = 0; i < points.length && points[i]!.timestamp < mark.at - BUCKET_MS; i++) base = i;
  if (base < 0) return { drop, moved };
  const sign = mark.direction === "deposit" ? 1 : -1;
  const tolerance = mark.usd / 2;
  const from = points[base]!;
  const shifted: number[] = [];
  let returned = false;
  for (let i = base + 1; i < points.length; i++) {
    const p = points[i]!;
    if (p.timestamp > mark.at + TRANSIT_WINDOW_MS) break;
    const wallets = (Number(p.walletsUsd) - Number(from.walletsUsd)) * sign;
    const exchanges = (Number(p.exchangesUsd) - Number(from.exchangesUsd)) * sign;
    if (exchanges > tolerance && wallets < -tolerance) moved = true;
    const total = (Number(p.totalUsd) - Number(from.totalUsd)) * sign;
    if (total > tolerance) {
      shifted.push(i);
    } else if (Math.abs(total) < tolerance) {
      // Before the jump the exchange has not been read yet; after it, the other side caught up.
      if (shifted.length) {
        returned = true;
        break;
      }
    } else break;
  }
  if (returned) for (const i of shifted) drop.add(i);
  return { drop, moved };
}
