/**
 * The VM runs the wallet price update (sync due wallets, prices, balances, snapshots) from its own
 * :00/:30 window, so the database wakes once per window. With UPDATE_PRICES_LOCAL=1 the work runs in
 * this process (it needs the wallet and price API keys of the site in its env file); otherwise it is
 * requested from the site's cron route, which costs Vercel function CPU.
 */
const TIMEOUT_MS = 90_000;

type Summary = Partial<
  Record<
    "walletsSynced" | "pricesUpdated" | "pricesWritten" | "balancesRecalculated" | "snapshotsCreated" | "durationMs",
    unknown
  >
>;

export function summarise(body: unknown) {
  const field = (name: keyof Summary) =>
    body && typeof body === "object" && name in body
      ? String((body as Record<string, unknown>)[name])
      : "?";
  return `wallets ${field("walletsSynced")}, prices ${field("pricesWritten")}/${field("pricesUpdated")} written, balances ${field("balancesRecalculated")}, snapshots ${field("snapshotsCreated")}, ${field("durationMs")} ms`;
}

export function createUpdatePricesCaller(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  runLocal: () => Promise<unknown> = async () =>
    (await import("@/lib/cron/price-updater")).runPriceUpdater(),
): { run(): Promise<string>; local: boolean } | null {
  if (env.UPDATE_PRICES_LOCAL === "1")
    return {
      local: true,
      async run() {
        return summarise(await runLocal());
      },
    };
  const activity = env.EXCHANGE_ACTIVITY_URL;
  const secret = env.CRON_SECRET?.trim();
  if (!activity || !secret) return null;
  const url = new URL("/api/cron/update-prices", activity).toString();
  return {
    local: false,
    async run() {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`update-prices HTTP ${res.status}`);
      return summarise(await res.json().catch(() => null));
    },
  };
}
