import { D } from "./decimal";
type Row = {
  id: string;
  margin: { toString(): string } | null;
  unrealizedPnl: { toString(): string } | null;
};
export function compareMarginReturn(a: Row, b: Row, ascending: boolean) {
  const rate = (p: Row) =>
    p.margin != null &&
    new D(p.margin.toString()).gt(0) &&
    p.unrealizedPnl != null
      ? new D(p.unrealizedPnl.toString()).div(p.margin.toString())
      : null;
  const ar = rate(a),
    br = rate(b);
  if (ar == null || br == null)
    return ar == null && br == null
      ? a.id.localeCompare(b.id)
      : ar == null
        ? 1
        : -1;
  return ar.comparedTo(br) * (ascending ? 1 : -1) || a.id.localeCompare(b.id);
}
