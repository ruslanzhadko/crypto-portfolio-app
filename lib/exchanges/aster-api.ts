import { aster } from "ccxt";
import { isIP } from "node:net";
import { record, records } from "./adapters";
import { D, decimal, requiredDecimal as rd, multiply, sum } from "./decimal";
import { positive, textField, timestamp } from "./provider-utils";
import { reserveRequest } from "./rate-budget";
import { CycleHistoryReader } from "./cycle-history";
import {
  ExchangeError,
  type Credentials,
  type ExchangeAdapter,
  type OpenPosition,
  type SyncResult,
} from "./types";
import type { Request } from "./transport";

const PRIVATE_PATHS = new Set([
  "v3/agent",
  "v3/account",
  "v3/positionRisk",
  "v3/userTrades",
  "v3/income",
]);
/** Agent responses can encode the saved IP list as text or an array. */
export function assertAsterIpWhitelist(value: unknown) {
  let list: unknown = value;
  if (typeof list === "string") {
    const text = list.trim();
    if (text.startsWith("[")) {
      try {
        list = JSON.parse(text);
      } catch {
        throw new ExchangeError("IP_RESTRICTED");
      }
    } else list = text.split(/[\s,;]+/);
  }
  if (
    !Array.isArray(list) ||
    !list.length ||
    list.some((ip) => {
      if (typeof ip !== "string") return true;
      const [address, prefix, extra] = ip.trim().split("/");
      const version = isIP(address ?? "");
      return (
        !version ||
        address === "0.0.0.0" ||
        address === "::" ||
        extra !== undefined ||
        (prefix !== undefined &&
          (!/^\d+$/.test(prefix) ||
            Number(prefix) < 1 ||
            Number(prefix) > (version === 4 ? 32 : 128)))
      );
    })
  )
    throw new ExchangeError("IP_RESTRICTED");
}
/** Only a separate Aster API Wallet is accepted; the main wallet's key is never needed. */
export function createAsterTransport(user: string, credentials: Credentials) {
  if (
    !/^0x[0-9a-f]{40}$/i.test(credentials.apiKey) ||
    !/^(0x)?[0-9a-f]{64}$/i.test(credentials.secret) ||
    credentials.apiKey.toLowerCase() === user.toLowerCase()
  )
    throw new ExchangeError("INVALID_KEY");
  const client = new aster({
    privateKey: credentials.secret.replace(/^0x/, ""),
    timeout: 15_000,
    enableRateLimit: true,
    options: { signerAddress: credentials.apiKey },
  });
  if (
    client.ethGetAddressFromPrivateKey(client.privateKey).toLowerCase() !==
    credentials.apiKey.toLowerCase()
  )
    throw new ExchangeError("INVALID_KEY");
  client.verbose = false;
  const request: Request = async (path, api, params = {}, weight = 1) => {
    if (
      !(api === "fapiPrivate" && PRIVATE_PATHS.has(path)) &&
      !(api === "fapiPublic" && path === "v3/premiumIndex")
    )
      throw new ExchangeError("INVALID_RESPONSE");
    await reserveRequest("aster", weight);
    try {
      return await client.request(
        path,
        api,
        "GET",
        api === "fapiPrivate"
          ? { ...params, user, signer: credentials.apiKey }
          : params,
      );
    } catch (error) {
      // Never forward CCXT errors containing signed query strings or credentials.
      const name = error instanceof Error ? error.name : "";
      throw new ExchangeError(
        /RateLimit|DDoS/.test(name)
          ? "RATE_LIMIT"
          : /Authentication|Permission/.test(name)
            ? "INVALID_KEY"
            : "UNAVAILABLE",
      );
    }
  };
  return {
    request,
    close: async () => {
      await client.close();
    },
  };
}

export class AsterApiAdapter implements ExchangeAdapter {
  private verified = false;
  private history = new CycleHistoryReader("aster", (...args) =>
    this.request(...args),
  );
  constructor(
    private user: string,
    private signer: string,
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}
  async verify() {
    this.verified = false;
    const agents = records(await this.request("v3/agent", "fapiPrivate"));
    const agent = agents.find(
      (r) =>
        typeof r.agentAddress === "string" &&
        r.agentAddress.toLowerCase() === this.signer.toLowerCase(),
    );
    if (
      !agent ||
      agent.canRead !== true ||
      !Number.isSafeInteger(Number(agent.expired)) ||
      Number(agent.expired) <= Date.now()
    )
      throw new ExchangeError("INVALID_KEY");
    if (
      ["canSpotTrade", "canPerpTrade", "canWithdraw"].some(
        (k) => agent[k] !== false,
      )
    )
      throw new ExchangeError("UNSAFE_KEY");
    assertAsterIpWhitelist(agent.ipWhitelist);
    this.verified = true;
    return { externalAccountId: this.user.toLowerCase() };
  }
  async fetch(): Promise<SyncResult> {
    if (!this.verified) throw new ExchangeError("INVALID_KEY");
    const rates = await this.prices().catch(() => new Map<string, string>());
    const wallet = record(
      await this.request("v3/account", "fapiPrivate", {}, 5),
    );
    const rows = records(
      await this.request("v3/positionRisk", "fapiPrivate", {}, 5),
    );
    const configs = new Map(
      records(wallet.positions).map((r) => [
        `${r.symbol}:${r.positionSide}`,
        r,
      ]),
    );
    const market = new Map<string, Record<string, unknown>>();
    try {
      for (const r of records(
        await this.request("v3/premiumIndex", "fapiPublic"),
      ))
        if (typeof r.symbol === "string") market.set(r.symbol, r);
    } catch {
      /* Optional estimates never erase positions. */
    }
    const positions: OpenPosition[] = rows.flatMap((r) => {
      const amount = new D(rd(r.positionAmt));
      if (amount.isZero()) return [];
      const symbol = textField(r.symbol),
        settle = symbol.match(/(USDT|USDC|USD1)$/)?.[1];
      if (
        !settle ||
        !["BOTH", "LONG", "SHORT"].includes(String(r.positionSide))
      )
        throw new ExchangeError("UNSUPPORTED_ACCOUNT");
      const key = `${symbol}:${r.positionSide}`,
        config = configs.get(key),
        quote = market.get(symbol);
      const size = amount.abs().toFixed(),
        mark = positive(r.markPrice),
        rate = rates.get(settle) ?? null;
      return [
        {
          positionKey: key,
          symbol,
          base: symbol.slice(0, -settle.length),
          settle,
          side:
            r.positionSide === "SHORT" || amount.isNegative()
              ? "short"
              : "long",
          contracts: size,
          baseSize: size,
          contractSize: "1",
          notionalUsd: multiply(multiply(size, mark), rate),
          entryPrice: positive(r.entryPrice),
          markPrice: mark,
          liquidationPrice: positive(r.liquidationPrice),
          leverage: positive(r.leverage ?? config?.leverage),
          marginMode:
            r.marginType === "isolated"
              ? "isolated"
              : r.marginType === "cross"
                ? "cross"
                : null,
          margin: decimal(
            config?.positionInitialMargin ?? config?.initialMargin,
          ),
          unrealizedPnl: decimal(r.unRealizedProfit),
          unrealizedPnlUsd: multiply(decimal(r.unRealizedProfit), rate),
          funding: {
            amount: null,
            realizedPnl: null,
            tradingFees: null,
            since: null,
            updatedAt: Date.now(),
            status: "pending",
            nextRate: decimal(quote?.lastFundingRate),
            nextTime: timestamp(quote?.nextFundingTime),
            nextRateUpdatedAt: Date.now(),
          },
        },
      ];
    });
    if (new Set(positions.map((p) => p.positionKey)).size !== positions.length)
      throw new ExchangeError("INVALID_RESPONSE");
    await this.history.enrich(positions);
    const assets = records(wallet.assets);
    const balances = assets
      .map((r) => {
        const symbol = textField(r.asset),
          total = rd(r.walletBalance),
          price = rates.get(symbol) ?? null;
        return {
          assetId: `aster:${symbol}`,
          symbol,
          total,
          free: decimal(r.availableBalance),
          locked: null,
          debt: null,
          priceUsd: price,
          usdValue: multiply(total, price),
        };
      })
      .filter((b) => !new D(b.total).isZero());
    const relevant = assets.filter((r) => !new D(rd(r.marginBalance)).isZero());
    const complete =
      relevant.every((r) => rates.has(textField(r.asset))) &&
      positions.every((p) => p.unrealizedPnlUsd !== null);
    return {
      accounts: [
        {
          accountKey: "futures",
          kind: "futures",
          mode: "api-wallet",
          equityUsd: complete
            ? sum(
                assets.map((r) =>
                  multiply(
                    rd(r.marginBalance),
                    rates.get(textField(r.asset)) ?? null,
                  ),
                ),
              )
            : null,
          availableUsd: complete
            ? sum(
                assets.map((r) =>
                  multiply(
                    rd(r.availableBalance),
                    rates.get(textField(r.asset)) ?? null,
                  ),
                ),
              )
            : null,
          unrealizedPnlUsd: complete
            ? sum(
                assets.map((r) =>
                  multiply(
                    rd(r.unrealizedProfit),
                    rates.get(textField(r.asset)) ?? null,
                  ),
                ),
              )
            : null,
          complete,
          errorCode: complete ? null : "UNPRICED_ASSETS",
          balances,
          positions,
        },
      ],
      failedAccounts: [],
      externalAccountId: this.user.toLowerCase(),
    };
  }
}
