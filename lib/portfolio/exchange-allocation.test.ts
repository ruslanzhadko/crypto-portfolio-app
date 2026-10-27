import { describe, expect, it } from "vitest";
import {
  combineAllocations,
  exchangeAllocation,
} from "./exchange-allocation";
import type { ExchangeHolding } from "./unified-assets";

const holding = (
  exchange: string,
  symbol: string,
  usdValue: number,
): ExchangeHolding => ({
  key: `${exchange}:${symbol}`,
  symbol,
  label: exchange,
  exchange,
  kind: "SPOT",
  amount: 1,
  usdValue,
  priceUsd: usdValue,
});

describe("exchangeAllocation", () => {
  it("groups balances by exchange and counts distinct coins", () => {
    const rows = exchangeAllocation(
      [
        holding("binance", "USDT", 100),
        holding("binance", "usdt", 50),
        holding("binance", "BTC", 50),
        holding("bybit", "ETH", 200),
      ],
      { binance: "Binance", bybit: "Bybit" },
    );
    expect(rows.map((r) => [r.displayName, r.totalUsd, r.tokenCount])).toEqual(
      [
        ["Binance", 200, 2],
        ["Bybit", 200, 1],
      ],
    );
    expect(rows.map((r) => r.share)).toEqual([50, 50]);
  });
});

describe("combineAllocations", () => {
  it("recomputes shares over the joined total and sorts by value", () => {
    const rows = combineAllocations(
      [
        {
          chainName: "solana",
          displayName: "Solana",
          color: "#000",
          totalUsd: 100,
          share: 100,
          tokenCount: 3,
        },
      ],
      exchangeAllocation([holding("okx", "USDT", 300)], { okx: "OKX" }),
    );
    expect(rows.map((r) => [r.displayName, r.share])).toEqual([
      ["OKX", 75],
      ["Solana", 25],
    ]);
  });
});
