import { record, records } from "./adapters";
import { D, decimal, requiredDecimal as rd, multiply, sum } from "./decimal";
import { reserveRequest } from "./rate-budget";
import { parse } from "lossless-json";
import {
  ExchangeError,
  type ExchangeAdapter,
  type SyncResult,
  type OpenPosition,
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

/** Public address-based RPC. Never signs requests or asks for a wallet private key. */
export class AsterAdapter implements ExchangeAdapter {
  private marketAt = 0;
  private market = new Map<
    string,
    { rate: string | null; time: number | null }
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
    const balances = records(result.perpAssets)
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
    const positions: OpenPosition[] = records(result.positions).flatMap(
      (group) => {
        if (group.tradingProduct !== "perps")
          throw new ExchangeError("UNSUPPORTED_ACCOUNT");
        return records(group.positions).flatMap((p) => {
          const amount = new D(rd(p.positionAmount));
          if (amount.isZero()) return [];
          if (
            typeof p.id !== "string" ||
            typeof p.symbol !== "string" ||
            typeof p.collateral !== "string" ||
            !p.symbol.endsWith(p.collateral) ||
            !["BOTH", "LONG", "SHORT"].includes(String(p.positionSide)) ||
            typeof p.isolated !== "boolean"
          )
            throw new ExchangeError("INVALID_RESPONSE");
          const size = amount.abs().toFixed(),
            rate = rates.get(p.collateral) ?? null;
          return [
            {
              positionKey: p.id,
              symbol: p.symbol,
              base: p.symbol.slice(0, -p.collateral.length),
              settle: p.collateral,
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
              marginMode: p.isolated ? "isolated" : "cross",
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
        });
      },
    );
    if (new Set(positions.map((p) => p.positionKey)).size !== positions.length)
      throw new ExchangeError("INVALID_RESPONSE");
    if (positions.length && Date.now() - this.marketAt >= 300_000) {
      this.marketAt = Date.now();
      this.market.clear();
      try {
        for (const row of records(await this.premium())) {
          if (typeof row.symbol !== "string") continue;
          const time = Number(row.nextFundingTime);
          this.market.set(row.symbol, {
            rate: decimal(row.lastFundingRate),
            time: Number.isSafeInteger(time) && time > Date.now() ? time : null,
          });
        }
      } catch {
        /* Optional market data must not erase positions. */
      }
    }
    for (const p of positions) {
      const m = this.market.get(p.symbol);
      p.funding = {
        ...p.funding!,
        nextRate: m?.rate ?? null,
        nextTime: m?.time ?? null,
        nextRateUpdatedAt: this.marketAt,
      };
    }
    const complete =
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
          errorCode: complete ? null : "UNPRICED_ASSETS",
          balances,
          positions,
        },
      ],
      failedAccounts: [
        { accountKey: "spot", kind: "spot", errorCode: "SPOT_UNAVAILABLE" },
      ],
      externalAccountId: this.address.toLowerCase(),
    };
  }
}
