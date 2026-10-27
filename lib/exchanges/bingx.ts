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

/** Spot and USDT perpetuals use separate equity pools. All requests are GET. */
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
    const uid = textField(identity.uid);
    if (!/^\d+$/.test(uid)) throw new ExchangeError("INVALID_RESPONSE");
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
    if (!wallets.length || wallets.some((wallet) => wallet.asset !== "USDT"))
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
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
    const rate = rates.get("USDT") ?? null;
    const positions: OpenPosition[] = rows.flatMap((row) => {
      const size = new D(rd(row.positionAmt)).abs();
      if (size.isZero()) return [];
      const symbol = textField(row.symbol);
      if (
        !symbol.endsWith("-USDT") ||
        (row.currency !== undefined && row.currency !== "USDT")
      )
        throw new ExchangeError("UNSUPPORTED_ACCOUNT");
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
          base: symbol.slice(0, -5),
          settle: "USDT",
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
    const total = sum(wallets.map((wallet) => rd(wallet.balance))),
      free = sum(wallets.map((wallet) => rd(wallet.availableMargin)));
    const complete = rate !== null;
    return {
      accountKey: "futures:usdt",
      kind: "futures",
      mode: "perpetual",
      equityUsd: multiply(
        sum(wallets.map((wallet) => rd(wallet.equity))),
        rate,
      ),
      availableUsd: multiply(free, rate),
      unrealizedPnlUsd: multiply(
        sum(wallets.map((wallet) => rd(wallet.unrealizedProfit))),
        rate,
      ),
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances: [
        {
          assetId: "bingx:USDT",
          symbol: "USDT",
          total,
          free,
          locked: null,
          debt: null,
          priceUsd: rate,
          usdValue: multiply(total, rate),
        },
      ],
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
