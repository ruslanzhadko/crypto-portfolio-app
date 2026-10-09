import { record, records } from "./adapters";
import { D, decimal, multiply, requiredDecimal as rd, sum } from "./decimal";
import {
  assertIpWhitelist,
  finishPosition,
  positive,
  textField,
  timestamp,
  type Row,
} from "./provider-utils";
import {
  ExchangeError,
  safeError,
  type AccountBalance,
  type ExchangeAdapter,
  type OpenPosition,
  type SyncResult,
} from "./types";
import type { Request } from "./transport";

// Bitget uses the same signed GET mechanism for Classic (v2) and UTA (v3).
export function bitgetData(value: unknown): unknown {
  const r = record(value),
    code = String(r.code);
  if (code !== "00000") {
    if (
      ["40005", "40006", "40009", "40012", "40014", "40036", "40037"].includes(
        code,
      )
    )
      throw new ExchangeError("INVALID_KEY");
    if (code === "40038") throw new ExchangeError("IP_RESTRICTED");
    if (code === "429") throw new ExchangeError("RATE_LIMIT");
    throw new ExchangeError("UNAVAILABLE");
  }
  if (r.data == null) throw new ExchangeError("INVALID_RESPONSE");
  return r.data;
}

const products = ["USDT-FUTURES", "USDC-FUTURES", "COIN-FUTURES"] as const;
type Product = (typeof products)[number];

/** A single connection auto-detects the upstream account mode on every verification. */
export class BitgetAdapter implements ExchangeAdapter {
  private mode: "classic" | "unified" | null = null;
  private committedMode: typeof this.mode = null;
  private level = "";
  private fundingMarkets = new Map<
    Product,
    { at: number; rows: Map<string, Row> }
  >();
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}
  private async data(
    path: string,
    api: string,
    params: Record<string, unknown> = {},
  ) {
    return bitgetData(await this.request(path, api, params));
  }
  async verify() {
    this.mode = null;
    const rawInfo = await this.request("v3/account/info", "private:uta");
    if (record(rawInfo).code === "25245") return this.verifyClassic();
    const info = record(bitgetData(rawInfo));
    if (info.permType !== "read-only") throw new ExchangeError("UNSAFE_KEY");
    assertIpWhitelist(info.ips);
    const uid = textField(info.userId);
    if (!/^\d+$/.test(uid)) throw new ExchangeError("INVALID_RESPONSE");
    const rawSettings = await this.request(
      "v3/account/settings",
      "private:uta",
    );
    if (record(rawSettings).code === "25245") return this.verifyClassic(uid);
    const settings = record(bitgetData(rawSettings));
    if (textField(settings.uid) !== uid)
      throw new ExchangeError("INVALID_RESPONSE");
    // Never interpret a failed mode query as Classic; transient failures must preserve old data.
    if (settings.accountMode === "hybrid") this.mode = "classic";
    else if (settings.accountMode === "unified") this.mode = "unified";
    else throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    this.level =
      typeof settings.accountLevel === "string" ? settings.accountLevel : "";
    return { externalAccountId: uid };
  }
  private async verifyClassic(expectedUid?: string) {
    const info = record(
      await this.data("v2/spot/account/info", "private:spot"),
    );
    const read = [
      "coor",
      "cpor",
      "stor",
      "smor",
      "ttor",
      "wtor",
      "taxr",
      "chor",
      "p2pr",
      "pllr",
    ];
    if (
      !Array.isArray(info.authorities) ||
      !info.authorities.length ||
      info.authorities.some((p) => !read.includes(String(p)))
    )
      throw new ExchangeError("UNSAFE_KEY");
    assertIpWhitelist(info.ips);
    const uid = textField(info.userId);
    if (!/^\d+$/.test(uid) || (expectedUid && uid !== expectedUid))
      throw new ExchangeError("INVALID_RESPONSE");
    this.mode = "classic";
    this.level = "";
    return { externalAccountId: uid };
  }
  private balance(
    symbol: string,
    total: string,
    free: string | null,
    locked: string | null,
    debt: string | null,
    price: string | null,
  ) {
    return {
      assetId: `bitget:${symbol}`,
      symbol,
      total,
      free,
      locked,
      debt,
      priceUsd: price,
      usdValue: multiply(total, price),
    };
  }
  private async rates() {
    const rates = new Map(
      await this.prices().catch(() => new Map<string, string>()),
    );
    try {
      for (const r of records(
        await this.data("v2/spot/market/tickers", "public:spot"),
      )) {
        if (typeof r.symbol !== "string" || !r.symbol.endsWith("USDT"))
          continue;
        const price = multiply(positive(r.lastPr), rates.get("USDT") ?? null);
        if (price) rates.set(r.symbol.slice(0, -4), price);
      }
    } catch {
      /* Optional local token valuation cannot invalidate authoritative equity. */
    }
    return rates;
  }
  private async market(product: Product) {
    const old = this.fundingMarkets.get(product),
      now = Date.now();
    if (
      old &&
      now - old.at < 300_000 &&
      ![...old.rows.values()].some((r) => {
        const t = timestamp(r.nextUpdate);
        return t != null && t <= now;
      })
    )
      return old;
    const entry = { at: now, rows: new Map<string, Row>() };
    this.fundingMarkets.set(product, entry);
    try {
      const rows = records(
        await this.data("v3/market/current-fund-rate", "public:uta", {
          category: product,
        }),
      );
      entry.rows = new Map(rows.map((r) => [textField(r.symbol), r]));
    } catch {
      /* Optional estimates never discard the position. */
    }
    return entry;
  }
  private async positions(
    product: Product,
    rates: Map<string, string>,
  ): Promise<OpenPosition[]> {
    const uta = this.mode === "unified";
    const value = await this.data(
      uta ? "v3/position/current-position" : "v2/mix/position/all-position",
      uta ? "private:uta" : "private:mix",
      uta ? { category: product } : { productType: product },
    );
    const rows = records(uta ? record(value).list : value);
    const live = rows.filter((r) => !new D(rd(r.total)).isZero());
    if (product === "COIN-FUTURES" && live.length)
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    const market = live.length ? await this.market(product) : null;
    const positions = live.map((r) => {
      const symbol = textField(r.symbol),
        settle = textField(r.marginCoin),
        side = uta ? r.posSide : r.holdSide;
      if (
        settle !== (product === "USDC-FUTURES" ? "USDC" : "USDT") ||
        !symbol.endsWith(settle) ||
        !["long", "short"].includes(String(side)) ||
        !["isolated", "crossed"].includes(String(r.marginMode)) ||
        new D(rd(r.total)).lt(0) ||
        (uta && r.category !== product)
      )
        throw new ExchangeError("INVALID_RESPONSE");
      const size = rd(r.total),
        entry = positive(uta ? r.avgPrice : r.openPriceAvg),
        mark = positive(r.markPrice);
      const rate = rates.get(settle) ?? null,
        info = market?.rows.get(symbol),
        nextTime = timestamp(info?.nextUpdate);
      // Classic totalFee is FUNDING, not trading fees. Empty means no funding charged yet.
      const fundingAmount = uta
        ? decimal(r.totalFunding)
        : r.totalFee === ""
          ? "0"
          : decimal(r.totalFee);
      const fee = uta
        ? decimal(r.openFeeTotal) != null && decimal(r.closeFeeTotal) != null
          ? new D(rd(r.openFeeTotal))
              .plus(rd(r.closeFeeTotal))
              .negated()
              .toFixed()
          : null
        : decimal(r.deductedFee);
      const gross = decimal(uta ? r.curRealisedPnl : r.achievedProfits);
      const dividend = decimal(r.cashDividend);
      // Cash dividends are quoted in USDT; do not silently sum them into a USDC result.
      const realized =
        gross == null ||
        (dividend != null && !new D(dividend).isZero() && settle !== "USDT")
          ? null
          : new D(gross).plus(dividend ?? "0").toFixed();
      return finishPosition({
        positionKey: `${product}:${symbol}:${side}:${r.marginMode}`,
        symbol,
        base: symbol.slice(0, -settle.length),
        settle,
        side: side as "long" | "short",
        contracts: size,
        contractSize: "1",
        baseSize: size,
        notionalUsd: multiply(multiply(size, mark), rate),
        entryPrice: entry,
        markPrice: mark,
        liquidationPrice: positive(r.liquidationPrice),
        leverage: positive(r.leverage),
        marginMode: r.marginMode === "crossed" ? "cross" : "isolated",
        margin: decimal(uta ? r.positionBalance : r.marginSize),
        unrealizedPnl: decimal(uta ? r.unrealisedPnl : r.unrealizedPL),
        unrealizedPnlUsd: multiply(
          decimal(uta ? r.unrealisedPnl : r.unrealizedPL),
          rate,
        ),
        funding: {
          amount: fundingAmount,
          realizedPnl: realized,
          tradingFees: fee,
          since: timestamp(uta ? r.createdTime : r.cTime),
          updatedAt: Date.now(),
          status: fundingAmount == null ? "unavailable" : "complete",
          nextRate: decimal(info?.fundingRate),
          nextTime: nextTime != null && nextTime > Date.now() ? nextTime : null,
          nextRateUpdatedAt: market?.at,
        },
      });
    });
    if (new Set(positions.map((p) => p.positionKey)).size !== positions.length)
      throw new ExchangeError("INVALID_RESPONSE");
    return positions;
  }
  private async spot(rates: Map<string, string>): Promise<AccountBalance> {
    const balances = records(
      await this.data("v2/spot/account/assets", "private:spot", {
        assetType: "all",
      }),
    )
      .map((r) => {
        const symbol = textField(r.coin).toUpperCase(),
          free = rd(r.available),
          locked = sum([rd(r.frozen), rd(r.locked)]);
        return this.balance(
          symbol,
          new D(free).plus(locked).toFixed(),
          free,
          locked,
          null,
          rates.get(symbol) ?? null,
        );
      })
      .filter((b) => !new D(b.total).isZero());
    const complete = balances.every((b) => b.usdValue != null);
    return {
      accountKey: "spot",
      kind: "spot",
      mode: "classic",
      equityUsd: sum(balances.map((b) => b.usdValue)),
      availableUsd: complete
        ? sum(balances.map((b) => multiply(b.free, b.priceUsd)))
        : null,
      unrealizedPnlUsd: null,
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances,
      positions: [],
    };
  }
  private async classicFutures(
    product: Product,
    rates: Map<string, string>,
  ): Promise<AccountBalance> {
    const wallets = records(
      await this.data("v2/mix/account/accounts", "private:mix", {
        productType: product,
      }),
    );
    const positions = await this.positions(product, rates);
    if (
      product === "COIN-FUTURES" &&
      wallets.some((r) => !new D(rd(r.accountEquity)).isZero())
    )
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    if (
      new Set(wallets.map((r) => textField(r.marginCoin))).size !==
      wallets.length
    )
      throw new ExchangeError("INVALID_RESPONSE");
    const balances = wallets
      .flatMap((r) => {
        if (r.assetMode === "union")
          return records(r.assetList).map((a) => {
            const symbol = textField(a.coin);
            return this.balance(
              symbol,
              rd(a.balance),
              decimal(a.available),
              null,
              null,
              rates.get(symbol) ?? null,
            );
          });
        if (r.assetMode != null && r.assetMode !== "single")
          throw new ExchangeError("UNSUPPORTED_ACCOUNT");
        const symbol = textField(r.marginCoin),
          equity = rd(r.accountEquity);
        // Derive cash only when upstream explicitly supplies PnL; never call equity a spot balance.
        const pnl =
          decimal(r.unrealizedPL) ??
          (decimal(r.crossedUnrealizedPL) != null &&
          decimal(r.isolatedUnrealizedPL) != null
            ? sum([rd(r.crossedUnrealizedPL), rd(r.isolatedUnrealizedPL)])
            : null);
        if (pnl == null) return [];
        return [
          this.balance(
            symbol,
            new D(equity).minus(pnl).toFixed(),
            decimal(r.available),
            decimal(r.locked),
            null,
            rates.get(symbol) ?? null,
          ),
        ];
      })
      .filter((b) => !new D(b.total).isZero());
    if (new Set(balances.map((b) => b.symbol)).size !== balances.length)
      throw new ExchangeError("INVALID_RESPONSE");
    const equityUsd = wallets.length
      ? multiply(
          sum(wallets.map((r) => rd(r.usdtEquity))),
          rates.get("USDT") ?? null,
        )
      : "0";
    const complete =
      equityUsd != null &&
      balances.every((b) => b.usdValue != null) &&
      positions.every(
        (p) => p.unrealizedPnlUsd != null && p.notionalUsd != null,
      );
    return {
      accountKey: `futures:${product.toLowerCase()}`,
      kind: "futures",
      mode: wallets.some((r) => r.assetMode === "union")
        ? "classic-multi-assets"
        : "classic",
      equityUsd,
      availableUsd: null,
      unrealizedPnlUsd: positions.every((p) => p.unrealizedPnlUsd != null)
        ? sum(positions.map((p) => p.unrealizedPnlUsd))
        : null,
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances,
      positions,
    };
  }
  private async unified(rates: Map<string, string>): Promise<AccountBalance> {
    const wallet = record(await this.data("v3/account/assets", "private:uta"));
    const positions: OpenPosition[] = [];
    // All categories must succeed: incomplete exposure must not masquerade as a complete shared pool.
    for (const product of products)
      positions.push(...(await this.positions(product, rates)));
    const balances = records(wallet.assets).map((r) => {
      const symbol = textField(r.coin),
        eq = rd(r.equity),
        usdValue = rd(r.usdValue);
      const price = !new D(eq).isZero()
        ? positive(new D(usdValue).div(eq).toFixed())
        : (rates.get(symbol) ?? null);
      return this.balance(
        symbol,
        rd(r.balance),
        decimal(r.available),
        decimal(r.locked),
        decimal(r.debt),
        price,
      );
    });
    if (new Set(balances.map((b) => b.symbol)).size !== balances.length)
      throw new ExchangeError("INVALID_RESPONSE");
    const complete =
      balances.every((b) => b.usdValue != null) &&
      positions.every(
        (p) => p.unrealizedPnlUsd != null && p.notionalUsd != null,
      );
    return {
      accountKey: "unified",
      kind: "unified",
      mode: `bitget-${this.level || "unified"}`,
      equityUsd: rd(wallet.accountEquity),
      availableUsd: null,
      unrealizedPnlUsd: rd(wallet.unrealisedPnl),
      complete,
      errorCode: complete ? null : "UNPRICED_ASSETS",
      balances,
      positions,
    };
  }
  async fetch(includeSpot: boolean): Promise<SyncResult> {
    if (!this.mode) throw new ExchangeError("INVALID_RESPONSE");
    const rates = await this.rates();
    const result: SyncResult = { accounts: [], failedAccounts: [] };
    const changed = this.mode !== this.committedMode;
    if (this.mode === "unified")
      result.accounts.push(await this.unified(rates));
    else {
      if (includeSpot || changed) {
        try {
          result.accounts.push(await this.spot(rates));
        } catch (e) {
          result.failedAccounts.push({
            accountKey: "spot",
            kind: "spot",
            errorCode: safeError(e),
          });
        }
      }
      for (const product of products) {
        try {
          result.accounts.push(await this.classicFutures(product, rates));
        } catch (e) {
          result.failedAccounts.push({
            accountKey: `futures:${product.toLowerCase()}`,
            kind: "futures",
            errorCode: safeError(e),
          });
        }
      }
    }
    // Mode changes commit atomically; otherwise old Unified + new Classic would double-count capital.
    if (changed && result.failedAccounts.length)
      throw new ExchangeError(result.failedAccounts[0]!.errorCode);
    if (!result.failedAccounts.length) this.committedMode = this.mode;
    return result;
  }
}
