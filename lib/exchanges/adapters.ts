import { NextFundingReader } from "./next-funding";
import { FundingReader } from "./funding";
import { D, decimal, requiredDecimal as rd, multiply, sum } from "./decimal";
import {
  ExchangeError,
  safeError,
  type ExchangeAdapter,
  type AccountBalance,
  type AssetBalance,
  type OpenPosition,
  type SyncResult,
} from "./types";
import { assertBinanceReadOnly, assertBybitReadOnly } from "./permissions";
import type { Request } from "./transport";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ExchangeError("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new ExchangeError("INVALID_RESPONSE");
  return value.map(record);
}
function str(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new ExchangeError("INVALID_RESPONSE");
  return value;
}
function positive(value: unknown): string | null {
  const n = decimal(value);
  return n && new D(n).gt(0) ? n : null;
}
function bybitResult(value: unknown) {
  const response = record(value);
  if (response.retCode !== 0) throw new ExchangeError("UNAVAILABLE");
  return record(response.result);
}

export class BybitAdapter implements ExchangeAdapter {
  private nextFunding = new NextFundingReader("bybit", (...args) =>
    this.request(...args),
  );
  private funding = new FundingReader("bybit", (...args) =>
    this.request(...args),
  );
  private mode = "";
  private instruments = new Map<string, { base: string; settle: string }>();
  private loadedAt = 0;
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}
  async verify() {
    const key = bybitResult(await this.request("v5/user/query-api", "private"));
    assertBybitReadOnly(key);
    const info = bybitResult(await this.request("v5/account/info", "private"));
    if (
      ![3, 4, 5, 6].includes(Number(info.unifiedMarginStatus)) ||
      !["REGULAR_MARGIN", "ISOLATED_MARGIN"].includes(String(info.marginMode))
    )
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    this.mode = info.marginMode === "ISOLATED_MARGIN" ? "isolated" : "cross";
    return {
      externalAccountId:
        key.userID === undefined ? undefined : String(key.userID),
    };
  }
  private async pages(
    path: string,
    api: string,
    params: Record<string, unknown>,
  ) {
    const all: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let cursor = "";
    do {
      const result = bybitResult(
        await this.request(path, api, {
          ...params,
          ...(cursor ? { cursor } : {}),
        }),
      );
      all.push(...records(result.list));
      cursor =
        typeof result.nextPageCursor === "string" ? result.nextPageCursor : "";
      if (cursor && (seen.has(cursor) || seen.size >= 100))
        throw new ExchangeError("INVALID_RESPONSE");
      seen.add(cursor);
    } while (cursor);
    return all;
  }
  async fetch(): Promise<SyncResult> {
    if (!this.mode) throw new ExchangeError("INVALID_RESPONSE");
    if (Date.now() - this.loadedAt > 3_600_000) {
      const rows = await this.pages("v5/market/instruments-info", "public", {
        category: "linear",
        limit: 1000,
      });
      this.instruments = new Map(
        rows.map((row) => [
          str(row.symbol),
          { base: str(row.baseCoin), settle: str(row.settleCoin) },
        ]),
      );
      this.loadedAt = Date.now();
    }
    const rates = await this.prices().catch(() => new Map<string, string>());
    const coins = records(
      bybitResult(
        await this.request("v5/account/wallet-balance", "private", {
          accountType: "UNIFIED",
        }),
      ).list,
    );
    if (coins.length !== 1) throw new ExchangeError("INVALID_RESPONSE");
    const wallet = coins[0]!;
    const balances: AssetBalance[] = records(wallet.coin)
      .map((coin) => {
        const symbol = str(coin.coin);
        const total = new D(rd(coin.walletBalance))
          .minus(decimal(coin.spotBorrow) ?? "0")
          .toFixed();
        const equity = decimal(coin.equity);
        const usd = decimal(coin.usdValue);
        const price =
          equity && !new D(equity).isZero() && usd !== null
            ? new D(usd).div(equity).toFixed(18)
            : (rates.get(symbol) ?? null);
        return {
          assetId: `bybit:${symbol}`,
          symbol,
          total,
          free: null,
          locked: decimal(coin.locked),
          debt: decimal(coin.borrowAmount),
          priceUsd: price,
          usdValue: multiply(total, price),
        };
      })
      .filter(
        (b) =>
          !new D(b.total).isZero() ||
          (b.debt !== null && !new D(b.debt).isZero()),
      );
    const positions: OpenPosition[] = [];
    // Fail closed on unsupported exposure in a shared equity pool.
    for (const category of ["inverse", "option"]) {
      const unsupported = await this.pages("v5/position/list", "private", {
        category,
        limit: 200,
      });
      if (unsupported.some((row) => !new D(rd(row.size)).isZero()))
        throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    }
    for (const settle of ["USDT", "USDC"]) {
      const rows = await this.pages("v5/position/list", "private", {
        category: "linear",
        settleCoin: settle,
        limit: 200,
      });
      for (const row of rows) {
        const size = rd(row.size);
        if (new D(size).isZero()) continue;
        const symbol = str(row.symbol),
          market = this.instruments.get(symbol);
        if (
          !market ||
          market.settle !== settle ||
          !["Buy", "Sell"].includes(String(row.side))
        )
          throw new ExchangeError("INVALID_RESPONSE");
        const pnl = decimal(row.unrealisedPnl),
          mark = decimal(row.markPrice);
        positions.push({
          positionKey: `${symbol}:${row.positionIdx}`,
          symbol,
          base: market.base,
          settle,
          side: row.side === "Buy" ? "long" : "short",
          contracts: size,
          contractSize: "1",
          baseSize: size,
          notionalUsd: multiply(
            multiply(size, mark),
            rates.get(settle) ?? null,
          ),
          entryPrice: decimal(row.avgPrice),
          markPrice: mark,
          liquidationPrice: positive(row.liqPrice),
          leverage: positive(row.leverage),
          marginMode: this.mode,
          margin: decimal(row.positionIM),
          unrealizedPnl: pnl,
          unrealizedPnlUsd: multiply(pnl, rates.get(settle) ?? null),
        });
      }
    }
    await this.funding.enrich(positions);
    await this.nextFunding.enrich(positions);
    const coinRows = records(wallet.coin);
    const equity =
      decimal(wallet.totalEquity) ??
      (coinRows.every((c) => decimal(c.usdValue) !== null)
        ? sum(coinRows.map((c) => decimal(c.usdValue)))
        : null);
    const complete =
      equity !== null &&
      balances.every((b) => b.usdValue !== null) &&
      positions.every((p) => p.unrealizedPnlUsd !== null);
    return {
      accounts: [
        {
          accountKey: "unified",
          kind: "unified",
          mode: this.mode,
          equityUsd: equity,
          availableUsd: decimal(wallet.totalAvailableBalance),
          unrealizedPnlUsd: positions.every((p) => p.unrealizedPnlUsd !== null)
            ? sum(positions.map((p) => p.unrealizedPnlUsd))
            : null,
          complete,
          errorCode: complete ? null : "UNPRICED_ASSETS",
          balances,
          positions,
        },
      ],
      failedAccounts: [],
    };
  }
}

export class BinanceAdapter implements ExchangeAdapter {
  private nextFunding = new NextFundingReader("binance", (...args) =>
    this.request(...args),
  );
  private funding = new FundingReader("binance", (...args) =>
    this.request(...args),
  );
  private markets = new Map<string, { base: string; settle: string }>();
  private spotMarkets: { id: string; base: string; quote: string }[] = [];
  private loadedAt = 0;
  private externalAccountId: string | undefined;
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}
  async verify() {
    assertBinanceReadOnly(
      record(await this.request("account/apiRestrictions", "sapi", {}, 1)),
    );
    return {};
  }
  async fetch(includeSpot: boolean): Promise<SyncResult> {
    const accounts: AccountBalance[] = [],
      failedAccounts: SyncResult["failedAccounts"] = [];
    const rates = await this.prices().catch(() => new Map<string, string>());
    if (includeSpot) {
      try {
        if (!this.spotMarkets.length) {
          this.spotMarkets = records(
            record(await this.request("exchangeInfo", "public", {}, 20))
              .symbols,
          ).map((r) => ({
            id: str(r.symbol),
            base: str(r.baseAsset),
            quote: str(r.quoteAsset),
          }));
        }
        const ticker = new Map(
          records(await this.request("ticker/price", "public", {}, 4)).map(
            (r) => [str(r.symbol), rd(r.price)],
          ),
        );
        const usdRates = new Map(rates);
        for (const market of this.spotMarkets) {
          const quote = rates.get(market.quote),
            price = ticker.get(market.id);
          if (
            quote &&
            price &&
            new D(price).gt(0) &&
            !usdRates.has(market.base)
          )
            usdRates.set(market.base, multiply(price, quote)!);
        }
        const response = record(
          await this.request("account", "private", {}, 20),
        );
        if (response.uid !== undefined)
          this.externalAccountId = String(response.uid);
        const balances: AssetBalance[] = records(response.balances)
          .map((row) => {
            const symbol = str(row.asset),
              free = rd(row.free),
              locked = rd(row.locked);
            const total = new D(free).plus(locked).toFixed(),
              price = usdRates.get(symbol) ?? null;
            return {
              assetId: `binance:${symbol}`,
              symbol,
              total,
              free,
              locked,
              debt: null,
              priceUsd: price,
              usdValue: multiply(total, price),
            };
          })
          .filter((b) => !new D(b.total).isZero());
        const complete = balances.every((b) => b.usdValue !== null);
        accounts.push({
          accountKey: "spot",
          kind: "spot",
          mode: "spot",
          equityUsd: sum(balances.map((b) => b.usdValue)),
          availableUsd: complete
            ? sum(balances.map((b) => multiply(b.free, b.priceUsd)))
            : null,
          unrealizedPnlUsd: null,
          complete,
          errorCode: complete ? null : "UNPRICED_ASSETS",
          balances,
        });
      } catch (error) {
        failedAccounts.push({
          accountKey: "spot",
          kind: "spot",
          errorCode: safeError(error),
        });
      }
    }
    try {
      if (Date.now() - this.loadedAt > 3_600_000) {
        this.markets = new Map(
          records(
            record(await this.request("exchangeInfo", "fapiPublic")).symbols,
          ).map((r) => [
            str(r.symbol),
            { base: str(r.baseAsset), settle: str(r.marginAsset) },
          ]),
        );
        this.loadedAt = Date.now();
      }
      const wallet = record(
        await this.request("account", "fapiPrivateV3", {}, 5),
      );
      // Portfolio margin is not exposed through this classic account adapter.
      const rows = records(
        await this.request("positionRisk", "fapiPrivateV3", {}, 5),
      );
      // V3 positionRisk omits configured leverage. Metadata failure must not discard balances.
      const configs = new Map<string, Record<string, unknown>>();
      if (rows.some((row) => !new D(rd(row.positionAmt)).isZero())) {
        try {
          for (const config of records(
            await this.request("symbolConfig", "fapiPrivate", {}, 5),
          ))
            configs.set(str(config.symbol), config);
        } catch {
          /* Keep known positions even when configuration is unavailable. */
        }
      }
      const positions: OpenPosition[] = [];
      for (const row of rows) {
        const quantity = new D(rd(row.positionAmt));
        if (quantity.isZero()) continue;
        const symbol = str(row.symbol),
          market = this.markets.get(symbol);
        if (!market || !["USDT", "USDC"].includes(market.settle))
          throw new ExchangeError("UNSUPPORTED_ACCOUNT");
        const size = quantity.abs().toFixed(),
          rate = rates.get(market.settle) ?? null;
        const pnl = decimal(row.unRealizedProfit);
        positions.push({
          positionKey: `${symbol}:${str(row.positionSide)}`,
          symbol,
          base: market.base,
          settle: market.settle,
          side: quantity.isNegative() ? "short" : "long",
          contracts: size,
          contractSize: "1",
          baseSize: size,
          notionalUsd: multiply(new D(rd(row.notional)).abs().toFixed(), rate),
          entryPrice: decimal(row.entryPrice),
          markPrice: decimal(row.markPrice),
          liquidationPrice: positive(row.liquidationPrice),
          leverage: positive(configs.get(symbol)?.leverage ?? row.leverage),
          marginMode:
            (configs.get(symbol)?.marginType ?? row.marginType) ===
              "ISOLATED" ||
            row.marginType === "isolated" ||
            new D(decimal(row.isolatedWallet) ?? "0").gt(0)
              ? "isolated"
              : "cross",
          margin: decimal(row.positionInitialMargin),
          unrealizedPnl: pnl,
          unrealizedPnlUsd: multiply(pnl, rate),
        });
      }
      await this.funding.enrich(positions);
      await this.nextFunding.enrich(positions);
      const assets = records(wallet.assets);
      const balances: AssetBalance[] = assets
        .map((row) => {
          const symbol = str(row.asset),
            total = rd(row.walletBalance),
            price = rates.get(symbol) ?? null;
          return {
            assetId: `binance:${symbol}`,
            symbol,
            total,
            free: decimal(row.availableBalance),
            locked: null,
            debt: null,
            priceUsd: price,
            usdValue: multiply(total, price),
          };
        })
        .filter((b) => !new D(b.total).isZero());
      const equityValues = assets.map((row) =>
        multiply(rd(row.marginBalance), rates.get(str(row.asset)) ?? null),
      );
      const nonzeroAssets = assets.filter(
        (row) => !new D(rd(row.marginBalance)).isZero(),
      );
      const complete =
        nonzeroAssets.every((row) => rates.has(str(row.asset))) &&
        positions.every((p) => p.unrealizedPnlUsd !== null);
      accounts.push({
        accountKey: "futures",
        kind: "futures",
        mode: "classic",
        equityUsd: sum(equityValues),
        availableUsd: complete
          ? sum(
              assets.map((row) =>
                multiply(
                  decimal(row.availableBalance),
                  rates.get(str(row.asset)) ?? null,
                ),
              ),
            )
          : null,
        unrealizedPnlUsd: positions.every((p) => p.unrealizedPnlUsd !== null)
          ? sum(positions.map((p) => p.unrealizedPnlUsd))
          : null,
        complete,
        errorCode: complete ? null : "UNPRICED_ASSETS",
        balances,
        positions,
      });
    } catch (error) {
      const code = safeError(error);
      failedAccounts.push({
        accountKey: "futures",
        kind: "futures",
        errorCode:
          code === "INVALID_KEY" || code === "IP_RESTRICTED"
            ? "FUTURES_UNAVAILABLE"
            : code,
      });
    }
    return {
      accounts,
      failedAccounts,
      externalAccountId: this.externalAccountId,
    };
  }
}
