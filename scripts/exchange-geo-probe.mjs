#!/usr/bin/env node
// Checks whether exchange APIs accept requests from this server's IP.
// Public endpoints only: no keys, no account data. Run on a candidate VPS:
//   node exchange-geo-probe.mjs
// Geo blocks usually answer 451 (Binance) or 403 (CDN) for every endpoint,
// so a public 200 is a good first signal; still verify one read-only key
// after moving the worker.

const TIMEOUT_MS = 10_000;

const probes = [
  ["Binance spot", "https://api.binance.com/api/v3/time"],
  ["Binance USDⓈ-M", "https://fapi.binance.com/fapi/v1/time"],
  ["Bybit", "https://api.bybit.com/v5/market/time"],
  ["OKX", "https://www.okx.com/api/v5/public/time"],
  ["Gate", "https://api.gateio.ws/api/v4/spot/time"],
  ["BingX", "https://open-api.bingx.com/openApi/swap/v2/server/time"],
  ["Bitget", "https://api.bitget.com/api/v2/public/time"],
  ["KuCoin", "https://api.kucoin.com/api/v1/timestamp"],
  ["KuCoin Futures", "https://api-futures.kucoin.com/api/v1/timestamp"],
  ["MEXC spot", "https://api.mexc.com/api/v3/time"],
  ["MEXC futures", "https://contract.mexc.com/api/v1/contract/ping"],
  ["Aster futures", "https://fapi.asterdex.com/fapi/v1/time"],
  ["Aster spot", "https://sapi.asterdex.com/api/v1/time"],
  [
    "Hyperliquid",
    "https://api.hyperliquid.xyz/info",
    { method: "POST", body: '{"type":"meta"}' },
  ],
];

async function probe([name, url, init = {}]) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    const ms = Math.round(performance.now() - started);
    const blocked =
      res.status === 451 ||
      res.status === 403 ||
      /restricted location|not available in your (country|region)|forbidden/i.test(
        text.slice(0, 500),
      );
    return {
      name,
      status: res.status,
      ms,
      verdict: blocked ? "BLOCKED" : res.ok ? "OK" : "CHECK",
      note: res.ok ? "" : text.slice(0, 120).replace(/\s+/g, " "),
    };
  } catch (error) {
    return {
      name,
      status: "-",
      ms: Math.round(performance.now() - started),
      verdict: "ERROR",
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

const location = await fetch("https://ipinfo.io/json", {
  signal: AbortSignal.timeout(TIMEOUT_MS),
})
  .then((r) => r.json())
  .catch(() => null);
if (location?.ip)
  console.log(
    `Server: ${location.ip} · ${location.city}, ${location.country} · ${location.org}\n`,
  );

const results = await Promise.all(probes.map(probe));
console.table(results);
const failed = results.filter((r) => r.verdict !== "OK");
process.exitCode = failed.length ? 1 : 0;
