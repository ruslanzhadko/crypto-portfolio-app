import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchPricesByIds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/coingecko", () => ({ fetchPricesByIds }));
import { resetSettlementPrices, settlementPrices } from "./pricing";

const quotes = (usdt: number, usdc: number) =>
  new Map([
    ["tether", { price: usdt }],
    ["usd-coin", { price: usdc }],
  ]);

beforeEach(() => {
  vi.useFakeTimers();
  fetchPricesByIds.mockReset();
  resetSettlementPrices();
});

describe("settlement prices", () => {
  it("shares one request between concurrent callers", async () => {
    fetchPricesByIds.mockResolvedValue(quotes(0.999, 1));
    const [a, b] = await Promise.all([settlementPrices(), settlementPrices()]);
    expect(fetchPricesByIds).toHaveBeenCalledTimes(1);
    expect(a.get("USDT")).toBe("0.999");
    expect(b).toBe(a);
  });

  it("keeps the last verified quotes when CoinGecko fails", async () => {
    fetchPricesByIds.mockResolvedValueOnce(quotes(0.999, 1));
    await settlementPrices();
    vi.advanceTimersByTime(3 * 60_000);
    fetchPricesByIds.mockRejectedValueOnce(new Error("429"));
    expect((await settlementPrices()).get("USDT")).toBe("0.999");
    // Too old: unknown again rather than a stale quote.
    vi.advanceTimersByTime(7 * 3600_000);
    fetchPricesByIds.mockRejectedValueOnce(new Error("429"));
    expect((await settlementPrices()).size).toBe(0);
  });

  it("prices USD1 when quoted and never lets its gap drop USDT", async () => {
    fetchPricesByIds.mockResolvedValueOnce(
      new Map([...quotes(0.999, 1), ["usd1-wlfi", { price: 0.9993 }]]),
    );
    expect((await settlementPrices()).get("USD1")).toBe("0.9993");
    // Next refresh lacks USD1: the earlier quote is kept within the fallback window.
    vi.advanceTimersByTime(31 * 60_000);
    fetchPricesByIds.mockResolvedValueOnce(quotes(0.998, 1));
    const later = await settlementPrices();
    expect(later.get("USDT")).toBe("0.998");
    expect(later.get("USD1")).toBe("0.9993");
    // Too old: USD1 is unknown again while USDT stays fresh.
    vi.advanceTimersByTime(7 * 3600_000);
    fetchPricesByIds.mockResolvedValueOnce(quotes(0.997, 1));
    const old = await settlementPrices();
    expect(old.get("USDT")).toBe("0.997");
    expect(old.has("USD1")).toBe(false);
  });

  it("never caches an empty result", async () => {
    fetchPricesByIds.mockRejectedValueOnce(new Error("down"));
    expect((await settlementPrices()).size).toBe(0);
    fetchPricesByIds.mockResolvedValueOnce(quotes(1, 1));
    expect((await settlementPrices()).size).toBe(2);
  });
});
