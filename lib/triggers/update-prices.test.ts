import { describe, expect, it } from "vitest";
import { createUpdatePricesCaller } from "./update-prices";

const env = {
  EXCHANGE_ACTIVITY_URL: "https://app.example/api/worker/activity",
  CRON_SECRET: "c".repeat(32),
} as unknown as NodeJS.ProcessEnv;

describe("update-prices caller", () => {
  it("is disabled without the cron secret", () => {
    expect(
      createUpdatePricesCaller({ EXCHANGE_ACTIVITY_URL: env.EXCHANGE_ACTIVITY_URL } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("posts to the site's cron route with the secret and summarises the result", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const caller = createUpdatePricesCaller(env, (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          walletsSynced: 2,
          pricesUpdated: 70,
          pricesWritten: 12,
          balancesRecalculated: 9,
          snapshotsCreated: 3,
          durationMs: 8123,
        }),
      };
    }) as unknown as typeof fetch)!;
    expect(await caller.run()).toBe(
      "wallets 2, prices 12/70 written, balances 9, snapshots 3, 8123 ms",
    );
    expect(calls[0]?.url).toBe("https://app.example/api/cron/update-prices");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${"c".repeat(32)}`,
    );
  });

  it("reports a failed response as an error", async () => {
    const caller = createUpdatePricesCaller(env, (async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch)!;
    await expect(caller.run()).rejects.toThrow("HTTP 401");
  });
});
