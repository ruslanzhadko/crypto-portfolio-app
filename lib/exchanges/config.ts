/** Server-side rollout switch. No table access while disabled. */
export function exchangesEnabled(userId?: string): boolean {
  if (process.env.EXCHANGES_ENABLED !== "true") return false;
  const pilot = (process.env.EXCHANGES_PILOT_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return !pilot.length || (!!userId && pilot.includes(userId));
}

export const POSITION_INTERVAL_MS = 30_000;
export const BALANCE_INTERVAL_MS = 120_000;
export const LEASE_MS = 180_000;
export const MAX_CONNECTIONS = 10;
export const HYPERCORE_CHAINS = ["hypercore", "hypercore-perps"];
