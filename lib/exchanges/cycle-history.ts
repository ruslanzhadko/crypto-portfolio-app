import { record, records } from "./adapters";
import { D, decimal, requiredDecimal as rd, sum } from "./decimal";
import {
  fundingPeriod,
  positionBreakEven,
  positionOpening,
  type FundingSummary,
} from "./funding";
import type { Request } from "./transport";
import type { OpenPosition } from "./types";

type Row = Record<string, unknown>;
const WEEK = 7 * 86400_000;
const LOOKBACK = 90 * 86400_000;
function time(value: unknown) {
  const n =
    typeof value === "string" && !/^\d+$/.test(value)
      ? Date.parse(value)
      : Number(value);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error("Invalid history time");
  return n;
}

/** Bounded current-cycle accounting. Unknown/truncated history never means zero. */
export class CycleHistoryReader {
  private cache = new Map<string, FundingSummary>();
  constructor(
    private venue: "bingx" | "aster",
    private request: Request,
  ) {}
  async enrich(positions: OpenPosition[]) {
    const key = (p: OpenPosition) =>
      `${p.positionKey}:${p.baseSize}:${p.entryPrice}`;
    const active = new Set(positions.map(key));
    for (const k of this.cache.keys()) if (!active.has(k)) this.cache.delete(k);
    let refreshed = false;
    for (const p of positions) {
      const cached = this.cache.get(key(p));
      const market = p.funding;
      let summary = cached;
      if (
        !cached ||
        fundingPeriod(cached.updatedAt) !== fundingPeriod(Date.now())
      ) {
        if (!refreshed) {
          refreshed = true;
          try {
            summary = await this.read(p, positions);
          } catch {
            summary = {
              amount: null,
              realizedPnl: null,
              tradingFees: null,
              since: null,
              updatedAt: Date.now(),
              status: "unavailable",
            };
          }
          this.cache.set(key(p), summary);
        }
      }
      p.funding = {
        ...(summary ?? {
          amount: null,
          since: null,
          updatedAt: Date.now(),
          status: "pending" as const,
        }),
        nextRate: market?.nextRate,
        nextTime: market?.nextTime,
        nextRateUpdatedAt: market?.nextRateUpdatedAt,
      };
      p.funding.breakEvenPrice = positionBreakEven(p);
    }
  }
  private async read(
    p: OpenPosition,
    positions: OpenPosition[],
  ): Promise<FundingSummary> {
    // Aster needs up to 26 weekly windows each for fills, commissions and funding.
    let budget = this.venue === "aster" ? 82 : 30;
    const get = async (path: string, params: Row = {}, weight = 1) => {
      if (--budget < 0) throw new Error("History budget exhausted");
      const response = await this.request(
        path,
        this.venue === "bingx" ? "swap:v2:private" : "fapiPrivate",
        params,
        weight,
      );
      if (this.venue !== "bingx") return response;
      const envelope = record(response);
      if (String(envelope.code) !== "0") throw new Error("History unavailable");
      return envelope.data;
    };
    // Split isolated positions cannot be attributed using symbol-only history.
    if (this.venue === "bingx") {
      const mode = record(await get("trade/marginType", { symbol: p.symbol }));
      if (!["ISOLATED", "CROSSED"].includes(String(mode.marginType)))
        throw new Error("Split positions unsupported");
    }
    const now = Date.now(),
      earliest = now - (this.venue === "aster" ? 180 * 86400_000 : LOOKBACK);
    const signedSize = new D(p.baseSize)
      .mul(p.side === "short" ? -1 : 1)
      .toFixed();
    const trades: {
      time: number;
      quantity: string;
      fee: string;
      feeAsset: string;
      pnl: string | null;
      id: string | null;
    }[] = [];
    const otherTimes: number[] = [];
    const ids = new Set<string>();
    let since: number | null = null;
    for (let end = now; end >= earliest && since === null; ) {
      const start = Math.max(earliest, end - WEEK + 1);
      let batch: Row[];
      if (this.venue === "bingx") {
        const data = await get("trade/allFillOrders", {
          currency: p.settle,
          tradingUnit: "COIN",
          startTs: start,
          endTs: end,
        });
        batch = records(Array.isArray(data) ? data : record(data).fill_orders);
        if (batch.length >= 1000)
          throw new Error("Truncated account fill history");
        // Reconcile fills with executed orders: some API revisions silently cap
        // fill lists without a cursor. An incomplete list must never become a total.
        {
          const orders = await get("trade/allOrders", {
            currency: p.settle,
            startTime: start,
            endTime: end,
            limit: 1000,
          });
          const list = records(
            Array.isArray(orders) ? orders : record(orders).orders,
          );
          if (list.length >= 1000) throw new Error("Truncated order history");
          const byId = new Map(list.map((r) => [String(r.orderId), r]));
          const quantities = new Map<string, InstanceType<typeof D>>();
          for (const r of batch) {
            if (r.orderId == null)
              throw new Error("Missing fill order identity");
            const id = String(r.orderId);
            quantities.set(
              id,
              (quantities.get(id) ?? new D(0)).plus(rd(r.qty ?? r.volume)),
            );
          }
          for (const r of list) {
            const qty = new D(rd(r.executedQty));
            if (
              !qty.isZero() &&
              !qty.eq(quantities.get(String(r.orderId)) ?? new D(0))
            )
              throw new Error("Incomplete fills for executed order");
          }
          if ([...quantities.keys()].some((id) => !byId.has(id)))
            throw new Error("Unresolved fill order");
          batch = batch.map((r) => {
            const order = byId.get(String(r.orderId));
            return {
              symbol: order?.symbol,
              side: order?.side,
              positionSide: order?.positionSide,
              ...r,
            };
          });
          batch = batch.filter((r) => r.symbol === p.symbol);
        }
      } else {
        batch = records(
          await get(
            "v3/userTrades",
            { symbol: p.symbol, startTime: start, endTime: end, limit: 1000 },
            5,
          ),
        );
      }
      if (batch.length >= 1000) throw new Error("Truncated fill history");
      for (const r of batch) {
        if (
          r.symbol !== p.symbol ||
          !["BUY", "SELL"].includes(String(r.side)) ||
          !["BOTH", "LONG", "SHORT"].includes(String(r.positionSide))
        )
          throw new Error("Ambiguous trade");
        const t = time(r.time ?? r.tradeTime ?? r.filledTime);
        if (t < start || t > end) throw new Error("Out of range fill");
        // Multiple fills of an order are valid; exact IDs are checked when supplied.
        const id = r.tradeId ?? r.id;
        if (id !== undefined) {
          if (ids.has(String(id))) throw new Error("Repeated fill");
          ids.add(String(id));
        }
        if (
          r.positionSide !== "BOTH" &&
          r.positionSide !== p.side.toUpperCase()
        ) {
          otherTimes.push(t);
          continue;
        }
        const fee = rd(r.fee ?? r.commission);
        const quantity = rd(r.qty ?? r.volume);
        if (!new D(quantity).isPositive())
          throw new Error("Invalid fill quantity");
        trades.push({
          time: t,
          quantity: new D(quantity).mul(r.side === "SELL" ? -1 : 1).toFixed(),
          fee: new D(fee).negated().toFixed(),
          feeAsset: String(r.commissionAsset ?? r.currency ?? p.settle),
          pnl: decimal(r.realizedPnl),
          id: id == null ? null : String(id),
        });
      }
      since = positionOpening(signedSize, trades);
      end = start - 1;
    }
    if (since === null) throw new Error("Opening outside history");
    const cycle = trades.filter((r) => r.time >= since!);
    const foreignFees = cycle.some(
      (r) => !new D(r.fee).isZero() && r.feeAsset !== p.settle,
    );
    if (foreignFees && this.venue !== "aster")
      throw new Error("Foreign fee asset");
    if (
      !new D(signedSize).minus(sum(cycle.map((r) => r.quantity))).isZero() ||
      cycle.some(
        (r) =>
          r.time === since &&
          new D(r.quantity).isNegative() !== new D(signedSize).isNegative(),
      )
    )
      throw new Error("Reversal allocation unavailable");
    let fees = decimal(sum(cycle.map((r) => r.fee)));
    let tradingFeesByAsset: Record<string, string> | undefined;
    // Aster's income ledger has unambiguous cash-flow signs, unlike fee fields
    // across API revisions. Match commissions to fills rather than a hedge symbol.
    if (this.venue === "aster") {
      if (cycle.some((r) => r.id === null))
        throw new Error("Missing fill identities");
      const cycleIds = new Set(cycle.map((r) => r.id));
      const values = new Map<string, string[]>(),
        seen = new Set<string>(),
        charged = new Set<string>();
      for (let start = since; start <= now; ) {
        const end = Math.min(now, start + WEEK - 1);
        const batch = records(
          await get(
            "v3/income",
            {
              symbol: p.symbol,
              incomeType: "COMMISSION",
              startTime: start,
              endTime: end,
              limit: 1000,
            },
            30,
          ),
        );
        if (batch.length >= 1000)
          throw new Error("Truncated commission history");
        for (const r of batch) {
          if (
            r.symbol !== p.symbol ||
            typeof r.asset !== "string" ||
            !/^[A-Z0-9]{1,20}$/.test(r.asset) ||
            r.incomeType !== "COMMISSION" ||
            time(r.time) < start ||
            time(r.time) > end ||
            r.tranId == null ||
            r.tradeId == null
          )
            throw new Error("Invalid commission record");
          const id = String(r.tranId);
          if (seen.has(id)) throw new Error("Repeated commission record");
          seen.add(id);
          if (cycleIds.has(String(r.tradeId))) {
            charged.add(String(r.tradeId));
            const amounts = values.get(r.asset) ?? [];
            amounts.push(new D(rd(r.income)).negated().toFixed());
            values.set(r.asset, amounts);
          }
        }
        start = end + 1;
      }
      if (cycle.some((r) => !new D(r.fee).isZero() && !charged.has(r.id!)))
        throw new Error("Commission ledger incomplete");
      tradingFeesByAsset = Object.fromEntries(
        [...values].map(([asset, amounts]) => [asset, sum(amounts)]),
      );
      fees =
        foreignFees ||
        [...values].some(
          ([asset, amounts]) =>
            asset !== p.settle && amounts.some((v) => !new D(v).isZero()),
        )
          ? null
          : decimal(tradingFeesByAsset[p.settle] ?? "0");
    }
    const reductions = cycle.filter((r) => r.time > since!);
    let realized = reductions.every((r) => r.pnl !== null)
      ? decimal(sum(reductions.map((r) => r.pnl)))
      : null;
    let amount: string | null = null;
    // Funding is symbol-level: prove the other hedge leg stayed absent for this cycle.
    if (
      !positions.some(
        (r) => r.symbol === p.symbol && r.positionKey !== p.positionKey,
      ) &&
      !otherTimes.some((t) => t >= since!)
    ) {
      const values: string[] = [],
        seen = new Set<string>();
      for (let start = since + 1; start <= now; ) {
        const end = Math.min(now, start + WEEK - 1);
        const batch = records(
          await get(
            this.venue === "bingx" ? "user/income" : "v3/income",
            {
              symbol: p.symbol,
              incomeType: "FUNDING_FEE",
              startTime: start,
              endTime: end,
              limit: 1000,
            },
            this.venue === "aster" ? 30 : 1,
          ),
        );
        if (batch.length >= 1000) throw new Error("Truncated funding history");
        for (const r of batch) {
          if (
            r.symbol !== p.symbol ||
            r.asset !== p.settle ||
            r.incomeType !== "FUNDING_FEE" ||
            time(r.time) < start ||
            time(r.time) > end ||
            r.tranId == null
          )
            throw new Error("Invalid funding record");
          const id = String(r.tranId);
          if (seen.has(id)) throw new Error("Repeated funding record");
          seen.add(id);
          values.push(rd(r.income));
        }
        start = end + 1;
      }
      amount = decimal(sum(values));
      if (realized === null && this.venue === "bingx") {
        const values: string[] = [],
          seen = new Set<string>();
        for (let start = since + 1; start <= now; ) {
          const end = Math.min(now, start + WEEK - 1);
          const batch = records(
            await get("user/income", {
              symbol: p.symbol,
              incomeType: "REALIZED_PNL",
              startTime: start,
              endTime: end,
              limit: 1000,
            }),
          );
          if (batch.length >= 1000)
            throw new Error("Truncated realized history");
          for (const r of batch) {
            if (
              r.symbol !== p.symbol ||
              r.asset !== p.settle ||
              r.incomeType !== "REALIZED_PNL" ||
              time(r.time) < start ||
              time(r.time) > end ||
              r.tranId == null ||
              seen.has(String(r.tranId))
            )
              throw new Error("Invalid realized record");
            seen.add(String(r.tranId));
            values.push(rd(r.income));
          }
          start = end + 1;
        }
        realized = decimal(sum(values));
      }
    }
    // Reject accounting if a trade changed the position during the bounded backfill.
    const latest = records(
      await get(
        this.venue === "bingx" ? "user/positions" : "v3/positionRisk",
        { symbol: p.symbol },
        this.venue === "aster" ? 5 : 1,
      ),
    ).find((r) =>
      this.venue === "bingx"
        ? String(r.positionId) === p.positionKey
        : `${r.symbol}:${r.positionSide}` === p.positionKey,
    );
    if (
      !latest ||
      !new D(rd(latest.positionAmt)).abs().eq(p.baseSize) ||
      (latest.positionSide === "SHORT" ||
      (latest.positionSide === "BOTH" &&
        new D(rd(latest.positionAmt)).isNegative())
        ? "short"
        : "long") !== p.side ||
      !new D(rd(latest.avgPrice ?? latest.entryPrice)).eq(p.entryPrice ?? "0")
    )
      throw new Error("Position changed during history read");
    return {
      amount,
      realizedPnl: realized,
      tradingFees: fees,
      tradingFeesByAsset,
      since,
      updatedAt: now,
      status: amount === null ? "unavailable" : "complete",
    };
  }
}
