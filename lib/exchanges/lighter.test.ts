import { describe, expect, it, vi } from "vitest";

vi.mock("./rate-budget", () => ({ reserveRequest: vi.fn(async () => {}) }));
import { LighterAdapter, lighterAccountState } from "./lighter";

const address = `0x${"b".repeat(40)}`;
const account = (over: Record<string, unknown>) => ({
  l1_address: address,
  account_type: 1,
  total_asset_value: "0",
  available_balance: "0",
  assets: [],
  positions: [],
  ...over,
});
const live = {
  code: 200,
  accounts: [
    // Main account: 0.8 ETH held as margin against a 0.8 ETH short (a hedge).
    account({
      index: 756043,
      account_type: 0,
      total_asset_value: "83.13",
      available_balance: "44.65",
      assets: [{ symbol: "ETH", margin_balance: "0.80000000" }],
      positions: [
        { market_id: 0, symbol: "ETH", sign: -1, position: "0.8000", avg_entry_price: "2361.61", position_value: "1806.68",
          unrealized_pnl: "80.31", realized_pnl: "0", liquidation_price: "0", initial_margin_fraction: "2.00", margin_mode: 0, allocated_margin: "0" },
      ],
    }),
    account({
      index: 281474976479116,
      total_asset_value: "179.48",
      available_balance: "160.39",
      assets: [{ symbol: "USDC", margin_balance: "156.417246" }],
      positions: [
        { market_id: 2, symbol: "SOL", sign: -1, position: "4.94", avg_entry_price: "101.27", position_value: "477.209",
          unrealized_pnl: "23.06", realized_pnl: "1.5", liquidation_price: "180.2", initial_margin_fraction: "4.00", margin_mode: 1, allocated_margin: "40" },
        { market_id: 1, symbol: "BTC", sign: 1, position: "0", avg_entry_price: "0", position_value: "0", unrealized_pnl: "0" },
      ],
    }),
    // An empty sub-account is left out.
    account({ index: 3 }),
  ],
};

describe("Lighter", () => {
  it("tells a funded account from a missing or empty one", () => {
    expect(lighterAccountState(live)).toBe("listed");
    expect(lighterAccountState({ code: 21100, message: "account not found" })).toBe("absent");
    expect(lighterAccountState({ code: 200, accounts: [account({ index: 1 })] })).toBe("absent");
    expect(() => lighterAccountState({ code: 500 })).toThrow("UNAVAILABLE");
  });

  it("reads every account of the address with equity, margin coins and positions", async () => {
    const adapter = new LighterAdapter(address, async () => new Map([["USDC", "1"], ["ETH", "2258"]]), async () => live);
    expect(await adapter.verify()).toEqual({ externalAccountId: address });
    const { accounts, failedAccounts } = await adapter.fetch();
    expect(failedAccounts).toEqual([]);
    expect(accounts.map((a) => [a.accountKey, a.mode])).toEqual([
      ["lighter:756043", "lighter-main"],
      ["lighter:281474976479116", "lighter-sub"],
    ]);
    const [main, sub] = accounts;
    // Lighter leaves non-USDC margin out of total_asset_value: 83.13 + 0.8 ETH × 2258.
    expect(main!.equityUsd).toBe("1889.53");
    expect(main!.balances).toMatchObject([{ symbol: "ETH", total: "0.8", usdValue: "1806.4" }]);
    expect(main!.positions![0]).toMatchObject({
      base: "ETH", side: "short", baseSize: "0.8", entryPrice: "2361.61", markPrice: "2258.35",
      leverage: "50", marginMode: "cross", unrealizedPnlUsd: "80.31", liquidationPrice: null,
    });
    expect(sub!.equityUsd).toBe("179.48");
    expect(sub!.positions).toHaveLength(1);
    expect(sub!.positions![0]).toMatchObject({ base: "SOL", leverage: "25", marginMode: "isolated", margin: "40", liquidationPrice: "180.2" });
  });

  it("marks an account partial when a margin coin has no price", async () => {
    const adapter = new LighterAdapter(address, async () => new Map([["USDC", "1"]]), async () => live);
    const { accounts } = await adapter.fetch();
    expect(accounts[0]).toMatchObject({ equityUsd: null, complete: false, errorCode: "UNPRICED_ASSETS" });
  });

  it("refuses an answer for another address", async () => {
    const other = { code: 200, accounts: [account({ index: 9, l1_address: `0x${"c".repeat(40)}`, total_asset_value: "5" })] };
    await expect(new LighterAdapter(address, async () => new Map(), async () => other).fetch()).rejects.toThrow("INVALID_RESPONSE");
  });
});
