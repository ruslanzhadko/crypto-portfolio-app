import { describe, expect, it } from "vitest";
import { describeTokenLocations } from "./token-locations";
import type { WalletTokenBreakdown } from "@/lib/services/portfolio";

const wallet = (over: Partial<WalletTokenBreakdown>): WalletTokenBreakdown =>
  ({
    walletId: "w",
    walletLabel: "Main",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    network: "EVM",
    chainName: "ethereum",
    balance: 1,
    usdValue: 1,
    share: 100,
    ...over,
  }) as WalletTokenBreakdown;
const holding = (label: string) => ({
  key: label,
  symbol: "X",
  label,
  exchange: "bybit",
  kind: "spot",
  amount: 1,
  usdValue: 1,
  priceUsd: 1,
});

describe("describeTokenLocations", () => {
  it("names the wallet with its network and the exchange accounts", () => {
    expect(
      describeTokenLocations({
        wallets: [wallet({})],
        exchanges: [holding("Bybit Main")],
      }),
    ).toBe("Main · Ethereum, Bybit Main");
  });

  it("falls back to a short address and cuts long lists", () => {
    expect(describeTokenLocations({ wallets: [wallet({ walletLabel: null })] })).toBe(
      "0x1234…5678 · Ethereum",
    );
    const text = describeTokenLocations({
      wallets: [wallet({})],
      exchanges: [holding("A"), holding("B"), holding("C")],
    });
    expect(text).toBe("Main · Ethereum, A +2");
  });
});
