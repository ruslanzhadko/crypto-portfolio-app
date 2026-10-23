import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWalletSyncClient,
  looksLikeDeposit,
  noteDeposit,
  resetDepositWatch,
  stablecoinTotal,
  takeDueDeposits,
  WALLET_SYNC_COOLDOWN_MS,
} from "./deposit-watch";

afterEach(resetDepositWatch);

describe("deposit watch", () => {
  it("counts only stablecoin amounts", () => {
    expect(stablecoinTotal([{ symbol: "USDC", total: "1200.5" }, { symbol: "btc", total: "2" }, { symbol: "usdt", total: 10 }])).toBeCloseTo(1210.5, 9);
  });

  it("treats a large stablecoin increase as a deposit, not small PnL or a decrease", () => {
    expect(looksLikeDeposit(87, 1297)).toBe(true);
    expect(looksLikeDeposit(0, 60)).toBe(true);
    expect(looksLikeDeposit(10_000, 10_040)).toBe(false); // below $50
    expect(looksLikeDeposit(10_000, 10_150)).toBe(false); // 1.5% realized PnL
    expect(looksLikeDeposit(1_000, 500)).toBe(false);
  });

  it("asks for a sync at most once per cooldown and keeps later signals queued", () => {
    noteDeposit("u1", "w1");
    expect(takeDueDeposits(1_000_000)).toEqual([{ userId: "u1", walletId: "w1" }]);
    noteDeposit("u1", "w1");
    expect(takeDueDeposits(1_000_000 + 60_000)).toEqual([]);
    expect(takeDueDeposits(1_000_000 + WALLET_SYNC_COOLDOWN_MS)).toEqual([{ userId: "u1", walletId: "w1" }]);
  });

  it("widens to all wallets when two signals name different wallets", () => {
    noteDeposit("u2", "w1");
    noteDeposit("u2", null);
    expect(takeDueDeposits()).toEqual([{ userId: "u2", walletId: null }]);
  });

  it("the client posts the request with the worker secret and never throws", async () => {
    const env = { EXCHANGE_ACTIVITY_URL: "https://app.example/api/worker/activity", EXCHANGE_WORKER_SIGNAL_SECRET: "s".repeat(40) } as unknown as NodeJS.ProcessEnv;
    const fetchImpl = vi.fn(async () => ({ ok: true }) as Response);
    expect(await createWalletSyncClient(env, fetchImpl as unknown as typeof fetch)!.request("u1", null)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.example/api/worker/wallet-sync");
    expect(JSON.parse(String(init.body))).toEqual({ userId: "u1" });
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await createWalletSyncClient(env, failing as unknown as typeof fetch)!.request("u1", "w1")).toBe(false);
    expect(createWalletSyncClient({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
