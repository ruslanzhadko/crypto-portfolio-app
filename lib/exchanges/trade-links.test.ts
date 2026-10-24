import { describe, expect, it } from "vitest";
import { exchangeTradeUrl } from "./trade-links";

describe("exchange trade links", () => {
  it("opens the coin's USDT market on the exchange that holds it", () => {
    expect(exchangeTradeUrl("binance", "neko")).toBe("https://www.binance.com/en/trade/NEKO_USDT?type=spot");
    expect(exchangeTradeUrl("bybit", "WLD")).toBe("https://www.bybit.com/en/trade/spot/WLD/USDT");
    expect(exchangeTradeUrl("okx", "STRK")).toBe("https://www.okx.com/trade-spot/strk-usdt");
    expect(exchangeTradeUrl("gate", "NEKO")).toBe("https://www.gate.com/trade/NEKO_USDT");
    expect(exchangeTradeUrl("hyperliquid", "HYPE")).toBe("https://app.hyperliquid.xyz/trade/HYPE");
  });

  it("has no page for the quote coin, odd tickers or unknown exchanges", () => {
    expect(exchangeTradeUrl("binance", "USDT")).toBeNull();
    expect(exchangeTradeUrl("binance", "BTC/USDT")).toBeNull();
    expect(exchangeTradeUrl("kraken", "BTC")).toBeNull();
  });
});
