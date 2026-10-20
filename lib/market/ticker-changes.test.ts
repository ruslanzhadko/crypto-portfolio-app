import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTickerChanges, tickerChanges } from "./ticker-changes";

const bodies: Record<string, unknown> = {
  binance: [
    { symbol: "SOMIUSDT", lastPrice: "0.99", openPrice: "1" },
    { symbol: "BTCBUSD", lastPrice: "1", openPrice: "1" },
  ],
  bybit: { result: { list: [{ symbol: "SOMIUSDT", price24hPcnt: "0.5" }, { symbol: "APTUSDT", price24hPcnt: "0.0123" }] } },
  okx: { data: [{ instId: "PENGU-USDT", last: "1.1", open24h: "1" }] },
  gate: [{ currency_pair: "GT_USDT", change_percentage: "-2.5" }],
};
function fakeFetch(fail: string[] = []) {
  return vi.fn(async (url: string) => {
    const name = Object.keys(bodies).find((k) => url.includes(k === "gate" ? "gateio" : k))!;
    if (fail.includes(name)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => bodies[name] };
  }) as unknown as typeof fetch;
}

beforeEach(() => resetTickerChanges());

describe("ticker changes", () => {
  it("merges exchanges in priority order and keeps only USDT pairs", async () => {
    const changes = await tickerChanges(fakeFetch());
    expect(changes.get("SOMI")).toBeCloseTo(-1, 5); // Binance wins over Bybit
    expect(changes.get("APT")).toBeCloseTo(1.23, 5);
    expect(changes.get("PENGU")).toBeCloseTo(10, 5);
    expect(changes.get("GT")).toBe(-2.5);
    expect(changes.has("BTC")).toBe(false);
  });

  it("works when some exchanges fail", async () => {
    const changes = await tickerChanges(fakeFetch(["binance", "okx"]));
    expect(changes.get("SOMI")).toBeCloseTo(50, 5);
    expect(changes.get("GT")).toBe(-2.5);
  });
});
