import { record, records } from "./adapters";
import { D, decimal, multiply, requiredDecimal as rd, sum } from "./decimal";
import {
  assertGateReadOnly,
  assertIpWhitelist,
  finishPosition,
  nativeFunding,
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

/** Gate classic spot + USDT perpetuals. Separate wallets must not be merged with Unified equity. */
export class GateAdapter implements ExchangeAdapter {
  private verified = false;
  private contracts = new Map<string, Row>();
  private contractsAt = 0;
  constructor(
    private request: Request,
    private prices: () => Promise<Map<string, string>>,
    private apiKey: string,
    public close = async () => {},
  ) {}
  async verify() {
    const detail = record(await this.request("detail", "private:account"));
    assertIpWhitelist(detail.ip_whitelist);
    assertGateReadOnly(
      await this.request("main_keys", "private:account"),
      this.apiKey,
    );
    const mode = record(await this.request("unified_mode", "private:unified"));
    if (mode.mode !== "classic") throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    if (
      typeof detail.user_id !== "number" &&
      typeof detail.user_id !== "string"
    )
      throw new ExchangeError("INVALID_RESPONSE");
    this.verified = true;
    return { externalAccountId: String(detail.user_id) };
  }
  private async spot(rates: Map<string, string>): Promise<AccountBalance> {
    const rows = records(await this.request("accounts", "private:spot"));
    const tickers = records(await this.request("tickers", "public:spot"));
    const prices = new Map(rates);
    const usdt = rates.get("USDT");
    if (usdt)
      for (const t of tickers) {
        if (
          typeof t.currency_pair === "string" &&
          t.currency_pair.endsWith("_USDT")
        ) {
          const price = multiply(positive(t.last), usdt);
          if (price) prices.set(t.currency_pair.slice(0, -5), price);
        }
      }
    const balances = rows
      .map((r) => {
        const symbol = textField(r.currency),
          free = rd(r.available),
          locked = rd(r.locked);
        const total = new D(free).plus(locked).toFixed(),
          price = prices.get(symbol) ?? null;
        return {
          assetId: `gate:${symbol}`,
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
    const complete = balances.every((b) => b.usdValue != null);
    return {
      accountKey: "spot",
      kind: "spot",
      mode: "classic",
      equityUsd: sum(
        balances.filter((b) => b.usdValue != null).map((b) => b.usdValue),
      ),
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
  private async futures(rates: Map<string, string>): Promise<AccountBalance> {
    const now = Date.now();
    if (!this.contracts.size || now - this.contractsAt >= 300_000) {
      this.contracts = new Map(
        records(await this.request("usdt/contracts", "public:futures")).map(
          (r) => [textField(r.name), r],
        ),
      );
      this.contractsAt = now;
    }
    const wallet = record(
      await this.request("usdt/accounts", "private:futures"),
    );
    if (
      wallet.currency !== "USDT" ||
      wallet.enable_credit === true ||
      wallet.enable_dual_plus === true
    )
      throw new ExchangeError("UNSUPPORTED_ACCOUNT");
    // Page until exhausted; abort rather than truncate when upstream pagination repeats.
    const rows: Row[] = [],
      seen = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      if (offset >= 10000) throw new ExchangeError("INVALID_RESPONSE");
      const batch = records(
        await this.request("usdt/positions", "private:futures", {
          holding: true,
          limit: 100,
          offset,
        }),
      );
      for (const row of batch) {
        const key = `${textField(row.contract)}:${textField(row.mode)}`;
        if (seen.has(key)) throw new ExchangeError("INVALID_RESPONSE");
        seen.add(key);
        rows.push(row);
      }
      if (batch.length < 100) break;
    }
    const rate = rates.get("USDT") ?? null;
    const positions: OpenPosition[] = rows
      .filter((r) => !new D(rd(r.size)).isZero())
      .map((row) => {
        const symbol = textField(row.contract),
          market = this.contracts.get(symbol);
        if (!market || market.type !== "direct" || !symbol.endsWith("_USDT"))
          throw new ExchangeError("UNSUPPORTED_ACCOUNT");
        if (!["single", "dual_long", "dual_short"].includes(String(row.mode)))
          throw new ExchangeError("UNSUPPORTED_ACCOUNT");
        const size = new D(rd(row.size)),
          contractSize = positive(market.quanto_multiplier);
        if (!contractSize) throw new ExchangeError("INVALID_RESPONSE");
        const baseSize = size.abs().mul(contractSize).toFixed(),
          cross =
            row.pos_margin_mode === "cross" ||
            (row.pos_margin_mode !== "isolated" &&
              new D(rd(row.leverage)).isZero());
        const side =
          row.mode === "dual_short" ||
          (row.mode === "single" && size.isNegative())
            ? "short"
            : "long";
        const funding = nativeFunding(
          row.pnl_fund,
          row.pnl_pnl,
          row.pnl_fee,
          timestamp(row.open_time, 1000),
        );
        // Native POINT fee payments cannot be valued in USDT from these fields.
        if (
          decimal(row.realised_point) != null &&
          !new D(rd(row.realised_point)).isZero()
        )
          funding.tradingFees = null;
        const next = timestamp(market.funding_next_apply, 1000);
        funding.nextTime = next != null && next > now ? next : null;
        funding.nextRate = funding.nextTime
          ? decimal(market.funding_rate)
          : null;
        funding.nextRateUpdatedAt = this.contractsAt;
        return finishPosition({
          positionKey: `${symbol}:${row.mode}`,
          symbol,
          base: symbol.slice(0, -5),
          settle: "USDT",
          side,
          contracts: size.abs().toFixed(),
          contractSize,
          baseSize,
          notionalUsd: multiply(
            multiply(baseSize, positive(row.mark_price)),
            rate,
          ),
          entryPrice: positive(row.entry_price),
          markPrice: positive(row.mark_price),
          liquidationPrice: positive(row.liq_price),
          leverage:
            positive(row.lever) ??
            positive(cross ? row.cross_leverage_limit : row.leverage),
          marginMode: cross ? "cross" : "isolated",
          margin: decimal(row.initial_margin) ?? decimal(row.margin),
          unrealizedPnl: decimal(row.unrealised_pnl),
          unrealizedPnlUsd: multiply(decimal(row.unrealised_pnl), rate),
          funding,
        });
      });
    const total = rd(wallet.total),
      pnl = rd(wallet.unrealised_pnl),
      available = rd(wallet.available);
    return {
      accountKey: "futures:usdt",
      kind: "futures",
      mode: "classic",
      equityUsd: multiply(new D(total).plus(pnl).toFixed(), rate),
      availableUsd: multiply(available, rate),
      unrealizedPnlUsd: multiply(pnl, rate),
      complete: rate != null,
      errorCode: rate == null ? "UNPRICED_ASSETS" : null,
      balances: [
        {
          assetId: "gate:USDT",
          symbol: "USDT",
          total,
          free: available,
          locked: null,
          debt: null,
          usdValue: multiply(total, rate),
          priceUsd: rate,
        },
      ],
      positions,
    };
  }
  async fetch(includeSpot: boolean): Promise<SyncResult> {
    if (!this.verified) throw new ExchangeError("INVALID_RESPONSE");
    const rates = await this.prices().catch(() => new Map<string, string>()),
      result: SyncResult = { accounts: [], failedAccounts: [] };
    if (includeSpot) {
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
    try {
      result.accounts.push(await this.futures(rates));
    } catch (e) {
      result.failedAccounts.push({
        accountKey: "futures:usdt",
        kind: "futures",
        errorCode: safeError(e),
      });
    }
    return result;
  }
}
