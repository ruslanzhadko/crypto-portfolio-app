import { FundingReader } from "./funding";
import { D, decimal, requiredDecimal as rd, multiply, sum } from "./decimal";
import { record, records } from "./adapters";
import { reserveRequest } from "./transport";
import {
  ExchangeError,
  type ExchangeAdapter,
  type SyncResult,
  type AssetBalance,
  type OpenPosition,
} from "./types";

export class HyperliquidAdapter implements ExchangeAdapter {
  private funding = new FundingReader("hyperliquid", undefined, (body) =>
    this.info({ ...body, user: this.address }),
  );
  constructor(
    private address: string,
    private prices: () => Promise<Map<string, string>>,
    private info: (body: Record<string, unknown>) => Promise<unknown> = async (
      body,
    ) => {
      await reserveRequest("hyperliquid", 2);
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new ExchangeError(
          response.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE",
        );
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
    const mode = await this.info({
      type: "userAbstraction",
      user: this.address,
    });
    if (typeof mode !== "string") throw new ExchangeError("INVALID_RESPONSE");
    const spot = record(
      await this.info({ type: "spotClearinghouseState", user: this.address }),
    );
    const perp = record(
      await this.info({ type: "clearinghouseState", user: this.address }),
    );
    const metaRaw = await this.info({ type: "spotMetaAndAssetCtxs" });
    if (!Array.isArray(metaRaw) || metaRaw.length !== 2)
      throw new ExchangeError("INVALID_RESPONSE");
    const metadata = record(metaRaw[0]),
      contexts = records(metaRaw[1]);
    const rates = await this.prices().catch(() => new Map<string, string>());
    const usdc = rates.get("USDC") ?? null;
    const prices = new Map<number, string | null>([[0, usdc]]);
    for (const [i, pair] of records(metadata.universe).entries()) {
      if (Array.isArray(pair.tokens) && pair.tokens[1] === 0)
        prices.set(
          Number(pair.tokens[0]),
          multiply(decimal(contexts[i]?.markPx ?? contexts[i]?.midPx), usdc),
        );
    }
    const tokens = new Map(
      records(metadata.tokens).map((token) => [Number(token.index), token]),
    );
    const balances: AssetBalance[] = records(spot.balances)
      .map((row) => {
        const token = tokens.get(Number(row.token));
        if (
          !token ||
          typeof token.name !== "string" ||
          typeof token.tokenId !== "string"
        )
          throw new ExchangeError("INVALID_RESPONSE");
        const total = rd(row.total),
          locked = decimal(row.hold),
          price = prices.get(Number(row.token)) ?? null;
        return {
          assetId: `hyperliquid:${token.tokenId}`,
          symbol: token.name,
          total,
          free: locked === null ? null : new D(total).minus(locked).toFixed(),
          locked,
          debt: null,
          priceUsd: price,
          usdValue: multiply(total, price),
        };
      })
      .filter((b) => !new D(b.total).isZero());
    const nativeFunding = new Map<string, string | null>();
    const positions: OpenPosition[] = records(perp.assetPositions).flatMap(
      (item) => {
        const p = record(item.position),
          amount = new D(rd(p.szi));
        if (amount.isZero()) return [];
        if (typeof p.coin !== "string")
          throw new ExchangeError("INVALID_RESPONSE");
        const cumulative =
          p.cumFunding && typeof p.cumFunding === "object"
            ? record(p.cumFunding)
            : {};
        // Optional funding metadata must not fail an otherwise valid balance sync.
        let cumulativeAmount: string | null = null;
        try {
          cumulativeAmount = decimal(cumulative.sinceOpen);
        } catch {
          /* unavailable */
        }
        nativeFunding.set(p.coin, cumulativeAmount);
        const size = amount.abs().toFixed(),
          leverage = record(p.leverage),
          value = decimal(p.positionValue);
        return [
          {
            positionKey: p.coin,
            symbol: `${p.coin}/USDC`,
            base: p.coin,
            settle: "USDC",
            side: amount.isNegative() ? ("short" as const) : ("long" as const),
            contracts: size,
            contractSize: "1",
            baseSize: size,
            notionalUsd: multiply(value, usdc),
            entryPrice: decimal(p.entryPx),
            markPrice:
              value === null ? null : new D(value).div(size).toFixed(18),
            liquidationPrice: decimal(p.liquidationPx),
            leverage: decimal(leverage.value),
            marginMode:
              typeof leverage.type === "string" ? leverage.type : null,
            margin: decimal(p.marginUsed),
            unrealizedPnl: decimal(p.unrealizedPnl),
            unrealizedPnlUsd: multiply(decimal(p.unrealizedPnl), usdc),
          },
        ];
      },
    );
    await this.funding.enrich(positions, nativeFunding);
    const isUnified = mode === "unifiedAccount" || mode === "portfolioMargin";
    if (mode === "portfolioMargin")
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    const perpEquity = multiply(
      rd(record(perp.marginSummary).accountValue),
      usdc,
    );
    const complete =
      balances.every((b) => b.usdValue !== null) && usdc !== null;
    const spotAccount = {
      accountKey: isUnified ? "unified" : "spot",
      kind: isUnified ? ("unified" as const) : ("spot" as const),
      mode,
      equityUsd: sum(balances.map((b) => b.usdValue)),
      availableUsd: null,
      unrealizedPnlUsd:
        isUnified && usdc
          ? sum(positions.map((p) => p.unrealizedPnlUsd))
          : null,
      complete,
      errorCode: complete ? null : ("UNPRICED_ASSETS" as const),
      balances,
      ...(isUnified ? { positions } : {}),
    };
    return {
      accounts: isUnified
        ? [spotAccount]
        : [
            spotAccount,
            {
              accountKey: "futures",
              kind: "futures",
              mode,
              equityUsd: perpEquity,
              availableUsd: multiply(decimal(perp.withdrawable), usdc),
              unrealizedPnlUsd: usdc
                ? sum(positions.map((p) => p.unrealizedPnlUsd))
                : null,
              complete,
              errorCode: complete ? null : "UNPRICED_ASSETS",
              balances: [],
              positions,
            },
          ],
      failedAccounts: [],
    };
  }
}
