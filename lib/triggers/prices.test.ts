import { describe, expect, it } from "vitest";
import { combinePrices, fetchBinanceTickers, mapToBinance } from "./prices";

describe("price alert prices", () => {
  it("keeps only valid USDT pairs from the Binance ticker", async () => {
    const tickers = await fetchBinanceTickers(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { symbol: "BTCUSDT", price: "107000.5" },
        { symbol: "ETHBTC", price: "0.035" },
        { symbol: "BADUSDT", price: "nope" },
      ],
    }));
    expect([...tickers]).toEqual([["BTCUSDT", 107000.5]]);
  });

  it("maps a coin to Binance only when both prices agree", () => {
    const tickers = new Map([
      ["BTCUSDT", 107000],
      ["ACTUSDT", 0.2],
    ]);
    const mapping = mapToBinance(
      [
        { tokenId: "bitcoin", symbol: "btc", price: 106900 },
        // Same ticker, different coin: prices disagree, so it stays on CoinGecko.
        { tokenId: "act-other-chain", symbol: "act", price: 3.5 },
        { tokenId: "no-pair", symbol: "zzz", price: 1 },
      ],
      tickers,
    );
    expect([...mapping]).toEqual([["bitcoin", "BTCUSDT"]]);
  });

  it("uses Binance where mapped and CoinGecko otherwise", () => {
    const result = combinePrices(
      ["bitcoin", "rare-coin", "unknown"],
      new Map([["bitcoin", "BTCUSDT"]]),
      new Map([["BTCUSDT", 107100]]),
      new Map([
        ["bitcoin", 106000],
        ["rare-coin", 0.5],
      ]),
    );
    expect([...result]).toEqual([
      ["bitcoin", 107100],
      ["rare-coin", 0.5],
    ]);
  });
});
