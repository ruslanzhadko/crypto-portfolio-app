import { describe, expect, it } from "vitest";
import { displaySymbol } from "./display-symbol";

describe("displaySymbol", () => {
  it("brings every exchange to one form", () => {
    expect(displaySymbol("LYN_USDT")).toBe("LYNUSDT");
    expect(displaySymbol("BTC-USDT-SWAP")).toBe("BTCUSDT");
    expect(displaySymbol("1000PEPEUSDT")).toBe("1000PEPEUSDT");
    expect(displaySymbol("ETH/USDC")).toBe("ETHUSDC");
    expect(displaySymbol("BTC")).toBe("BTC");
  });
});
