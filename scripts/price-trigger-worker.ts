import { prisma } from "../lib/db/prisma";
import { fetchPricesByIds } from "../lib/services/coingecko";
import { TriggerEngine } from "../lib/triggers/engine";
import {
  combinePrices,
  fetchBinanceTickers,
  mapToBinance,
} from "../lib/triggers/prices";
import { createTriggersVersionClient } from "../lib/triggers/signal";
import {
  deliverFiring,
  loadActiveTriggers,
  persistLatestPrices,
} from "../lib/triggers/store";

/**
 * Price alerts on the VM. Rules live in memory and are read from PostgreSQL once per :00/:30
 * window (or within a minute after a user edits them); prices come from Binance every tick and
 * from CoinGecko for coins Binance does not list. The database is touched only in windows and
 * when an alert fires, so Neon can sleep in between.
 */
const TICK_MS = 20_000;
/** Same cadence as the old Vercel cron, keeping CoinGecko inside its monthly budget. */
const COINGECKO_MS = 10 * 60_000;
const VERSION_POLL_MS = 60_000;
const WINDOW_MS = 30 * 60_000;
const STUCK_TICK_MS = 5 * 60_000;

if (!process.env.DATABASE_URL || !process.env.TELEGRAM_BOT_TOKEN)
  throw new Error("DATABASE_URL and TELEGRAM_BOT_TOKEN are required.");

const engine = new TriggerEngine();
const versions = createTriggersVersionClient();
let mapping = new Map<string, string>();
let coingecko = new Map<string, number>();
let coingeckoAt = 0;
let slot = -1;
let version: number | null = null;
let versionPolledAt = 0;
let stopping = false;

async function refreshCoinGecko(tokenIds: string[], now: number) {
  if (!tokenIds.length) return;
  const items = await fetchPricesByIds(tokenIds, { attempts: 2, timeoutMs: 8000 });
  for (const [id, item] of items) if (item.price > 0) coingecko.set(id, item.price);
  coingeckoAt = now;
}

/** Reads the rules and decides which coins can follow Binance. */
async function reload(reason: string, now: number) {
  engine.load(await loadActiveTriggers());
  const tokenIds = engine.tokenIds();
  coingecko = new Map([...coingecko].filter(([id]) => tokenIds.includes(id)));
  try {
    await refreshCoinGecko(tokenIds, now);
    const tickers = await fetchBinanceTickers();
    mapping = mapToBinance(
      tokenIds.map((tokenId) => ({
        tokenId,
        symbol: engine.symbolOf(tokenId) ?? "",
        price: coingecko.get(tokenId) ?? 0,
      })),
      tickers,
    );
  } catch {
    console.warn("[triggers] price source unavailable while reloading; keeping the old mapping");
  }
  console.log(
    `[triggers] ${reason}: ${engine.size} active, ${tokenIds.length} coins, ${mapping.size} on Binance`,
  );
}

async function tick() {
  const now = Date.now();
  const currentWindow = Math.floor(now / WINDOW_MS);
  if (currentWindow !== slot) {
    if (slot !== -1) await persistLatestPrices(engine.latestPrices(), new Date(now));
    await reload(slot === -1 ? "started" : "window", now);
    slot = currentWindow;
    // Close pooled connections so they cannot keep the database awake.
    await prisma.$disconnect();
  } else if (versions && now - versionPolledAt >= VERSION_POLL_MS) {
    versionPolledAt = now;
    const latest = await versions.poll();
    if (latest !== null && version !== null && latest !== version) {
      await reload("rules changed", now);
      await prisma.$disconnect();
    }
    if (latest !== null) version = latest;
  }
  if (!engine.size) return;

  const tokenIds = engine.tokenIds();
  const unmapped = tokenIds.filter((tokenId) => !mapping.has(tokenId));
  if (unmapped.length && now - coingeckoAt >= COINGECKO_MS)
    await refreshCoinGecko(unmapped, now).catch(() =>
      console.warn("[triggers] CoinGecko unavailable; retrying next round"),
    );
  const tickers = mapping.size
    ? await fetchBinanceTickers().catch(() => {
        console.warn("[triggers] Binance ticker unavailable; using CoinGecko prices");
        return new Map<string, number>();
      })
    : new Map<string, number>();

  const firings = engine.check(combinePrices(tokenIds, mapping, tickers, coingecko), now);
  for (const firing of firings) {
    const result = await deliverFiring(firing, new Date(now));
    console.log(
      `[triggers] ${firing.kind} ${firing.trigger.tokenSymbol} #${firing.trigger.id} ${result}`,
    );
  }
  if (firings.length) await prisma.$disconnect();
}

async function main() {
  let ticking = false;
  let tickStartedAt = 0;
  // Docker restarts the container (restart policy) if a tick never finishes.
  setInterval(() => {
    if (ticking && Date.now() - tickStartedAt > STUCK_TICK_MS) {
      console.error("[triggers] tick has been stuck for 5 minutes, restarting");
      process.exit(1);
    }
  }, 30_000).unref();

  console.log(
    versions
      ? "[triggers] trigger worker started; rule changes are picked up within a minute"
      : "[triggers] trigger worker started; no change signal, rules reload every 30 minutes",
  );
  while (!stopping) {
    ticking = true;
    tickStartedAt = Date.now();
    try {
      await tick();
    } catch {
      console.error("[triggers] tick failed; retrying. Details redacted.");
    } finally {
      ticking = false;
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
  await prisma.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    stopping = true;
    console.log(`[triggers] ${signal}, stopping`);
    void prisma.$disconnect().finally(() => process.exit(0));
  });

void main().catch(async () => {
  console.error("[triggers] startup failed");
  await prisma.$disconnect();
  process.exit(1);
});
