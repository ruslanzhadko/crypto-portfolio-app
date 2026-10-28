/**
 * Money moved from a wallet to an exchange shows up on the exchange first (synced every 30 s to 30 min)
 * while the wallet keeps its old balance until its own sync (up to 4 h): the capital is counted twice.
 * The worker spots likely deposits and asks the web app to sync the user's wallets right away.
 * A withdrawal is the mirror case: the exchange drops the money at once, the wallet shows it later.
 *
 * Signals: a new deposit or a newly completed withdrawal in the exchange history, or the stablecoin
 * amount on a connection growing or shrinking (prices do not move stablecoin amounts; transfers
 * between accounts of one connection cancel out).
 */

export const STABLECOINS = new Set([
  "USDT", "USDC", "USDE", "FDUSD", "DAI", "TUSD", "USDD", "PYUSD", "BUSD", "USD1", "RLUSD", "USDG",
]);
/** A deposit worth checking: at least this many dollars ... */
const MIN_DEPOSIT_USD = 50;
/** ... and this share of what was there before (realized PnL and funding stay below it). */
const MIN_DEPOSIT_SHARE = 0.02;
/** Wallet syncs cost provider credits: at most one request per user in this period. */
export const WALLET_SYNC_COOLDOWN_MS = 10 * 60_000;
/** History rows older than this are not news: the wallet has been synced since. */
export const RECENT_DEPOSIT_MS = 6 * 3_600_000;

export function stablecoinTotal(balances: { symbol: string; total: { toString(): string } | string | number }[]): number {
  let sum = 0;
  for (const b of balances) {
    if (!STABLECOINS.has(b.symbol.toUpperCase())) continue;
    const amount = Number(b.total.toString());
    if (Number.isFinite(amount)) sum += amount;
  }
  return sum;
}

export function looksLikeDeposit(before: number, after: number): boolean {
  const added = after - before;
  return added >= MIN_DEPOSIT_USD && (before <= 0 || added / before >= MIN_DEPOSIT_SHARE);
}

/** The same thresholds the other way; a realized loss that large only costs one extra wallet sync. */
export function looksLikeWithdrawal(before: number, after: number): boolean {
  const removed = before - after;
  return removed >= MIN_DEPOSIT_USD && before > 0 && removed / before >= MIN_DEPOSIT_SHARE;
}

/** A withdrawal seen on the balance is still on its way: sync the wallet once it has likely landed. */
export const WITHDRAWAL_ARRIVAL_MS = 5 * 60_000;

/** Users waiting for a wallet sync; a linked wallet (Hyperliquid, Aster) narrows it to that wallet. */
const pending = new Map<string, { walletId: string | null; dueAt: number }>();
const sentAt = new Map<string, number>();

export function noteDeposit(userId: string, walletId: string | null, delayMs = 0, now = Date.now()) {
  // Two signals for one user: a specific wallet only if both name the same one, the earlier time.
  const known = pending.get(userId);
  pending.set(userId, {
    walletId: known === undefined || known.walletId === walletId ? walletId : null,
    dueAt: Math.min(known?.dueAt ?? Infinity, now + delayMs),
  });
}

/** Requests that are due now; the rest stay queued until their time and the user's cooldown. */
export function takeDueDeposits(now = Date.now()): { userId: string; walletId: string | null }[] {
  const due: { userId: string; walletId: string | null }[] = [];
  for (const [userId, { walletId, dueAt }] of pending) {
    if (now < dueAt || now - (sentAt.get(userId) ?? 0) < WALLET_SYNC_COOLDOWN_MS) continue;
    pending.delete(userId);
    sentAt.set(userId, now);
    due.push({ userId, walletId });
  }
  return due;
}

/** Test hook. */
export function resetDepositWatch() {
  pending.clear();
  sentAt.clear();
}

/** Worker side: asks the web app to sync wallets now. Never throws. */
export function createWalletSyncClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): { request(userId: string, walletId: string | null): Promise<boolean> } | null {
  const activity = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.EXCHANGE_WORKER_SIGNAL_SECRET?.trim();
  if (!activity || !secret) return null;
  const url = new URL("/api/worker/wallet-sync", activity).toString();
  return {
    async request(userId, walletId) {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(walletId ? { userId, walletId } : { userId }),
          signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
