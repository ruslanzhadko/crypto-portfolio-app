/**
 * 24h price change by ticker from public exchange spot tickers (USDT pairs),
 * for coins that only exist on exchanges and have no CoinGecko identity.
 * Sources in order of liquidity; the first one listing a ticker wins.
 */
type Source = {
  name: string;
  url: string;
  parse: (body: unknown) => Map<string, number>;
};

const pct = (last: number, open: number) =>
  open > 0 && Number.isFinite(last) ? ((last - open) / open) * 100 : undefined;

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    : [];
}
function collect(
  list: Record<string, unknown>[],
  pick: (r: Record<string, unknown>) => [string, number | undefined] | null,
) {
  const out = new Map<string, number>();
  for (const r of list) {
    const pair = pick(r);
    if (pair && pair[1] !== undefined && Number.isFinite(pair[1]))
      out.set(pair[0].toUpperCase(), pair[1]);
  }
  return out;
}

export const SOURCES: Source[] = [
  {
    name: "binance",
    url: "https://api.binance.com/api/v3/ticker/24hr?type=MINI",
    parse: (body) =>
      collect(rows(body), (r) =>
        typeof r.symbol === "string" && r.symbol.endsWith("USDT")
          ? [r.symbol.slice(0, -4), pct(Number(r.lastPrice), Number(r.openPrice))]
          : null,
      ),
  },
  {
    name: "bybit",
    url: "https://api.bybit.com/v5/market/tickers?category=spot",
    parse: (body) => {
      const list =
        body && typeof body === "object" && "result" in body
          ? rows((body.result as { list?: unknown })?.list)
          : [];
      return collect(list, (r) =>
        typeof r.symbol === "string" && r.symbol.endsWith("USDT")
          ? [r.symbol.slice(0, -4), Number(r.price24hPcnt) * 100]
          : null,
      );
    },
  },
  {
    name: "okx",
    url: "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
    parse: (body) =>
      collect(
        body && typeof body === "object" && "data" in body ? rows(body.data) : [],
        (r) =>
          typeof r.instId === "string" && r.instId.endsWith("-USDT")
            ? [r.instId.slice(0, -5), pct(Number(r.last), Number(r.open24h))]
            : null,
      ),
  },
  {
    name: "gate",
    url: "https://api.gateio.ws/api/v4/spot/tickers",
    parse: (body) =>
      collect(rows(body), (r) =>
        typeof r.currency_pair === "string" && r.currency_pair.endsWith("_USDT")
          ? [r.currency_pair.slice(0, -5), Number(r.change_percentage)]
          : null,
      ),
  },
];

const TTL_MS = 5 * 60_000;
let cached: { until: number; changes: Map<string, number> } | undefined;
let inflight: Promise<Map<string, number>> | undefined;

async function load(fetchImpl: typeof fetch): Promise<Map<string, number>> {
  const results = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const res = await fetchImpl(source.url, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return new Map<string, number>();
        return source.parse(await res.json());
      } catch {
        return new Map<string, number>();
      }
    }),
  );
  const changes = new Map<string, number>();
  for (const map of results)
    for (const [symbol, change] of map)
      if (!changes.has(symbol)) changes.set(symbol, change);
  // Keep the previous data if every source failed this time.
  if (changes.size || !cached) cached = { until: Date.now() + TTL_MS, changes };
  else cached = { ...cached, until: Date.now() + 60_000 };
  return cached.changes;
}

export async function tickerChanges(
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number>> {
  if (cached && cached.until > Date.now()) return cached.changes;
  inflight ??= load(fetchImpl).finally(() => {
    inflight = undefined;
  });
  return inflight;
}

/** Test hook. */
export function resetTickerChanges() {
  cached = inflight = undefined;
}
