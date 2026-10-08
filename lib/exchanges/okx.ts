import { records } from "./adapters";
import { D, decimal, multiply, requiredDecimal as rd, sum } from "./decimal";
import {
  assertOkxReadOnly,
  finishPosition,
  nativeFunding,
  okxRows,
  one,
  positive,
  textField,
  timestamp,
  usd,
  type Row,
} from "./provider-utils";
import {
  ExchangeError,
  type ExchangeAdapter,
  type OpenPosition,
  type SyncResult,
} from "./types";
import type { Request } from "./transport";

/** Global OKX trading account: spot holdings and linear perpetuals; one equity pool. */
export class OkxAdapter implements ExchangeAdapter {
  private mode = "";
  private instruments = new Map<string, Row>();
  private instrumentsAt = 0;
  private fundingMarkets = new Map<
    string,
    { at: number; rate: string | null; time: number | null }
  >();
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    public close = async () => {},
  ) {}
  async verify() {
    const r = one(okxRows(await this.request("account/config", "private")));
    assertOkxReadOnly(r);
    if (!["1", "2", "3"].includes(String(r.acctLv)))
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    this.mode = String(r.acctLv);
    return { externalAccountId: textField(r.uid) };
  }
  private async nextFunding(p: OpenPosition) {
    const now = Date.now(),
      old = this.fundingMarkets.get(p.symbol);
    if (
      !old ||
      now - old.at >= 300_000 ||
      (old.time != null && old.time <= now)
    ) {
      const entry = {
        at: now,
        rate: null as string | null,
        time: null as number | null,
      };
      this.fundingMarkets.set(p.symbol, entry);
      try {
        const row = one(
          okxRows(
            await this.request("public/funding-rate", "public", {
              instId: p.symbol,
            }),
          ),
        );
        const time = timestamp(row.fundingTime);
        if (time != null && time > now) {
          entry.time = time;
          entry.rate = decimal(row.fundingRate);
        }
      } catch {
        /* Optional market estimate never invalidates balances. */
      }
    }
    const data = this.fundingMarkets.get(p.symbol)!;
    p.funding = {
      ...p.funding!,
      nextRate: data.rate,
      nextTime: data.time,
      nextRateUpdatedAt: data.at,
    };
  }
  async fetch(): Promise<SyncResult> {
    if (!this.mode) throw new ExchangeError("INVALID_RESPONSE");
    if (Date.now() - this.instrumentsAt > 3_600_000) {
      const rows = okxRows(
        await this.request("public/instruments", "public", {
          instType: "SWAP",
        }),
      );
      this.instruments = new Map(rows.map((r) => [textField(r.instId), r]));
      this.instrumentsAt = Date.now();
    }
    const wallet = one(
      okxRows(await this.request("account/balance", "private")),
    );
    // Fetch ALL positions so unsupported exposure in the same equity pool cannot be silently omitted.
    const rows = okxRows(await this.request("account/positions", "private"));
    const rates = await this.prices().catch(() => new Map<string, string>());
    const details = records(wallet.details);
    const balances = details
      .map((r) => {
        const symbol = textField(r.ccy),
          equity = decimal(r.eq),
          equityUsd = decimal(r.eqUsd);
        const price =
          positive(r.coinUsdPrice) ??
          (equity != null && !new D(equity).isZero() && equityUsd != null
            ? positive(new D(equityUsd).div(equity).toFixed())
            : (rates.get(symbol) ?? null));
        // Holdings are informational; account equity comes only from totalEq.
        const total = rd(r.cashBal);
        return {
          assetId: `okx:${symbol}`,
          symbol,
          total,
          free: decimal(r.availBal),
          locked: decimal(r.frozenBal),
          debt: decimal(r.liab),
          priceUsd: price,
          usdValue: multiply(total, price),
        };
      })
      .filter(
        (b) =>
          !new D(b.total).isZero() ||
          (b.debt != null && !new D(b.debt).isZero()),
      );
    const positions: OpenPosition[] = [];
    for (const row of rows) {
      const size = new D(rd(row.pos));
      if (size.isZero()) continue;
      const symbol = textField(row.instId),
        market = this.instruments.get(symbol);
      if (
        row.instType !== "SWAP" ||
        !market ||
        market.ctType !== "linear" ||
        !["USDT", "USDC"].includes(String(market.settleCcy))
      )
        throw new ExchangeError("UNSUPPORTED_ACCOUNT");
      const base = textField(market.ctValCcy),
        settle = textField(market.settleCcy);
      if (
        base === settle ||
        !["net", "long", "short"].includes(String(row.posSide)) ||
        !["cross", "isolated"].includes(String(row.mgnMode))
      )
        throw new ExchangeError("INVALID_RESPONSE");
      const contractSize = positive(market.ctVal);
      if (!contractSize) throw new ExchangeError("INVALID_RESPONSE");
      const side =
        row.posSide === "short" || (row.posSide === "net" && size.isNegative())
          ? "short"
          : "long";
      const rate = rates.get(settle) ?? null,
        baseSize = size.abs().mul(contractSize).toFixed();
      // Native fields are current-position cumulative. Unknown/extra settlement components prevent a false total.
      const extras = [decimal(row.liqPenalty), decimal(row.settledPnl)];
      const pnl = decimal(row.pnl);
      const gross = extras.some((v) => v != null && !new D(v).isZero())
        ? null
        : pnl;
      const p = finishPosition({
        positionKey: `${symbol}:${row.posSide}:${row.mgnMode}:${textField(row.posId)}`,
        symbol,
        base,
        settle,
        side,
        contracts: size.abs().toFixed(),
        contractSize,
        baseSize,
        notionalUsd: usd(multiply(baseSize, positive(row.markPx)), rate),
        entryPrice: positive(row.avgPx),
        markPrice: positive(row.markPx),
        liquidationPrice: positive(row.liqPx),
        leverage: positive(row.lever),
        marginMode: String(row.mgnMode),
        margin: decimal(row.imr) ?? decimal(row.margin),
        unrealizedPnl: decimal(row.upl),
        unrealizedPnlUsd: usd(row.upl, rate),
        funding: nativeFunding(
          row.fundingFee,
          gross,
          row.fee,
          timestamp(row.cTime),
        ),
      });
      await this.nextFunding(p);
      positions.push(p);
    }
    const equity = rd(wallet.totalEq);
    const missingPositionPrice = positions.some(
      (p) => p.unrealizedPnlUsd == null || p.notionalUsd == null,
    );
    const incomplete =
      balances.some((b) => b.usdValue == null) || missingPositionPrice;
    return {
      accounts: [
        {
          accountKey: "trading",
          kind: "unified",
          mode: `okx-${this.mode}`,
          equityUsd: equity,
          availableUsd: null,
          unrealizedPnlUsd: missingPositionPrice
            ? null
            : sum(positions.map((p) => p.unrealizedPnlUsd)),
          complete: !incomplete,
          errorCode: incomplete ? "UNPRICED_ASSETS" : null,
          balances,
          positions,
        },
      ],
      failedAccounts: [],
    };
  }
}
