import { D } from "./decimal";
import type { FundingSummary } from "./funding";

type Row = {
  side: string;
  settle: string;
  notionalUsd: { toString(): string } | null;
  unrealizedPnlUsd: { toString(): string } | null;
  funding: unknown;
};
export function summarizePositions(rows: Row[], prices: Map<string, string>) {
  const metric = () => ({ value: new D(0), known: 0 });
  const volume = metric(),
    realized = metric(),
    unrealized = metric();
  for (const row of rows) {
    if (row.notionalUsd != null) {
      volume.value = volume.value.plus(new D(row.notionalUsd.toString()).abs());
      volume.known++;
    }
    if (row.unrealizedPnlUsd != null) {
      unrealized.value = unrealized.value.plus(row.unrealizedPnlUsd.toString());
      unrealized.known++;
    }
    const f = row.funding as FundingSummary | null;
    const price = prices.get(row.settle);
    if (
      price &&
      f?.status === "complete" &&
      f.amount != null &&
      f.realizedPnl != null &&
      f.tradingFees != null
    ) {
      realized.value = realized.value.plus(
        new D(f.realizedPnl).plus(f.amount).minus(f.tradingFees).mul(price),
      );
      realized.known++;
    }
  }
  const serialize = (m: ReturnType<typeof metric>) => ({
    value: rows.length === 0 || m.known > 0 ? m.value.toFixed() : null,
    known: m.known,
  });
  return {
    count: rows.length,
    long: rows.filter((p) => p.side === "long").length,
    short: rows.filter((p) => p.side === "short").length,
    volume: serialize(volume),
    realized: serialize(realized),
    unrealized: serialize(unrealized),
  };
}
