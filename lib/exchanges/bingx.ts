import { bingxClosedTrades } from "./closed-trades";
import { record, records } from "./adapters";
import { assertBinanceReadOnly } from "./permissions";
import { D, decimal, multiply, requiredDecimal as rd, sum } from "./decimal";
import { positive, textField, timestamp } from "./provider-utils";
import {
  ExchangeError,
  errorDiagnostics,
  safeError,
  type AccountBalance,
  type ExchangeAdapter,
  type OpenPosition,
  type SyncResult,
} from "./types";
import type { Request } from "./transport";
import { CycleHistoryReader } from "./cycle-history";
import { bingxTransfers } from "./transfers";
import { incomeLedgerResult, type ClosedInput } from "./closed-result";

export function bingxData(value: unknown, endpoint = "?"): unknown {
  const envelope = record(value);
  const code = String(envelope.code);
  // Endpoint, code and field names only: enough to tell an error from an unexpected shape.
  const detail = `${endpoint} code ${code} fields ${Object.keys(envelope).join(",") || "none"}`;
  if (code !== "0") {
    if (["100001", "100004", "100412", "100413"].includes(code))
      throw new ExchangeError("INVALID_KEY", detail);
    if (code === "100419") throw new ExchangeError("IP_RESTRICTED", detail);
    if (code === "100410") throw new ExchangeError("RATE_LIMIT", detail);
    throw new ExchangeError("UNAVAILABLE", detail);
  }
  if (envelope.data === undefined || envelope.data === null)
    throw new ExchangeError("INVALID_RESPONSE", detail);
  return envelope.data;
}

/** BingX key permission codes: 1 spot, 2 read, 3 perpetuals, 4 universal transfer, 5 withdraw, 7 internal transfer. */
const READ_PERMISSION = "2";

/**
 * Accepts only a read-only key bound to an IP whitelist. Keys answer with a bare
 * `{ apiKey, permissions: number[], ipAddresses, note }`; the documented Binance-style flags
 * inside the usual envelope are still understood.
 */
export function assertBingxReadOnly(value: unknown) {
  const body = record(value);
  if (!Array.isArray(body.permissions)) {
    assertBinanceReadOnly(record(bingxData(value, "account/apiPermissions")));
    return;
  }
  const codes = body.permissions.map(String);
  if (
    !codes.includes(READ_PERMISSION) ||
    codes.some((code) => code !== READ_PERMISSION)
  )
    throw new ExchangeError(
      "UNSAFE_KEY",
      `account/apiPermissions codes ${codes.join(",")}`,
    );
  const ips = Array.isArray(body.ipAddresses)
    ? body.ipAddresses.filter((ip) => typeof ip === "string" && ip.trim())
    : [];
  if (!ips.length) throw new ExchangeError("IP_RESTRICTED");
}

/** Margin assets of BingX perpetuals that have a verified USD rate. */
const MARGIN_ASSETS = ["USDT", "USDC"];

/** Spot and perpetuals use separate equity pools. All requests are GET. */
export class BingxAdapter implements ExchangeAdapter {
  private verified = false;
  private history = new CycleHistoryReader("bingx", (...args) =>
    this.request(...args),
  );
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}
  async closedResult(input: ClosedInput) {
    return incomeLedgerResult(input, async (startTime, endTime) => {
      const envelope = record(
        await this.request("user/income", "swap:v2:private", {
          symbol: input.symbol,
          startTime,
          endTime,
          limit: 1000,
        }),
      );
      if (String(envelope.code) !== "0") throw new ExchangeError("UNAVAILABLE");
      // An empty page is `data: null`.
      return envelope.data == null ? [] : records(envelope.data);
    });
  }
  /**
   * Position history needs a symbol: the coins come from the income ledger (realized PnL), then
   * each coin's positions are read for the whole range at once.
   */
  async closedTrades(since: number, until: number) {
    const symbols = new Set<string>();
    for (let start = since; start < until; start += 7 * 86_400_000) {
      const envelope = record(
        await this.request("user/income", "swap:v2:private", {
          incomeType: "REALIZED_PNL",
          startTime: start,
          endTime: Math.min(until, start + 7 * 86_400_000 - 1),
          limit: 1000,
        }),
      );
      if (String(envelope.code) !== "0") throw new ExchangeError("UNAVAILABLE");
      for (const r of envelope.data == null ? [] : records(envelope.data))
        if (typeof r.symbol === "string" && r.symbol) symbols.add(r.symbol);
    }
    const rows: Record<string, unknown>[] = [];
    for (const symbol of symbols) {
      const data = record(
        bingxData(
          await this.request("trade/positionHistory", "swap:v1:private", {
            symbol,
            startTs: since,
            endTs: until,
            pageIndex: 1,
            pageSize: 100,
          }),
          "positionHistory",
        ),
      );
      rows.push(...records(data.positionHistory ?? []));
    }
    return bingxClosedTrades(rows);
  }
  transfers(since: number) {
    return bingxTransfers(this.request, bingxData, since);
  }
  async verify() {
    assertBingxReadOnly(
      await this.request("account/apiPermissions", "account:v1:private"),
    );
    const identity = record(
      bingxData(await this.request("uid", "account:v1:private"), "uid"),
    );
    // BingX returns the UID as a JSON number; a string is accepted too.
    const uid = Number.isSafeInteger(identity.uid)
      ? String(identity.uid)
      : typeof identity.uid === "string"
        ? identity.uid
        : "";
    if (!/^\d+$/.test(uid))
      throw new ExchangeError(
        "INVALID_RESPONSE",
        `uid type ${typeof identity.uid}`,
      );
    this.verified = true;
    return { externalAccountId: uid };
  }
  private async spot(rates: Map<string, string>): Promise<AccountBalance> {
    const wallet = record(
      bingxData(
        await this.request("account/balance", "spot:v1:private"),
        "account/balance",
      ),
    );
    const prices = new Map(rates);
    try {
      for (const row of records(
        bingxData(
          await this.request("ticker/price", "spot:v2:public"),
          "ticker/price",
        ),
      )) {
        if (typeof row.symbol !== "string" || !row.symbol.endsWith("-USDT"))
          continue;
        const price = multiply(positive(row.price), rates.get("USDT") ?? null);
        if (price) prices.set(row.symbol.slice(0, -5), price);
      }
    } catch {
      /* Preserve holdings even when public valuation is unavailable. */
    }
    const balances = records(wallet.balances)
      .map((row) => {
        const symbol = textField(row.asset),
          free = rd(row.free),
          locked = rd(row.locked),
          total = new D(free).plus(locked).toFixed();
        const price = prices.get(symbol) ?? null;
        return {
          assetId: `bingx:${symbol}`,
          symbol,
          total,
          free,
          locked,
          debt: null,
          priceUsd: price,
          usdValue: multiply(total, price),
        };
      })
      .filter((balance) => !new D(balance.total).isZero());
    const complete = balances.every((balance) => balance.usdValue !== null);
    return {
      accountKey: "spot",
      kind: "spot",
      mode: "spot",
      equityUsd: sum(balances.map((balance) => balance.usdValue)),
      availableUsd: complete
        ? sum(
            balances.map((balance) => multiply(balance.free, balance.priceUsd)),
          )
        : null,
      unrealizedPnlUsd: null,
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances,
      positions: [],
    };
  }
  private async futures(rates: Map<string, string>): Promise<AccountBalance> {
    const wallets = records(
      bingxData(
        await this.request("user/balance", "swap:v3:private"),
        "user/balance",
      ),
    );
    // Perpetual margin wallets: USDT and USDC are valued at their rates; an empty wallet of any
    // other asset is skipped, a funded one leaves the account incomplete instead of failing it.
    const funded = wallets.filter(
      (wallet) =>
        wallet.asset === "USDT" ||
        !new D(decimal(wallet.balance) ?? "0").isZero() ||
        !new D(decimal(wallet.equity) ?? "0").isZero(),
    );
    if (!funded.length)
      throw new ExchangeError(
        "UNSUPPORTED_ACCOUNT",
        `user/balance assets ${wallets.map((w) => String(w.asset)).join(",") || "none"}`,
      );
    const rows = records(
      bingxData(
        await this.request("user/positions", "swap:v2:private"),
        "user/positions",
      ),
    );
    const market = new Map<string, Record<string, unknown>>();
    try {
      for (const row of records(
        bingxData(
          await this.request("quote/premiumIndex", "swap:v2:public"),
          "quote/premiumIndex",
        ),
      )) {
        if (typeof row.symbol === "string") market.set(row.symbol, row);
      }
    } catch {
      /* Positions remain available without optional market estimates. */
    }
    const rateOf = (asset: string) =>
      MARGIN_ASSETS.includes(asset) ? (rates.get(asset) ?? null) : null;
    const positions: OpenPosition[] = rows.flatMap((row) => {
      const size = new D(rd(row.positionAmt)).abs();
      if (size.isZero()) return [];
      const symbol = textField(row.symbol);
      const settle = symbol.slice(symbol.lastIndexOf("-") + 1);
      if (
        !symbol.includes("-") ||
        !MARGIN_ASSETS.includes(settle) ||
        (row.currency !== undefined && row.currency !== settle)
      )
        throw new ExchangeError(
          "UNSUPPORTED_ACCOUNT",
          `user/positions quote ${settle} currency ${String(row.currency)}`,
        );
      const rate = rateOf(settle);
      if (
        !["LONG", "SHORT"].includes(String(row.positionSide)) ||
        typeof row.isolated !== "boolean"
      )
        throw new ExchangeError("INVALID_RESPONSE");
      const info = market.get(symbol),
        mark = positive(row.markPrice) ?? positive(info?.markPrice);
      const next = timestamp(info?.nextFundingTime);
      return [
        {
          positionKey: textField(row.positionId),
          symbol,
          base: symbol.slice(0, symbol.lastIndexOf("-")),
          settle,
          side: row.positionSide === "SHORT" ? "short" : "long",
          contracts: size.toFixed(),
          contractSize: "1",
          baseSize: size.toFixed(),
          notionalUsd: multiply(
            decimal(row.positionValue) ?? multiply(size.toFixed(), mark),
            rate,
          ),
          entryPrice: decimal(row.avgPrice),
          markPrice: mark,
          liquidationPrice: positive(row.liquidationPrice),
          leverage: decimal(row.leverage),
          marginMode: row.isolated ? "isolated" : "cross",
          margin: decimal(row.initialMargin),
          unrealizedPnl: decimal(row.unrealizedProfit),
          unrealizedPnlUsd: multiply(decimal(row.unrealizedProfit), rate),
          funding: {
            amount: null,
            realizedPnl: null,
            tradingFees: null,
            since: null,
            updatedAt: Date.now(),
            status: "unavailable",
            nextRate: decimal(info?.lastFundingRate),
            nextTime: next !== null && next > Date.now() ? next : null,
            nextRateUpdatedAt: Date.now(),
          },
        },
      ];
    });
    if (
      new Set(positions.map((position) => position.positionKey)).size !==
      positions.length
    )
      throw new ExchangeError("INVALID_RESPONSE");
    await this.history.enrich(positions);
    const valued = funded.map((wallet) => {
      const symbol = textField(wallet.asset),
        rate = rateOf(symbol),
        total = rd(wallet.balance),
        free = rd(wallet.availableMargin);
      return {
        rate,
        equityUsd: multiply(rd(wallet.equity), rate),
        availableUsd: multiply(free, rate),
        unrealizedPnlUsd: multiply(rd(wallet.unrealizedProfit), rate),
        balance: {
          assetId: `bingx:${symbol}`,
          symbol,
          total,
          free,
          locked: null,
          debt: null,
          priceUsd: rate,
          usdValue: multiply(total, rate),
        },
      };
    });
    const complete = valued.every((wallet) => wallet.rate !== null);
    // Without any rate the totals are unknown, not zero.
    const priced = valued.some((wallet) => wallet.rate !== null);
    return {
      accountKey: "futures:usdt",
      kind: "futures",
      mode: "perpetual",
      equityUsd: priced ? sum(valued.map((wallet) => wallet.equityUsd)) : null,
      availableUsd: complete
        ? sum(valued.map((wallet) => wallet.availableUsd))
        : null,
      unrealizedPnlUsd: priced
        ? sum(valued.map((wallet) => wallet.unrealizedPnlUsd))
        : null,
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances: valued.map((wallet) => wallet.balance),
      positions,
    };
  }
  async fetch(includeSpot: boolean): Promise<SyncResult> {
    if (!this.verified) throw new ExchangeError("INVALID_RESPONSE");
    const rates = await this.prices().catch(() => new Map<string, string>());
    const result: SyncResult = { accounts: [], failedAccounts: [] };
    if (includeSpot) {
      try {
        result.accounts.push(await this.spot(rates));
      } catch (error) {
        result.failedAccounts.push(failure("spot", "spot", error));
      }
    }
    try {
      result.accounts.push(await this.futures(rates));
    } catch (error) {
      result.failedAccounts.push(failure("futures:usdt", "futures", error));
    }
    return result;
  }
}

/** A failed account read; the log keeps the provider's class and code for diagnosis. */
function failure(accountKey: string, kind: "spot" | "futures", error: unknown) {
  const errorCode = safeError(error);
  console.warn(
    `[bingx] ${accountKey} read failed: ${errorCode} (${errorDiagnostics(error)})`,
  );
  return { accountKey, kind, errorCode };
}
