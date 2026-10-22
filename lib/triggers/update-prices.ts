/**
 * The VM runs the wallet price update (sync due wallets, prices, balances, snapshots) on Vercel
 * from its own :00/:30 window instead of cron-job.org, so the database wakes once per window.
 * The site address comes from the activity URL the VM already uses; only CRON_SECRET is added.
 */
const TIMEOUT_MS = 90_000;

export function createUpdatePricesCaller(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): { run(): Promise<string> } | null {
  const activity = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.CRON_SECRET?.trim();
  if (!activity || !secret) return null;
  const url = new URL("/api/cron/update-prices", activity).toString();
  return {
    async run() {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`update-prices HTTP ${res.status}`);
      const body: unknown = await res.json().catch(() => null);
      const field = (name: string) =>
        body && typeof body === "object" && name in body
          ? String((body as Record<string, unknown>)[name])
          : "?";
      return `wallets ${field("walletsSynced")}, prices ${field("pricesWritten")}/${field("pricesUpdated")} written, balances ${field("balancesRecalculated")}, snapshots ${field("snapshotsCreated")}, ${field("durationMs")} ms`;
    },
  };
}
