import { it, expect, vi } from "vitest";
import { NextFundingReader } from "./next-funding";
import type { OpenPosition } from "./types";
const p = () =>
  ({
    symbol: "BTCUSDT",
    base: "BTC",
    funding: { amount: "1", status: "complete" },
  }) as OpenPosition;
it.each(["bybit", "binance", "hyperliquid"] as const)(
  "reads %s estimates without changing cash funding, caches then refreshes at settlement",
  async (venue) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T14:59:00Z"));
    try {
      const next = Date.now() + 60_000;
      const request = vi.fn(async () =>
        venue === "bybit"
          ? {
              retCode: 0,
              result: {
                list: [
                  {
                    symbol: "BTCUSDT",
                    fundingRate: "0.0001",
                    nextFundingTime: String(next),
                  },
                ],
              },
            }
          : [
              {
                symbol: "BTCUSDT",
                lastFundingRate: "0.0001",
                nextFundingTime: next,
              },
            ],
      );
      const info = vi.fn(async () => [
        { universe: [{ name: "BTC" }] },
        [{ funding: "0.0001" }],
      ]);
      const reader = new NextFundingReader(venue, request, info),
        position = p();
      await reader.enrich([position]);
      expect(position.funding).toMatchObject({
        amount: "1",
        nextRate: "0.0001",
        nextTime: next,
      });
      await reader.enrich([position]);
      expect(venue === "hyperliquid" ? info : request).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60_000);
      await reader.enrich([position]);
      expect(venue === "hyperliquid" ? info : request).toHaveBeenCalledTimes(2);
      expect(position.funding?.nextTime).toBe(
        venue === "hyperliquid" ? next + 3600_000 : null,
      );
    } finally {
      vi.useRealTimers();
    }
  },
);
it("isolates market failure and backs off instead of querying every position sync", async () => {
  const request = vi.fn(async () => {
    throw Error("offline");
  });
  const position = p(),
    reader = new NextFundingReader("binance", request);
  await reader.enrich([position]);
  await reader.enrich([position]);
  expect(position.funding).toMatchObject({
    amount: "1",
    nextTime: null,
    nextRate: null,
  });
  expect(request).toHaveBeenCalledTimes(1);
});
