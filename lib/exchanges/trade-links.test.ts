import { describe, expect, it } from "vitest";
import { exchangeTradeUrl } from "./trade-links";

describe("exchange trade links", () => {
  it("opens the spot market for spot and unified accounts", () => {
    expect(exchangeTradeUrl("binance", "neko")).toBe("https://www.binance.com/en/trade/NEKO_USDT?type=spot");
    expect(exchangeTradeUrl("bybit", "WLD", "unified")).toBe("https://www.bybit.com/en/trade/spot/WLD/USDT");
    expect(exchangeTradeUrl("okx", "STRK", "spot")).toBe("https://www.okx.com/trade-spot/strk-usdt");
    expect(exchangeTradeUrl("gate", "NEKO")).toBe("https://www.gate.com/trade/NEKO_USDT");
  });

  it("opens the perpetual for futures accounts and perpetual-only venues", () => {
    expect(exchangeTradeUrl("binance", "BTC", "futures")).toBe("https://www.binance.com/en/futures/BTCUSDT");
    expect(exchangeTradeUrl("gate", "ETH", "futures")).toBe("https://www.gate.com/futures/USDT/ETH_USDT");
    expect(exchangeTradeUrl("okx", "SOL", "futures")).toBe("https://www.okx.com/trade-swap/sol-usdt-swap");
    expect(exchangeTradeUrl("hyperliquid", "HYPE", "spot")).toBe("https://app.hyperliquid.xyz/trade/HYPE");
  });

  it("has no page for the quote coin, odd tickers or unknown exchanges", () => {
    expect(exchangeTradeUrl("binance", "USDT")).toBeNull();
    expect(exchangeTradeUrl("binance", "BTC/USDT")).toBeNull();
    expect(exchangeTradeUrl("kraken", "BTC")).toBeNull();
  });
});
