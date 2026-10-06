import { describe, expect, it, vi } from "vitest";
vi.mock("./transport", () => ({ reserveRequest: vi.fn() }));
import { HyperliquidAdapter } from "./hyperliquid";
function info(mode: string) {
  return async (body: Record<string, unknown>) => {
    if (body.type === "userAbstraction") return mode;
    if (body.type === "spotClearinghouseState")
      return { balances: [{ token: 0, total: "100", hold: "5" }] };
    if (body.type === "spotMetaAndAssetCtxs")
      return [
        {
          tokens: [{ index: 0, name: "USDC", tokenId: "usdc-token" }],
          universe: [],
        },
        [],
      ];
    return {
      marginSummary: { accountValue: "110" },
      withdrawable: "80",
      assetPositions: [
        {
          position: {
            coin: "BTC",
            szi: "0.1",
            positionValue: "5000",
            entryPx: "49000",
            unrealizedPnl: "100",
            marginUsed: "1000",
            liquidationPx: null,
            leverage: { value: 5, type: "cross" },
          },
        },
      ],
    };
  };
}
describe("HyperCore accounting", () => {
  it("counts spot only once for unified accounts", async () => {
    const a = new HyperliquidAdapter(
      `0x${"1".repeat(40)}`,
      async () => new Map([["USDC", "0.99"]]),
      info("unifiedAccount"),
    );
    const result = await a.fetch();
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]!.equityUsd).toBe("99");
    expect(result.accounts[0]!.positions).toHaveLength(1);
  });
  it("keeps classic perp equity in a separate pool without adding position notional", async () => {
    const a = new HyperliquidAdapter(
      `0x${"1".repeat(40)}`,
      async () => new Map([["USDC", "0.99"]]),
      info("disabled"),
    );
    const result = await a.fetch();
    expect(result.accounts.map((a) => a.equityUsd)).toEqual(["99", "108.9"]);
  });
});
