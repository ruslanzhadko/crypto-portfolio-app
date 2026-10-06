import { describe, expect, it } from "vitest";
import { decimal, requiredDecimal, sum, multiply } from "./decimal";
describe("exchange decimal arithmetic", () => {
  it("preserves all 38 significant stored digits during addition", () => {
    expect(
      sum(["123456789012345678.123456789012345678", "0.000000000000000001"]),
    ).toBe("123456789012345678.123456789012345679");
  });
  it("does not replace unknown values with zero", () => {
    expect(decimal("")).toBeNull();
    expect(multiply("100", null)).toBeNull();
    expect(() => requiredDecimal(undefined)).toThrow("INVALID_RESPONSE");
  });
  it.each(["NaN", "Infinity", "1e30"])(
    "rejects unsafe database value %s",
    (value) => expect(() => decimal(value)).toThrow("INVALID_RESPONSE"),
  );
});
