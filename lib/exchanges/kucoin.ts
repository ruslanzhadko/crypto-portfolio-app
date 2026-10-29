import { record, records } from "./adapters";
import { D, decimal, multiply, requiredDecimal as rd, sum } from "./decimal";
import { finishPosition, positive, timestamp, type Row } from "./provider-utils";
import {
  ExchangeError,
  safeError,
  type AccountBalance,
  type ErrorCode,
  type ExchangeAdapter,
  type OpenPosition,
  type SyncResult,
} from "./types";
import type { Request } from "./transport";
import type { ClosedInput } from "./closed-result";
import { kucoinTransfers } from "./transfers";

/**
 * KuCoin classic account: spot (main + trade) on api.kucoin.com and USDT/USDC-margined futures on
 * api-futures.kucoin.com, one read-only ("General") key for both. Every reply is `{code, data}`;
 * `200000` is success.
 */
export function kucoinData(value: unknown, denied: ErrorCode = "INVALID_KEY"): unknown {
  const r = record(value),
    code = String(r.code);
  if (code !== "200000") {
    if (["400001", "400002", "400003", "400004", "400005", "411100"].includes(code))
      throw new ExchangeError("INVALID_KEY", `kucoin:${code}`);
    if (code === "400006") throw new ExchangeError("IP_RESTRICTED", `kucoin:${code}`);
    // Access denied: the key lacks the permission this section needs.
    if (code === "400007") throw new ExchangeError(denied, `kucoin:${code}`);
    if (code === "429000") throw new ExchangeError("RATE_LIMIT", `kucoin:${code}`);
    throw new ExchangeError("UNAVAILABLE", `kucoin:${code}`);
  }
  if (r.data === undefined) throw new ExchangeError("INVALID_RESPONSE", "kucoin:data");
  return r.data;
}

/** KuCoin's `{"code":"400007",…}` inside an HTTP error thrown by the transport, if any. */
export function kucoinErrorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  return /"code"\s*:\s*"?(\d{6})"?/.exec(message)?.[1] ?? null;
}

/** KuCoin futures call bitcoin XBT. */
export function kucoinAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  return upper === "XBT" ? "BTC" : upper;
}

const SETTLES = ["USDT", "USDC"] as const;
const SPOT_KINDS = new Set(["main", "trade", "trade_hf"]);
const STABLE = new Set(["USDT", "USDC"]);
const MARKET_TTL_MS = 300_000;

export class KucoinAdapter implements ExchangeAdapter {
  private contracts: { at: number; rows: Map<string, Row> } | null = null;
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}

  private async data(
    path: string,
    api: string,
    params: Record<string, unknown> = {},
    weight = 1,
    denied?: ErrorCode,
  ) {
    let reply: unknown;
    try {
      reply = await this.request(path, api, { version: "v1", ...params }, weight);
    } catch (error) {
      // ccxt throws on HTTP 401/403 before the body is read: take KuCoin's own code from it.
      const code = kucoinErrorCode(error);
      if (!code) throw error;
      reply = { code };
    }
    return kucoinData(reply, denied);
  }

  async verify() {
    const info = record(await this.data("user/api-key", "private", {}, 2));
    const permissions = String(info.permission ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // "General" only reads; any trading, transfer or withdrawal right makes the key unsafe to store.
    if (!permissions.length || permissions.some((p) => p !== "General"))
      throw new ExchangeError("UNSAFE_KEY");
    const uid = String(info.uid ?? "");
    if (!/^\d+$/.test(uid)) throw new ExchangeError("INVALID_RESPONSE", "kucoin:uid");
    return { externalAccountId: uid };
  }

  transfers(since: number) {
    return kucoinTransfers((path, params) => this.data(path, "private", params, 1), since);
  }

  async closedResult(input: ClosedInput): Promise<string | null> {
    if (input.otherLeg) return null;
    // History keeps three months and answers at most a week per query.
    const from = Math.max(input.lastSeenAt - 7 * 86400_000 + 60_000, input.since - 60_000);
    const page = record(
      await this.data(
        "history-positions",
        "futuresPrivate",
        { symbol: input.symbol, from, to: Date.now(), limit: 50, pageId: 1 },
        1,
      ),
    );
    const closes = records(page.items).filter((r) => {
      const at = timestamp(r.closeTime);
      return r.symbol === input.symbol && at != null && at >= input.lastSeenAt - 5_000;
    });
    // Two closes since the last poll cannot be told apart: keep the estimate.
    if (closes.length !== 1) return null;
    const close = closes[0]!;
    if (close.settleCurrency !== input.settle) return null;
    const side = String(close.side ?? close.type ?? "").toUpperCase();
    if (!side.includes(input.positionKey.includes(":long") ? "LONG" : "SHORT")) return null;
    // `pnl` is already net: realized gross minus trading fees plus funding.
    return decimal(close.pnl);
  }

  private async rates() {
    const rates = new Map(await this.prices().catch(() => new Map<string, string>()));
    try {
      const tickers = records(record(await this.data("market/allTickers", "public", {}, 3)).ticker);
      const usdt = rates.get("USDT") ?? "1";
      for (const t of tickers) {
        const symbol = String(t.symbol ?? "");
        if (!symbol.endsWith("-USDT")) continue;
        const base = symbol.slice(0, -5);
        const price = multiply(positive(t.last), usdt);
        if (price && !rates.has(base)) rates.set(base, price);
      }
    } catch {
      /* Local valuation is optional; unpriced coins only mark the account partial. */
    }
    for (const stable of STABLE) if (!rates.has(stable)) rates.set(stable, "1");
    return rates;
  }

  private async contractRows() {
    if (this.contracts && Date.now() - this.contracts.at < MARKET_TTL_MS) return this.contracts.rows;
    const rows = records(await this.data("contracts/active", "futuresPublic", {}, 2));
    this.contracts = { at: Date.now(), rows: new Map(rows.map((r) => [String(r.symbol), r])) };
    return this.contracts.rows;
  }

  private async spot(rates: Map<string, string>): Promise<AccountBalance> {
    const rows = records(await this.data("accounts", "private", {}, 1, "SPOT_UNAVAILABLE"));
    const totals = new Map<string, { total: InstanceType<typeof D>; free: InstanceType<typeof D>; locked: InstanceType<typeof D> }>();
    for (const r of rows) {
      if (!SPOT_KINDS.has(String(r.type))) continue;
      const symbol = String(r.currency ?? "").toUpperCase();
      if (!symbol) throw new ExchangeError("INVALID_RESPONSE", "kucoin:currency");
      const row = totals.get(symbol) ?? { total: new D(0), free: new D(0), locked: new D(0) };
      row.total = row.total.plus(rd(r.balance));
      row.free = row.free.plus(rd(r.available));
      row.locked = row.locked.plus(rd(r.holds));
      totals.set(symbol, row);
    }
    const balances = [...totals]
      .filter(([, v]) => !v.total.isZero())
      .map(([symbol, v]) => {
        const price = rates.get(symbol) ?? null;
        return {
          assetId: `kucoin:${symbol}`,
          symbol,
          total: v.total.toFixed(),
          free: v.free.toFixed(),
          locked: v.locked.toFixed(),
          debt: null,
          priceUsd: price,
          usdValue: multiply(v.total.toFixed(), price),
        };
      });
    const complete = balances.every((b) => b.usdValue != null);
    return {
      accountKey: "spot",
      kind: "spot",
      mode: "classic",
      equityUsd: sum(balances.map((b) => b.usdValue)),
      availableUsd: complete ? sum(balances.map((b) => multiply(b.free, b.priceUsd))) : null,
      unrealizedPnlUsd: null,
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances,
      positions: [],
    };
  }

  private async positions(rates: Map<string, string>): Promise<OpenPosition[]> {
    const rows = records(
      await this.data("positions", "futuresPrivate", {}, 1, "FUTURES_UNAVAILABLE"),
    ).filter((r) => r.isOpen !== false && !new D(rd(r.currentQty)).isZero());
    if (!rows.length) return [];
    const contracts = await this.contractRows();
    const positions = rows.map((r) => {
      const symbol = String(r.symbol ?? "");
      const contract = contracts.get(symbol);
      const settle = String(r.settleCurrency ?? "").toUpperCase();
      if (!contract || !SETTLES.includes(settle as (typeof SETTLES)[number]) || r.isInverse === true)
        throw new ExchangeError("UNSUPPORTED_ACCOUNT", "kucoin:contract");
      const qty = new D(rd(r.currentQty));
      const side: "long" | "short" =
        String(r.positionSide).toUpperCase() === "SHORT" || (String(r.positionSide).toUpperCase() === "BOTH" && qty.lt(0))
          ? "short"
          : "long";
      const multiplier = rd(contract.multiplier);
      const lots = qty.abs().toFixed();
      const baseSize = new D(lots).mul(multiplier).toFixed();
      const mark = positive(r.markPrice);
      const rate = rates.get(settle) ?? null;
      const pnl = decimal(r.unrealisedPnl);
      const funding = decimal(r.posFunding ?? r.fundingFee);
      const nextTime = timestamp(contract.nextFundingRateDateTime);
      return finishPosition({
        positionKey: `${symbol}:${side}:${String(r.marginMode ?? "").toLowerCase()}`,
        symbol,
        base: kucoinAsset(String(contract.baseCurrency ?? symbol)),
        settle,
        side,
        contracts: lots,
        contractSize: multiplier,
        baseSize,
        notionalUsd: multiply(multiply(baseSize, mark), rate),
        entryPrice: positive(r.avgEntryPrice),
        markPrice: mark,
        liquidationPrice: positive(r.liquidationPrice),
        leverage: positive(r.leverage ?? r.realLeverage),
        marginMode: String(r.marginMode).toUpperCase() === "CROSS" ? "cross" : "isolated",
        margin: decimal(r.posMargin ?? r.maintMargin),
        unrealizedPnl: pnl,
        unrealizedPnlUsd: multiply(pnl, rate),
        funding: {
          amount: funding,
          // Gross realized PnL of the cycle; fees (realisedCost, positive when paid) and funding apart.
          realizedPnl: decimal(r.realisedGrossPnl),
          tradingFees: decimal(r.realisedCost) != null ? new D(rd(r.realisedCost)).negated().toFixed() : null,
          since: timestamp(r.openingTimestamp),
          updatedAt: Date.now(),
          status: funding == null ? "unavailable" : "complete",
          nextRate: decimal(contract.fundingFeeRate),
          nextTime: nextTime != null && nextTime > Date.now() ? nextTime : null,
          nextRateUpdatedAt: this.contracts?.at,
        },
      });
    });
    if (new Set(positions.map((p) => p.positionKey)).size !== positions.length)
      throw new ExchangeError("INVALID_RESPONSE", "kucoin:duplicate-position");
    return positions;
  }

  private async futures(rates: Map<string, string>): Promise<AccountBalance> {
    const overviews: Row[] = [];
    for (const currency of SETTLES)
      overviews.push(
        record(
          await this.data("account-overview", "futuresPrivate", { currency }, 1, "FUTURES_UNAVAILABLE"),
        ),
      );
    const positions = await this.positions(rates);
    const balances = overviews
      .map((o) => {
        const symbol = String(o.currency ?? "").toUpperCase();
        const price = rates.get(symbol) ?? null;
        // Wallet cash = equity minus the open positions' unrealized PnL.
        const cash = new D(rd(o.accountEquity)).minus(rd(o.unrealisedPNL ?? "0")).toFixed();
        return {
          assetId: `kucoin:futures:${symbol}`,
          symbol,
          total: cash,
          free: decimal(o.availableBalance),
          locked: null,
          debt: null,
          priceUsd: price,
          usdValue: multiply(cash, price),
        };
      })
      .filter((b) => !new D(b.total).isZero());
    const equityUsd = sum(
      overviews.map((o) => multiply(rd(o.accountEquity), rates.get(String(o.currency).toUpperCase()) ?? null)),
    );
    const complete =
      equityUsd != null &&
      overviews.every((o) => rates.has(String(o.currency).toUpperCase())) &&
      positions.every((p) => p.unrealizedPnlUsd != null && p.notionalUsd != null);
    return {
      accountKey: "futures",
      kind: "futures",
      mode: "classic",
      equityUsd,
      availableUsd: sum(
        overviews.map((o) => multiply(decimal(o.availableBalance), rates.get(String(o.currency).toUpperCase()) ?? null)),
      ),
      unrealizedPnlUsd: positions.every((p) => p.unrealizedPnlUsd != null)
        ? sum(positions.map((p) => p.unrealizedPnlUsd))
        : null,
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances,
      positions,
    };
  }

  async fetch(includeSpot: boolean): Promise<SyncResult> {
    const rates = await this.rates();
    const result: SyncResult = { accounts: [], failedAccounts: [] };
    if (includeSpot) {
      try {
        result.accounts.push(await this.spot(rates));
      } catch (e) {
        result.failedAccounts.push({ accountKey: "spot", kind: "spot", errorCode: safeError(e) });
      }
    }
    try {
      result.accounts.push(await this.futures(rates));
    } catch (e) {
      result.failedAccounts.push({ accountKey: "futures", kind: "futures", errorCode: safeError(e) });
    }
    return result;
  }
}
