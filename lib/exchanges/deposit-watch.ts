/**
 * Money moved from a wallet to an exchange shows up on the exchange first (synced every 30 s to 30 min)
 * while the wallet keeps its old balance until its own sync (up to 4 h): the capital is counted twice.
 * The worker spots likely deposits and asks the web app to sync the user's wallets right away.
 *
 * Signals: a new deposit in the exchange history, or the stablecoin amount on a connection growing
 * (prices do not move stablecoin amounts; transfers between accounts of one connection cancel out).
 */

const STABLECOINS = new Set([
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

/** Users waiting for a wallet sync; a linked wallet (Hyperliquid, Aster) narrows it to that wallet. */
const pending = new Map<string, string | null>();
const sentAt = new Map<string, number>();

export function noteDeposit(userId: string, walletId: string | null) {
  // Two signals for one user: a specific wallet only if both name the same one.
  const known = pending.get(userId);
  pending.set(userId, known === undefined || known === walletId ? walletId : null);
}

/** Requests that are due now; the rest stay queued until the user's cooldown ends. */
export function takeDueDeposits(now = Date.now()): { userId: string; walletId: string | null }[] {
  const due: { userId: string; walletId: string | null }[] = [];
  for (const [userId, walletId] of pending) {
    if (now - (sentAt.get(userId) ?? 0) < WALLET_SYNC_COOLDOWN_MS) continue;
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
