import { describe, expect, it } from "vitest";
import {
  combinePrices,
  fetchBinanceTickers,
  fetchGateTickers,
  mapToVenues,
  pairsByVenue,
  type FetchLike,
} from "./prices";

const reply = (body: unknown, seen: string[] = []): FetchLike =>
  async (url) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => body };
  };

describe("price alert prices", () => {
  it("keeps only valid USDT pairs from the Binance ticker", async () => {
    const tickers = await fetchBinanceTickers(
      reply([
        { symbol: "BTCUSDT", price: "107000.5" },
        { symbol: "ETHBTC", price: "0.035" },
        { symbol: "BADUSDT", price: "nope" },
      ]),
    );
    expect([...tickers]).toEqual([["BTCUSDT", 107000.5]]);
  });

  it("asks Binance only for the pairs in use", async () => {
    const seen: string[] = [];
    await fetchBinanceTickers(reply([], seen), ["BTCUSDT", "ETHUSDT"]);
    expect(decodeURIComponent(seen[0]!)).toContain('symbols=["BTCUSDT","ETHUSDT"]');
    expect(await fetchBinanceTickers(reply([], seen), [])).toEqual(new Map());
    expect(seen).toHaveLength(1);
  });

  it("reads Gate pairs under the Binance-style key", async () => {
    const seen: string[] = [];
    const all = await fetchGateTickers(
      reply([
        { currency_pair: "LYN_USDT", last: "0.0146" },
        { currency_pair: "LYN_BTC", last: "0.0000001" },
      ]),
    );
    expect([...all]).toEqual([["LYNUSDT", 0.0146]]);
    const one = await fetchGateTickers(reply([{ currency_pair: "LYN_USDT", last: "0.015" }], seen), ["LYNUSDT"]);
    expect(seen[0]).toContain("currency_pair=LYN_USDT");
    expect(one.get("LYNUSDT")).toBe(0.015);
  });

  it("prefers Binance, falls back to Gate, and trusts a pair only when prices agree", () => {
    const mapping = mapToVenues(
      [
        { tokenId: "bitcoin", symbol: "btc", price: 106900 },
        { tokenId: "lyn", symbol: "lyn", price: 0.0147 },
        // Same ticker, different coin: prices disagree, so it stays on CoinGecko.
        { tokenId: "act-other-chain", symbol: "act", price: 3.5 },
      ],
      new Map([
        ["BTCUSDT", 107000],
        ["ACTUSDT", 0.2],
      ]),
      new Map([
        ["BTCUSDT", 107010],
        ["LYNUSDT", 0.0146],
      ]),
    );
    expect([...mapping]).toEqual([
      ["bitcoin", { venue: "binance", pair: "BTCUSDT" }],
      ["lyn", { venue: "gate", pair: "LYNUSDT" }],
    ]);
    expect(pairsByVenue(mapping)).toEqual({ binance: ["BTCUSDT"], gate: ["LYNUSDT"] });
  });

  it("uses the mapped exchange and CoinGecko otherwise", () => {
    const result = combinePrices(
      ["bitcoin", "lyn", "rare-coin", "unknown"],
      new Map([
        ["bitcoin", { venue: "binance" as const, pair: "BTCUSDT" }],
        ["lyn", { venue: "gate" as const, pair: "LYNUSDT" }],
      ]),
      { binance: new Map([["BTCUSDT", 107100]]), gate: new Map([["LYNUSDT", 0.0149]]) },
      new Map([
        ["bitcoin", 106000],
        ["rare-coin", 0.5],
      ]),
    );
    expect([...result]).toEqual([
      ["bitcoin", 107100],
      ["lyn", 0.0149],
      ["rare-coin", 0.5],
    ]);
  });
});
