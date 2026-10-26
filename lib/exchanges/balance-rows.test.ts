import { describe, expect, it } from "vitest";
import { exchangeBalanceRows } from "./balance-rows";

describe("exchange balance rows", () => {
  it("marks Gate Simple Earn rows", () => {
    const rows = exchangeBalanceRows([
      {
        exchange: "gate",
        kind: "spot",
        equityUsd: "10",
        balances: [
          { assetId: "gate:DNA", symbol: "DNA", total: "1", priceUsd: "1", usdValue: "1" },
          { assetId: "gate:earn:DNA", symbol: "DNA", total: "5", priceUsd: "1", usdValue: "5" },
        ],
      },
    ]);
    expect(rows.map((r) => [r.total, r.earn])).toEqual([
      ["5", true],
      ["1", false],
    ]);
  });
});
