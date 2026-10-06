import { Prisma } from "@prisma/client";
import { ExchangeError } from "./types";
// PostgreSQL stores 38 significant digits; decimal.js defaults to only 20.
// Clone rather than changing the precision of unrelated legacy calculations.
export const D = Prisma.Decimal.clone({
  precision: 60,
  rounding: Prisma.Decimal.ROUND_HALF_EVEN,
});
export function decimal(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number")
    throw new ExchangeError("INVALID_RESPONSE");
  try {
    const n = new D(value);
    if (!n.isFinite() || n.abs().gte("1e20")) throw new Error();
    return n.toFixed(Math.min(n.decimalPlaces(), 18));
  } catch {
    throw new ExchangeError("INVALID_RESPONSE");
  }
}
export function requiredDecimal(value: unknown): string {
  const result = decimal(value);
  if (result === null) throw new ExchangeError("INVALID_RESPONSE");
  return result;
}
export function sum(values: (string | null)[]): string {
  return values
    .reduce<Prisma.Decimal>((a, b) => a.plus(b ?? "0"), new D(0))
    .toFixed();
}
export function multiply(a: string | null, b: string | null): string | null {
  return a === null || b === null ? null : decimal(new D(a).mul(b).toFixed());
}
