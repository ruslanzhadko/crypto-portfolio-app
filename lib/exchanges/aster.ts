import { record, records } from "./adapters";
import { D, decimal, requiredDecimal as rd, multiply, sum } from "./decimal";
import { reserveRequest } from "./rate-budget";
import { parse } from "lossless-json";
import {
  ExchangeError,
  type ExchangeAdapter,
  type SyncResult,
  type OpenPosition,
  type AssetBalance,
} from "./types";

export async function readAsterBalance(address: string): Promise<unknown> {
  await reserveRequest("aster");
  const response = await fetch("https://tapi.asterdex.com/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "aster_getBalance",
      params: [address, "latest"],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new ExchangeError(
      response.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE",
    );
  return parse(await response.text(), undefined, (value) => value);
}

/**
 * Live RPC omits `positions` when a readable account has none (observed
 * October 2026; the docs do not mark it optional). Accept that only when the
 * account data itself arrived, so a truncated response is still rejected.
 */
export function asterPositionGroups(
  result: Record<string, unknown>,
): Record<string, unknown>[] {
  if (result.positions === undefined && Array.isArray(result.perpAssets))
    return [];
  return records(result.positions);
}

/** Public address-based RPC. Never signs requests or asks for a wallet private key. */
export class AsterAdapter implements ExchangeAdapter {
  private marketAt = 0;
  private market = new Map<
    string,
    { rate: string | null; time: number | null; mark: string | null }
  >();
  constructor(
    private address: string,
    private prices: () => Promise<Map<string, string>>,
    private balance: (address: string) => Promise<unknown> = readAsterBalance,
    private premium: () => Promise<unknown> = async () => {
      await reserveRequest("aster");
      const response = await fetch(
        "https://fapi.asterdex.com/fapi/v3/premiumIndex",
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) throw new ExchangeError("UNAVAILABLE");
      return response.json();
    },
  ) {}
  async close() {}
  async verify() {
    if (!/^0x[0-9a-f]{40}$/i.test(this.address))
      throw new ExchangeError("INVALID_RESPONSE");
    return { externalAccountId: this.address.toLowerCase() };
  }
  async fetch(): Promise<SyncResult> {
    await this.verify();
    const envelope = record(await this.balance(this.address));
    if (envelope.error) throw new ExchangeError("UNAVAILABLE");
    const result = record(envelope.result);
    if (result.accountPrivacy === "enabled")
      throw new ExchangeError("PRIVATE_ACCOUNT");
    if (
      result.accountPrivacy !== "disabled" ||
      typeof result.address !== "string" ||
      result.address.toLowerCase() !== this.address.toLowerCase()
    )
      throw new ExchangeError("INVALID_RESPONSE");
    const rates = await this.prices().catch(() => new Map<string, string>());
    const balances: AssetBalance[] = records(result.perpAssets)
      .map((b) => {
        if (typeof b.asset !== "string")
          throw new ExchangeError("INVALID_RESPONSE");
        const total = rd(b.walletBalance),
          price = rates.get(b.asset) ?? null;
        return {
          assetId: `aster:${b.asset}`,
          symbol: b.asset,
          total,
          free: null,
          locked: null,
          debt: null,
          priceUsd: price,
          usdValue: multiply(total, price),
        };
      })
      .filter((b) => !new D(b.total).isZero());
    let unsupported = false;
    const perpGroups: Record<string, unknown>[] = [],
      shieldGroups: Record<string, unknown>[] = [];
    for (const group of asterPositionGroups(result)) {
      if (group.tradingProduct === "perps") perpGroups.push(group);
      else if (group.tradingProduct === "shieldmode") shieldGroups.push(group);
      // A new product must not stop the rest of the account from syncing.
      else unsupported = true;
    }
    const positions: OpenPosition[] = perpGroups.flatMap((group) =>
      records(group.positions).flatMap((p) => {
        const amount = new D(rd(p.positionAmount));
        if (amount.isZero()) return [];
        if (
          typeof p.id !== "string" ||
          typeof p.symbol !== "string" ||
          !["BOTH", "LONG", "SHORT"].includes(String(p.positionSide))
        )
          throw new ExchangeError("INVALID_RESPONSE");
        // Live RPC responses may omit the optional fields shown in the docs.
        // Use the pair's supported quote only when collateral was not supplied;
        // never manufacture leverage, margin mode, entry or liquidation prices.
        const quote = p.symbol.match(/(USDT|USDC|USD1)$/)?.[1];
        const collateral = p.collateral === undefined ? quote : p.collateral;
        if (
          typeof collateral !== "string" ||
          !collateral ||
          !quote ||
          p.symbol.length <= quote.length
        )
          throw new ExchangeError("INVALID_RESPONSE");
        const size = amount.abs().toFixed(),
          rate = rates.get(collateral) ?? null;
        return [
          {
            positionKey: p.id,
            symbol: p.symbol,
            base: p.symbol.slice(0, -quote.length),
            settle: collateral,
            side:
              p.positionSide === "SHORT" ||
              (p.positionSide === "BOTH" && amount.isNegative())
                ? "short"
                : "long",
            contracts: size,
            contractSize: "1",
            baseSize: size,
            notionalUsd: multiply(decimal(p.notionalValue), rate),
            entryPrice: decimal(p.entryPrice),
            markPrice: decimal(p.markPrice),
            // The public RPC does not expose liquidation, fees or paid funding.
            liquidationPrice: null,
            leverage: decimal(p.leverage),
            marginMode:
              typeof p.isolated === "boolean"
                ? p.isolated
                  ? "isolated"
                  : "cross"
                : null,
            margin: decimal(p.marginValue),
            unrealizedPnl: decimal(p.unrealizedProfit),
            unrealizedPnlUsd: multiply(decimal(p.unrealizedProfit), rate),
            funding: {
              amount: null,
              realizedPnl: null,
              tradingFees: null,
              since: null,
              updatedAt: Date.now(),
              status: "unavailable",
            },
          },
        ];
      }),
    );
    // Shield Mode positions have their own fields and no mark price, so the
    // public premium index supplies it; keep it fresh while they are open.
    const shieldRows = shieldGroups.flatMap((group) =>
      records(group.positions).filter((p) => !new D(rd(p.qty)).isZero()),
    );
    const marketTtl = shieldRows.length ? 20_000 : 300_000;
    if (
      (positions.length || shieldRows.length) &&
      Date.now() - this.marketAt >= marketTtl
    ) {
      this.marketAt = Date.now();
      this.market.clear();
      try {
        for (const row of records(await this.premium())) {
          if (typeof row.symbol !== "string") continue;
          const time = Number(row.nextFundingTime);
          this.market.set(row.symbol, {
            rate: decimal(row.lastFundingRate),
            time: Number.isSafeInteger(time) && time > Date.now() ? time : null,
            mark: decimal(row.markPrice),
          });
        }
      } catch {
        /* Optional market data must not erase positions. */
      }
    }
    // Opening a Shield position moves its margin out of the wallet balance
    // (observed: the balance fell by exactly the margin), so the margin is
    // listed as locked collateral and equity = balances + unrealized PnL holds.
    const shieldMargin = new Map<string, InstanceType<typeof D>>();
    let shieldMarginKnown = true;
    for (const p of shieldRows) {
      const id =
        typeof p.positionId === "string" ||
        (typeof p.positionId === "number" && Number.isSafeInteger(p.positionId))
          ? String(p.positionId)
          : null;
      if (!id || typeof p.symbol !== "string" || typeof p.isLong !== "boolean")
        throw new ExchangeError("INVALID_RESPONSE");
      const quote = p.symbol.match(/(USDT|USDC|USD1)$/)?.[1];
      const settle =
        typeof p.marginAsset === "string" && p.marginAsset
          ? p.marginAsset
          : quote;
      if (!quote || !settle || p.symbol.length <= quote.length)
        throw new ExchangeError("INVALID_RESPONSE");
      const size = new D(rd(p.qty)).abs().toFixed(),
        rate = rates.get(settle) ?? null,
        mark = this.market.get(p.symbol)?.mark ?? null,
        margin = decimal(p.margin),
        pnl = decimal(p.pnl2usdt);
      if (margin === null) shieldMarginKnown = false;
      else
        shieldMargin.set(
          settle,
          (shieldMargin.get(settle) ?? new D(0)).plus(margin),
        );
      positions.push({
        positionKey: `shield:${id}`,
        symbol: p.symbol,
        base: p.symbol.slice(0, -quote.length),
        settle,
        side: p.isLong ? "long" : "short",
        contracts: size,
        contractSize: "1",
        baseSize: size,
        notionalUsd: multiply(multiply(size, mark), rate),
        entryPrice: decimal(p.entryPrice),
        markPrice: mark,
        liquidationPrice: decimal(p.liqPrice),
        leverage: decimal(p.leverage),
        marginMode: "isolated",
        margin,
        // `pnl2usdt` is already in USDT; any other settle asset stays unpriced.
        unrealizedPnl: pnl,
        unrealizedPnlUsd: settle === "USDT" ? multiply(pnl, rate) : null,
        // `cumFundingFee` has no documented sign; never guess a direction.
        funding: {
          amount: null,
          realizedPnl: null,
          tradingFees: null,
          since: Number(p.createTime) || null,
          updatedAt: Date.now(),
          status: "unavailable",
          shield: {
            takeProfit: decimal(p.tp),
            stopLoss: decimal(p.sl),
            feeMode: typeof p.feeMode === "string" ? p.feeMode : null,
            openedAt: Number(p.createTime) || null,
          },
        },
      });
    }
    if (new Set(positions.map((p) => p.positionKey)).size !== positions.length)
      throw new ExchangeError("INVALID_RESPONSE");
    for (const p of positions) {
      const m = this.market.get(p.symbol);
      p.funding = {
        ...p.funding!,
        nextRate: m?.rate ?? null,
        nextTime: m?.time ?? null,
        nextRateUpdatedAt: this.marketAt,
      };
    }
    for (const [asset, amount] of shieldMargin) {
      const price = rates.get(asset) ?? null,
        total = amount.toFixed();
      balances.push({
        assetId: `aster:shield:${asset}`,
        symbol: asset,
        total,
        free: null,
        locked: total,
        debt: null,
        priceUsd: price,
        usdValue: multiply(total, price),
      });
    }
    const complete =
      !unsupported &&
      shieldMarginKnown &&
      balances.every((b) => b.usdValue !== null) &&
      positions.every((p) => p.unrealizedPnlUsd !== null);
    const unrealized = complete
      ? sum(positions.map((p) => p.unrealizedPnlUsd))
      : null;
    return {
      accounts: [
        {
          accountKey: "futures",
          kind: "futures",
          mode: "public-wallet",
          equityUsd: complete
            ? sum([...balances.map((b) => b.usdValue), unrealized])
            : null,
          availableUsd: null,
          unrealizedPnlUsd: unrealized,
          complete,
          errorCode: unsupported
            ? "UNSUPPORTED_ACCOUNT"
            : complete
              ? null
              : "UNPRICED_ASSETS",
          balances,
          positions,
        },
      ],
      // Spot is outside this public-wallet connection's scope, not a failed source.
      failedAccounts: [],
      externalAccountId: this.address.toLowerCase(),
    };
  }
}
