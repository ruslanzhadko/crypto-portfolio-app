import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  stored: [] as Array<{ direction: string; externalId: string; status: string; txHash: string | null; fee: { toFixed(): string } | null }>,
  upsert: vi.fn((args: unknown) => ({ upsert: args })),
  update: vi.fn((args: unknown) => Promise.resolve({ update: args })),
  transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    exchangeTransfer: { findMany: async () => db.stored, upsert: db.upsert },
    exchangeConnection: { update: db.update },
    $transaction: db.transaction,
  },
}));

import { syncTransfers } from "./transfer-store";
import { resetDepositWatch, takeDueDeposits } from "./deposit-watch";
import { ExchangeError, type ExchangeAdapter } from "./types";
import type { Transfer } from "./transfers";

const NOW = Date.UTC(2026, 9, 22);
const transfer = (over: Partial<Transfer> = {}): Transfer => ({
  direction: "deposit",
  asset: "USDT",
  network: "TRX",
  amount: "100",
  fee: null,
  address: null,
  txHash: "0x1",
  status: "completed",
  externalId: "d1",
  occurredAt: new Date(NOW - 1000),
  ...over,
});
const adapter = (rows: Transfer[] | Error): ExchangeAdapter & { since?: number } => {
  const a: ExchangeAdapter & { since?: number } = {
    verify: async () => ({}),
    fetch: async () => ({ accounts: [], failedAccounts: [] }),
    close: async () => {},
    transfers: async (since) => {
      a.since = since;
      if (rows instanceof Error) throw rows;
      return rows;
    },
  };
  return a;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.stored = [];
  resetDepositWatch();
});

describe("syncTransfers", () => {
  it("backfills a year the first time and writes only new or changed rows", async () => {
    db.stored = [
      { direction: "deposit", externalId: "d1", status: "completed", txHash: "0x1", fee: null },
      { direction: "withdrawal", externalId: "w1", status: "pending", txHash: null, fee: null },
    ];
    const a = adapter([
      transfer(),
      transfer({ direction: "withdrawal", externalId: "w1", status: "completed", txHash: "0x9" }),
      transfer({ externalId: "d2" }),
    ]);
    expect(await syncTransfers({ id: "c1", transfersAt: null }, a, NOW)).toBe("saved");
    expect(a.since).toBe(NOW - 365 * 86_400_000);
    expect(db.upsert).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { transfersAt: new Date(NOW), transfersError: null, transfersFrom: new Date(NOW - 365 * 86_400_000) },
    }));
  });

  it("reads again from a day before the last read, at most every 30 minutes", async () => {
    const a = adapter([]);
    const last = new Date(NOW - 3600_000);
    const from = new Date(NOW - 365 * 86_400_000);
    expect(await syncTransfers({ id: "c2", transfersAt: last, transfersFrom: from }, a, NOW)).toBe("saved");
    expect(a.since).toBe(last.getTime() - 86_400_000);
    expect(db.update.mock.calls[0]![0]).toMatchObject({ data: { transfersAt: new Date(NOW) } });
    expect((db.update.mock.calls[0]![0] as { data: object }).data).not.toHaveProperty("transfersFrom");
    expect(await syncTransfers({ id: "c2", transfersAt: last, transfersFrom: from }, a, NOW + 60_000)).toBe("skipped");
  });

  it("reads a year back once for accounts read only 90 days so far", async () => {
    const a = adapter([]);
    expect(await syncTransfers({ id: "c5", transfersAt: new Date(NOW - 3600_000), transfersFrom: null }, a, NOW)).toBe("saved");
    expect(a.since).toBe(NOW - 365 * 86_400_000);
  });

  it("settles for 90 days when the exchange refuses a year", async () => {
    const calls: number[] = [];
    const a: ExchangeAdapter = {
      ...adapter([]),
      transfers: async (since) => {
        calls.push(since);
        if (since < NOW - 100 * 86_400_000) throw new ExchangeError("INVALID_RESPONSE");
        return [];
      },
    };
    expect(await syncTransfers({ id: "c6", transfersAt: null }, a, NOW)).toBe("saved");
    expect(calls).toEqual([NOW - 365 * 86_400_000, NOW - 90 * 86_400_000]);
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ transfersFrom: new Date(NOW - 90 * 86_400_000) }),
    }));
  });

  it("records why history is unavailable without throwing", async () => {
    const a = adapter(new ExchangeError("INVALID_KEY"));
    expect(await syncTransfers({ id: "c3", transfersAt: null }, a, NOW)).toBe("failed");
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "c3" },
      data: { transfersError: "INVALID_KEY" },
    });
  });

  it("asks for a wallet sync on a new deposit or a withdrawal that just completed", async () => {
    const seen = { id: "c7", transfersAt: new Date(NOW - 3600_000), transfersFrom: new Date(0), userId: "u1" };
    db.stored = [{ direction: "withdrawal", externalId: "w1", status: "pending", txHash: null, fee: null }];
    await syncTransfers(seen, adapter([transfer({ direction: "withdrawal", externalId: "w1" })]), NOW);
    expect(takeDueDeposits(NOW)).toEqual([{ userId: "u1", walletId: null }]);

    resetDepositWatch();
    db.stored = [{ direction: "withdrawal", externalId: "w1", status: "completed", txHash: "0x1", fee: null }];
    await syncTransfers({ ...seen, id: "c8" }, adapter([transfer({ direction: "withdrawal", externalId: "w1" })]), NOW);
    expect(takeDueDeposits(NOW)).toEqual([]);
  });

  it("skips exchanges without history support", async () => {
    const { transfers: _omit, ...rest } = adapter([]);
    expect(await syncTransfers({ id: "c4", transfersAt: null }, rest, NOW)).toBe("skipped");
  });
});
