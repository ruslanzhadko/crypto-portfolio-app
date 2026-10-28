import { describe, expect, it } from "vitest";
import {
  bybitLedgerResult,
  incomeLedgerResult,
  type ClosedInput,
} from "./closed-result";

const since = Date.UTC(2026, 9, 28, 9, 0);
const lastSeenAt = since + 3600_000;
const input: ClosedInput = {
  symbol: "PREDICTUSDT",
  base: "PREDICT",
  settle: "USDT",
  positionKey: "PREDICTUSDT:BOTH",
  since,
  lastSeenAt,
  otherLeg: false,
};
const income = (
  incomeType: string,
  value: string,
  time: number,
  asset = "USDT",
) => ({
  symbol: "PREDICTUSDT",
  incomeType,
  income: value,
  asset,
  time,
  tranId: `${incomeType}-${time}-${value}`,
});
const ledger =
  (...rows: Record<string, unknown>[]) =>
  async () =>
    rows;

describe("incomeLedgerResult (Binance, Aster API, BingX)", () => {
  it("sums realized PnL, funding and fees of the cycle once the closing trade is in", async () => {
    const read = ledger(
      income("COMMISSION", "-0.70", since),
      income("REALIZED_PNL", "12.5", since + 600_000), // partial close
      income("COMMISSION", "-0.30", since + 600_000),
      income("FUNDING_FEE", "-1.2", since + 1800_000),
      income("REALIZED_PNL", "-30.4", lastSeenAt + 4_000), // the close
      income("COMMISSION", "-0.90", lastSeenAt + 4_000),
      income("REALIZED_PNL", "99", since - 1), // previous cycle
      { ...income("REALIZED_PNL", "50", lastSeenAt), symbol: "BTCUSDT" },
    );
    expect(await incomeLedgerResult(input, read, lastSeenAt + 30_000)).toBe(
      "-21",
    );
  });

  it("waits while the closing trade is not in the ledger yet", async () => {
    const read = ledger(income("REALIZED_PNL", "12.5", since + 600_000));
    expect(
      await incomeLedgerResult(input, read, lastSeenAt + 30_000),
    ).toBeNull();
  });

  it("gives up on a fee in another asset, another open leg or a full page", async () => {
    const close = income("REALIZED_PNL", "1", lastSeenAt + 1000);
    expect(
      await incomeLedgerResult(
        input,
        ledger(close, income("COMMISSION", "-0.01", lastSeenAt, "BNB")),
        lastSeenAt + 30_000,
      ),
    ).toBeNull();
    expect(
      await incomeLedgerResult(
        { ...input, otherLeg: true },
        ledger(close),
        lastSeenAt + 30_000,
      ),
    ).toBeNull();
    const full = Array.from({ length: 1000 }, (_, i) =>
      income("FUNDING_FEE", "0", since + i),
    );
    expect(
      await incomeLedgerResult(
        input,
        ledger(...full, close),
        lastSeenAt + 30_000,
      ),
    ).toBeNull();
  });
});

describe("bybitLedgerResult", () => {
  const bybit = { ...input, positionKey: "PREDICTUSDT:0" };
  const row = (type: string, change: string, time: number) => ({
    symbol: "PREDICTUSDT",
    currency: "USDT",
    type,
    change,
    transactionTime: String(time),
  });

  it("sums the wallet change of trades and funding settlements", async () => {
    const read = ledger(
      row("TRADE", "-0.66", since),
      row("SETTLEMENT", "0.12", since + 1800_000),
      row("TRADE", "45.1", lastSeenAt + 2_000),
      row("TRANSFER_IN", "1000", since + 10),
    );
    expect(await bybitLedgerResult(bybit, read, lastSeenAt + 30_000)).toBe(
      "44.56",
    );
  });

  it("does not attribute hedge legs", async () => {
    const read = ledger(row("TRADE", "1", lastSeenAt + 2_000));
    expect(
      await bybitLedgerResult({ ...bybit, positionKey: "PREDICTUSDT:1" }, read),
    ).toBeNull();
  });
});
