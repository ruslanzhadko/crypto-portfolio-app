import { describe, expect, it } from "vitest";
import { markTransfers, type TransferInput } from "./capital-transfers";

const MIN = 60_000;
const point = (minute: number, wallets: number, exchanges: number) => ({
  timestamp: minute * MIN,
  totalUsd: String(wallets + exchanges),
  walletsUsd: String(wallets),
  exchangesUsd: String(exchanges),
});
const transfer = (over: Partial<TransferInput>): TransferInput => ({
  connectionId: "binance",
  label: "Binance",
  direction: "deposit",
  asset: "USDT",
  amount: "1000",
  usd: 1000,
  txHash: null,
  address: null,
  occurredAt: 100 * MIN,
  ...over,
});

describe("markTransfers", () => {
  it("drops the double-counted points of a wallet → exchange deposit", () => {
    const points = [
      point(0, 5000, 2000),
      point(90, 5000, 2000),
      point(105, 5000, 3000), // the exchange already shows it, the wallet not yet
      point(110, 5010, 3000),
      point(120, 4010, 3000), // wallet synced
      point(130, 4020, 3000),
    ];
    const result = markTransfers(points, [transfer({})], []);
    expect(result.points.map((p) => p.timestamp / MIN)).toEqual([0, 90, 120, 130]);
    expect(result.transfers).toMatchObject([{ direction: "deposit", own: true, usd: 1000 }]);
  });

  it("drops the dip of an exchange → wallet withdrawal and names the wallet", () => {
    const points = [
      point(90, 5000, 2000),
      point(105, 5000, 1000), // gone from the exchange, not yet in the wallet
      point(120, 6000, 1000),
    ];
    const result = markTransfers(
      points,
      [transfer({ direction: "withdrawal", address: "0xABC" })],
      [{ address: "0xabc", label: "Main EVM" }],
    );
    expect(result.points.map((p) => p.timestamp / MIN)).toEqual([90, 120]);
    expect(result.transfers).toMatchObject([{ own: true, counterpart: "Main EVM" }]);
  });

  it("keeps a real deposit from outside and marks it as external", () => {
    const points = [point(90, 5000, 2000), point(105, 5000, 3000), point(120, 5000, 3010)];
    const result = markTransfers(points, [transfer({})], []);
    expect(result.points).toHaveLength(3);
    expect(result.transfers).toMatchObject([{ own: false, counterpart: null }]);
  });

  it("calls a deposit own when the wallets lost what the exchange got", () => {
    const points = [point(90, 5000, 2000), point(105, 4000, 3000)];
    const result = markTransfers(points, [transfer({})], []);
    expect(result.points).toHaveLength(2);
    expect(result.transfers[0]!.own).toBe(true);
  });

  it("folds an exchange → exchange move into one mark", () => {
    const result = markTransfers(
      [],
      [
        transfer({ direction: "withdrawal", txHash: "0xAA" + "1".repeat(62) }),
        transfer({ connectionId: "bybit", label: "Bybit", txHash: "aa" + "1".repeat(62) }),
      ],
      [],
    );
    expect(result.transfers).toEqual([
      expect.objectContaining({ direction: "withdrawal", label: "Binance", counterpart: "Bybit", own: true }),
    ]);
  });

  it("skips small and unpriced transfers", () => {
    const result = markTransfers([], [transfer({ usd: 20 }), transfer({ usd: null })], []);
    expect(result.transfers).toEqual([]);
  });

  it("keeps a jump that is still on the chart's last point", () => {
    const points = [point(90, 5000, 2000), point(105, 5000, 3000)];
    expect(markTransfers(points, [transfer({})], []).points).toHaveLength(2);
  });
});
