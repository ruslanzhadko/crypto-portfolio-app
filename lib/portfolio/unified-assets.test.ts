import { describe, expect, it } from "vitest";
import type { AggregatedToken } from "@/lib/services/portfolio";
import { mergeExchangeHoldings, type ExchangeHolding } from "./unified-assets";

function token(over: Partial<AggregatedToken>): AggregatedToken {
  return {
    key: "k",
    symbol: "ETH",
    name: "Ethereum",
    logoUrl: null,
    coingeckoId: "ethereum",
    chainName: "ethereum",
    tokenAddress: "",
    totalBalance: 1,
    totalUsd: 2000,
    share: 100,
    chains: ["ethereum"],
    walletIds: ["w"],
    wallets: [],
    currentPrice: 2000,
    priceChange24h: 1,
    ...over,
  };
}
const holding = (over: Partial<ExchangeHolding>): ExchangeHolding => ({
  key: "h",
  symbol: "ETH",
  label: "Gate Main",
  exchange: "gate",
  kind: "spot",
  amount: 0.5,
  usdValue: 1000,
  priceUsd: 2000,
  ...over,
});

describe("unified asset list", () => {
  it("adds exchange balances to the matching wallet token and recomputes shares", () => {
    const rows = mergeExchangeHoldings(
      [token({}), token({ key: "u", symbol: "USDT", coingeckoId: "tether", totalUsd: 1000, totalBalance: 1000 })],
      [holding({}), holding({ key: "h2", symbol: "usdt", amount: 500, usdValue: 500 })],
    );
    const eth = rows.find((r) => r.symbol === "ETH")!;
    expect(eth.totalBalance).toBe(1.5);
    expect(eth.totalUsd).toBe(3000);
    expect(eth.exchanges).toHaveLength(1);
    expect(eth.exchangeOnly).toBe(false);
    expect(rows.find((r) => r.symbol === "USDT")!.totalUsd).toBe(1500);
    expect(eth.share).toBeCloseTo(66.67, 1);
  });

  it("creates an exchange-only row for a coin no wallet holds", () => {
    const rows = mergeExchangeHoldings([token({})], [holding({ symbol: "GT", amount: 10, usdValue: 50 })]);
    const gt = rows.find((r) => r.symbol === "GT")!;
    expect(gt).toMatchObject({ exchangeOnly: true, totalUsd: 50, currentPrice: 5, key: "exchange:GT" });
  });

  it("never merges a ticker that names different wallet tokens", () => {
    const rows = mergeExchangeHoldings(
      [
        token({ key: "a", symbol: "PEPE", coingeckoId: "pepe" }),
        token({ key: "b", symbol: "PEPE", coingeckoId: "other-pepe" }),
      ],
      [holding({ symbol: "PEPE" })],
    );
    expect(rows.filter((r) => r.symbol === "PEPE")).toHaveLength(3);
    expect(rows.find((r) => r.key === "exchange:PEPE")?.exchangeOnly).toBe(true);
  });
});
