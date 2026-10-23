import { record, records } from "./adapters";
import { D, decimal, multiply } from "./decimal";
import { positionBreakEven, type FundingSummary } from "./funding";
import { ExchangeError, type OpenPosition } from "./types";
import { trimTrailing } from "@/lib/utils/trim";
export type Row = Record<string, unknown>;
export function textField(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new ExchangeError("INVALID_RESPONSE");
  return value;
}
export function positive(value: unknown): string | null {
  const v = decimal(value);
  return v != null && new D(v).gt(0) ? v : null;
}
export function timestamp(value: unknown, scale = 1): number | null {
  const n = Number(value) * scale;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function okxRows(value: unknown): Row[] {
  const r = record(value);
  if (r.code !== "0") throw new ExchangeError("UNAVAILABLE");
  return records(r.data);
}
export function one(rows: Row[]): Row {
  if (rows.length !== 1) throw new ExchangeError("INVALID_RESPONSE");
  return rows[0]!;
}
/** Provider native cumulative cash flows; fees are negative cash flow upstream. */
export function nativeFunding(
  amount: unknown,
  pnl: unknown,
  fee: unknown,
  since: number | null,
): FundingSummary {
  const fees = decimal(fee),
    funding = decimal(amount);
  return {
    amount: funding,
    realizedPnl: decimal(pnl),
    tradingFees: fees == null ? null : new D(fees).negated().toFixed(),
    since,
    updatedAt: Date.now(),
    status: funding == null ? "unavailable" : "complete",
  };
}
export function finishPosition(p: OpenPosition) {
  p.funding!.breakEvenPrice = positionBreakEven(p);
  return p;
}
export function usd(value: unknown, rate: string | null): string | null {
  return multiply(decimal(value), rate);
}
export function assertIpWhitelist(value: unknown) {
  const ips = typeof value === "string" ? value.split(",") : value;
  if (
    !Array.isArray(ips) ||
    !ips.length ||
    ips.some(
      (ip) =>
        typeof ip !== "string" ||
        !ip.trim() ||
        ["*", "0.0.0.0", "0.0.0.0/0", "::/0"].includes(ip.trim()),
    )
  )
    throw new ExchangeError("IP_RESTRICTED");
}
export function assertOkxReadOnly(r: Row) {
  if (r.perm !== "read_only") throw new ExchangeError("UNSAFE_KEY");
  assertIpWhitelist(r.ip);
}
/** Gate returns masked keys on some accounts. Require a uniquely matching visible prefix, never choose another key. */
export function assertGateReadOnly(value: unknown, apiKey: string) {
  const matches = records(value).filter((r) => {
    if (r.key === apiKey) return true;
    if (typeof r.key !== "string") return false;
    // A masked key is a visible prefix of 8+ characters followed only by asterisks.
    const prefix = trimTrailing(r.key, "*");
    if (prefix.length === r.key.length || !/^[A-Za-z0-9_-]{8,}$/.test(prefix)) return false;
    return apiKey.startsWith(prefix);
  });
  if (matches.length !== 1) throw new ExchangeError("INVALID_RESPONSE");
  const key = matches[0]!;
  if (key.state !== 1) throw new ExchangeError("INVALID_KEY");
  const perms = records(key.perms);
  if (
    !perms.length ||
    perms.some((p) => p.read_only !== true || typeof p.name !== "string")
  )
    throw new ExchangeError("UNSAFE_KEY");
  assertIpWhitelist(key.ip_whitelist);
}
