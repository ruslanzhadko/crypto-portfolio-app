import { describe, expect, it } from "vitest";
import { assertBinanceReadOnly, assertBybitReadOnly } from "./permissions";
import { safeError } from "./types";
const binance = {
  enableReading: true,
  ipRestrict: true,
  enableWithdrawals: false,
  enableFutures: false,
  enableSpotAndMarginTrading: false,
};
describe("read-only permissions", () => {
  it("accepts only known safe core flags", () => {
    expect(() => assertBinanceReadOnly(binance)).not.toThrow();
    expect(() => assertBinanceReadOnly({})).toThrow();
  });
  it.each([
    "enableFutures",
    "enableWithdrawals",
    "enableInternalTransfer",
    "enableSpotAndMarginTrading",
    "permitsUniversalTransfer",
    "enablePortfolioMarginTrading",
  ])("rejects Binance %s", (key) => {
    expect(() => assertBinanceReadOnly({ ...binance, [key]: true })).toThrow(
      "UNSAFE_KEY",
    );
  });
  it("requires IP restrictions", () => {
    expect(() =>
      assertBinanceReadOnly({ ...binance, ipRestrict: false }),
    ).toThrow("IP_RESTRICTED");
  });
  it("requires Bybit read-only flag and rejects transfer permission even with it", () => {
    const key = {
      readOnly: 1,
      ips: ["203.0.113.10"],
      permissions: { Wallet: [] },
    };
    expect(() => assertBybitReadOnly(key)).not.toThrow();
    expect(() => assertBybitReadOnly({ ...key, readOnly: 0 })).toThrow(
      "UNSAFE_KEY",
    );
    expect(() =>
      assertBybitReadOnly({
        ...key,
        permissions: { Wallet: ["AccountTransfer"] },
      }),
    ).toThrow("UNSAFE_KEY");
    expect(() => assertBybitReadOnly({ ...key, ips: [] })).toThrow(
      "IP_RESTRICTED",
    );
  });
  it("never exposes provider error messages", () => {
    const err = new Error("apiKey=PRIVATE&signature=SECRET");
    err.name = "AuthenticationError";
    expect(safeError(err)).toBe("INVALID_KEY");
    expect(safeError(new Error("SECRET"))).toBe("UNAVAILABLE");
  });
});
