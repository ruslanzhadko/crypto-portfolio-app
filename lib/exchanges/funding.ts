import { D, decimal, requiredDecimal as rd, sum } from "./decimal";
import type { Request } from "./transport";
import type { OpenPosition } from "./types";

export type FundingSummary = {
  amount: string | null;
  since: number | null;
  updatedAt: number;
  status: "complete" | "unavailable" | "pending";
};
type Row = Record<string, unknown>;
const HOUR = 3600_000;
/** The settlement refresh boundary is HH:01 UTC (independent of worker startup). */
export function fundingPeriod(time: number) {
  return Math.floor((time - 60_000) / HOUR);
}
const WEEK = 7 * 86400_000;
const LOOKBACK = 90 * 86400_000;
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.some((r) => !r || typeof r !== "object"))
    throw new Error("Invalid funding history");
  return value as Row[];
}
function timestamp(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error("Invalid history time");
  return n;
}
/** Walk trades backwards from the observed size, stopping at flat or a direction reversal. */
export function positionOpening(
  size: string,
  trades: { time: number; quantity: string }[],
): number | null {
  let remaining = new D(size);
  const groups = new Map<number, InstanceType<typeof D>>();
  for (const trade of trades)
    groups.set(
      trade.time,
      (groups.get(trade.time) ?? new D(0)).plus(trade.quantity),
    );
  for (const [time, quantity] of [...groups].sort((a, b) => b[0] - a[0])) {
    const before = remaining.minus(quantity);
    if (before.isZero() || before.isNegative() !== remaining.isNegative())
      return time;
    remaining = before;
  }
  return null;
}

/** Funding reads are isolated from balance sync, bounded and cached; never fabricate a partial total. */
export class FundingReader {
  private cache = new Map<string, FundingSummary>();
  constructor(
    private venue: "binance" | "bybit" | "hyperliquid",
    private request?: Request,
    private info?: (body: Record<string, unknown>) => Promise<unknown>,
    private user?: string,
  ) {}
  async enrich(positions: OpenPosition[], native?: Map<string, string | null>) {
    const keys = new Set(positions.map((p) => this.key(p)));
    for (const key of this.cache.keys())
      if (!keys.has(key)) this.cache.delete(key);
    let refreshed = false;
    for (const p of positions) {
      const key = this.key(p),
        cached = this.cache.get(key);
      if (
        cached &&
        fundingPeriod(Date.now()) === fundingPeriod(cached.updatedAt)
      ) {
        p.funding = cached;
        continue;
      }
      // Hyperliquid supplies cumulative funding since opening directly, with
      // the same signed cash convention: received positive, paid negative.
      if (native?.has(p.positionKey)) {
        const amount = native.get(p.positionKey);
        p.funding = {
          amount: amount == null ? null : decimal(amount),
          since: null,
          updatedAt: Date.now(),
          status: amount == null ? "unavailable" : "complete",
        };
        this.cache.set(key, p.funding);
        continue;
      }
      // Backfill only one position per sync so history cannot starve live positions.
      if (refreshed) {
        p.funding = cached ?? {
          amount: null,
          since: null,
          updatedAt: Date.now(),
          status: "pending",
        };
        continue;
      }
      refreshed = true;
      try {
        p.funding = await this.read(p);
      } catch {
        p.funding = {
          amount: null,
          since: null,
          updatedAt: Date.now(),
          status: "unavailable",
        };
      }
      this.cache.set(key, p.funding);
    }
  }
  private key(p: OpenPosition) {
    return `${p.positionKey}:${p.side}:${p.baseSize}:${p.entryPrice}`;
  }
  private async read(p: OpenPosition): Promise<FundingSummary> {
    // Symbol-level funding cannot be safely split between concurrent hedge legs.
    if (
      (this.venue === "binance" && !p.positionKey.endsWith(":BOTH")) ||
      (this.venue === "bybit" && !p.positionKey.endsWith(":0"))
    )
      throw new Error("Hedge funding attribution unavailable");
    let budget = 24;
    const get = async (
      path: string,
      api: string,
      params: Record<string, unknown>,
      weight = 1,
    ) => {
      if (--budget < 0 || !this.request)
        throw new Error("History budget exhausted");
      return this.request(path, api, params, weight);
    };
    const info = async (body: Record<string, unknown>) => {
      if (--budget < 0 || !this.info)
        throw new Error("History budget exhausted");
      return this.info({ ...body, user: this.user });
    };
    const bybitPages = async (
      path: string,
      params: Record<string, unknown>,
    ) => {
      const all: Row[] = [],
        seen = new Set<string>();
      let cursor = "";
      do {
        const response = (await get(path, "private", {
          ...params,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        })) as {
          retCode?: number;
          result?: { list?: unknown; nextPageCursor?: string };
        };
        if (response.retCode !== 0 || !response.result)
          throw new Error("Funding unavailable");
        all.push(...rows(response.result.list));
        cursor = response.result.nextPageCursor ?? "";
        if (cursor && seen.has(cursor)) throw new Error("Repeated cursor");
        seen.add(cursor);
      } while (cursor);
      return all;
    };
    const now = Date.now(),
      earliest = now - LOOKBACK;
    const trades: { time: number; quantity: string }[] = [],
      ledger: Row[] = [];
    const signedSize = new D(p.baseSize)
      .mul(p.side === "short" ? -1 : 1)
      .toFixed();
    let since: number | null = null;
    let verifiedLatestTrade = false;
    for (let endTime = now; endTime >= earliest && since === null; ) {
      const startTime = Math.max(earliest, endTime - WEEK + 1);
      if (this.venue === "binance") {
        const batch = rows(
          await get(
            "userTrades",
            "fapiPrivate",
            { symbol: p.symbol, startTime, endTime, limit: 1000 },
            5,
          ),
        );
        if (batch.length >= 1000) throw new Error("Truncated trade history");
        for (const r of batch) {
          if (
            r.symbol !== p.symbol ||
            r.positionSide !== "BOTH" ||
            !["BUY", "SELL"].includes(String(r.side))
          )
            throw new Error("Ambiguous trade history");
          trades.push({
            time: timestamp(r.time),
            quantity: new D(rd(r.qty))
              .mul(r.side === "SELL" ? -1 : 1)
              .toFixed(),
          });
        }
      } else if (this.venue === "bybit") {
        const batch = await bybitPages("v5/account/transaction-log", {
          accountType: "UNIFIED",
          category: "linear",
          currency: p.settle,
          baseCoin: p.base,
          startTime,
          endTime,
        });
        for (const r of batch
          .filter((r) => r.symbol === p.symbol && r.currency === p.settle)
          .sort(
            (a, b) =>
              timestamp(b.transactionTime) - timestamp(a.transactionTime),
          )) {
          if (r.transSubType === "movePosition")
            throw new Error("Moved position");
          ledger.push(r);
          if (r.type === "TRADE") {
            if (!verifiedLatestTrade) {
              // Provider ordering among fills sharing a millisecond is undefined.
              // One of their post-trade sizes must match the observed final size.
              if (
                !batch.some(
                  (fill) =>
                    fill.type === "TRADE" &&
                    fill.symbol === p.symbol &&
                    fill.currency === p.settle &&
                    timestamp(fill.transactionTime) ===
                      timestamp(r.transactionTime) &&
                    new D(rd(fill.size)).eq(signedSize),
                )
              )
                throw new Error("Position changed during history read");
              verifiedLatestTrade = true;
            }
            if (!["Buy", "Sell"].includes(String(r.side)))
              throw new Error("Invalid trade side");
            trades.push({
              time: timestamp(r.transactionTime),
              quantity: new D(rd(r.qty))
                .mul(r.side === "Sell" ? -1 : 1)
                .toFixed(),
            });
          }
        }
      } else {
        const batch = rows(
          await info({
            type: "userFillsByTime",
            startTime,
            endTime,
            aggregateByTime: false,
          }),
        );
        if (batch.length >= 2000) throw new Error("Truncated fill history");
        for (const r of batch
          .filter((r) => r.coin === p.base)
          .sort((a, b) => timestamp(b.time) - timestamp(a.time))) {
          if (!verifiedLatestTrade) {
            const after = new D(rd(r.startPosition)).plus(
              new D(rd(r.sz)).mul(r.side === "A" ? -1 : 1),
            );
            if (!after.eq(signedSize))
              throw new Error("Position changed during history read");
            verifiedLatestTrade = true;
          }
          if (!["B", "A"].includes(String(r.side)))
            throw new Error("Invalid fill side");
          trades.push({
            time: timestamp(r.time),
            quantity: new D(rd(r.sz)).mul(r.side === "A" ? -1 : 1).toFixed(),
          });
        }
      }
      since = positionOpening(signedSize, trades);
      endTime = startTime - 1;
    }
    if (since === null) throw new Error("Opening outside available history");
    const values: string[] = [];
    if (this.venue === "bybit") {
      for (const r of ledger)
        if (timestamp(r.transactionTime) > since && r.type === "SETTLEMENT")
          values.push(rd(r.funding));
    } else if (this.venue === "binance") {
      const seen = new Set<string>();
      for (let page = 1; ; page++) {
        const batch = rows(
          await get(
            "income",
            "fapiPrivate",
            {
              symbol: p.symbol,
              incomeType: "FUNDING_FEE",
              startTime: since + 1,
              endTime: now,
              limit: 1000,
              page,
            },
            30,
          ),
        );
        for (const r of batch) {
          if (
            r.symbol !== p.symbol ||
            r.asset !== p.settle ||
            r.incomeType !== "FUNDING_FEE" ||
            timestamp(r.time) <= since ||
            timestamp(r.time) > now
          )
            throw new Error("Invalid funding record");
          const id = String(r.tranId);
          if (seen.has(id)) throw new Error("Repeated funding record");
          seen.add(id);
          values.push(rd(r.income));
        }
        if (batch.length < 1000) break;
      }
    } else {
      let startTime = since + 1;
      for (;;) {
        const batch = rows(
          await info({ type: "userFunding", startTime, endTime: now }),
        );
        for (const r of batch) {
          const delta = r.delta as Row;
          if (
            !delta ||
            timestamp(r.time) < startTime ||
            timestamp(r.time) > now
          )
            throw new Error("Invalid funding record");
          if (delta.coin === p.base) values.push(rd(delta.usdc));
        }
        if (batch.length < 500) break;
        // Do not skip records sharing a timestamp at the pagination boundary.
        const lastTime = Math.max(...batch.map((r) => timestamp(r.time)));
        const atBoundary = batch.filter((r) => timestamp(r.time) === lastTime);
        if (atBoundary.length > 1)
          throw new Error("Ambiguous history boundary");
        if (lastTime < startTime) throw new Error("Repeated history page");
        startTime = lastTime + 1;
      }
    }
    if (this.venue === "binance") {
      const latest = rows(
        await get("positionRisk", "fapiPrivateV3", { symbol: p.symbol }, 5),
      ).find((r) => r.symbol === p.symbol && r.positionSide === "BOTH");
      if (
        !latest ||
        !new D(rd(latest.positionAmt)).eq(signedSize) ||
        !new D(rd(latest.entryPrice)).eq(p.entryPrice ?? "0")
      )
        throw new Error("Position changed during funding read");
    }
    return {
      amount: decimal(sum(values)),
      since,
      updatedAt: now,
      status: "complete",
    };
  }
}
