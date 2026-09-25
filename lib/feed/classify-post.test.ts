import { describe, expect, it } from "vitest";
import { classifyFeedPost } from "./classify-post";

describe("classifyFeedPost", () => {
  it("parses a rapid MEXC price anomaly", () => {
    expect(
      classifyFeedPost("HNT -4.55% in 5 secs!\nMEXC | Limit ~`$19490`"),
    ).toMatchObject({
      type: "PRICE_ANOMALY",
      symbol: "HNT",
      direction: "DOWN",
      changePercent: -4.55,
      intervalSeconds: 5,
      limitUsd: 19490,
      exchange: "MEXC",
    });
  });

  it("parses a liquidation", () => {
    expect(
      classifyFeedPost("#BTC Liquidated Short: $2.7M at $75399.30 [Binance]"),
    ).toMatchObject({
      type: "LIQUIDATION",
      symbol: "BTC",
      direction: "SHORT",
      amountUsd: 2_700_000,
      priceUsd: 75399.3,
      exchange: "Binance",
    });
  });

  it("recognizes exchange listings", () => {
    expect(
      classifyFeedPost(
        "OKX LISTING: OKX to list FLUID (Fluid) for spot trading",
      ),
    ).toMatchObject({
      type: "LISTING",
      exchange: "OKX",
    });
  });
});
