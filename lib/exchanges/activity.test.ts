import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  }),
}));

import {
  markExchangeActivity,
  pruneActivity,
  readExchangeActivity,
  withinActivityGrace,
  workerSignalAuthorized,
} from "./activity";

beforeEach(() => store.clear());

describe("exchange activity signal", () => {
  it("drops expired and malformed entries", () => {
    expect(
      pruneActivity(
        {
          a: { since: 1, until: 2_000 },
          b: { since: 1, until: 500 },
          c: { since: "x", until: 9_000 },
          d: null,
        },
        1_000,
      ),
    ).toEqual({ a: { since: 1, until: 2_000 } });
    expect(pruneActivity(["a"], 0)).toEqual({});
    expect(pruneActivity(null, 0)).toEqual({});
  });

  it("records viewers, keeps the visit start and expires them", async () => {
    const t0 = 1_000_000;
    expect(await markExchangeActivity("user-a", t0)).toBe(t0);
    // Within a minute the same instance does not write again.
    expect(await markExchangeActivity("user-a", t0 + 30_000)).toBe(t0);
    expect(await markExchangeActivity("user-b", t0 + 30_000)).toBe(t0 + 30_000);
    // A later write extends the visit but keeps when it began.
    expect(await markExchangeActivity("user-a", t0 + 90_000)).toBe(t0);
    const now = await readExchangeActivity(t0 + 100_000);
    expect(Object.keys(now).sort()).toEqual(["user-a", "user-b"]);
    expect(Object.keys(await readExchangeActivity(t0 + 3_600_000))).toEqual(
      [],
    );
  });

  it("gives a short grace period after a viewer arrives", () => {
    expect(withinActivityGrace(1_000, 1_000 + 60_000)).toBe(true);
    expect(withinActivityGrace(1_000, 1_000 + 300_000)).toBe(false);
  });

  it("authorizes the worker only with the configured long secret", () => {
    const secret = "s".repeat(40);
    vi.stubEnv("EXCHANGE_WORKER_SIGNAL_SECRET", secret);
    expect(workerSignalAuthorized(`Bearer ${secret}`)).toBe(true);
    expect(workerSignalAuthorized(`Bearer ${secret}x`)).toBe(false);
    expect(workerSignalAuthorized(secret)).toBe(false);
    expect(workerSignalAuthorized(null)).toBe(false);
    vi.stubEnv("EXCHANGE_WORKER_SIGNAL_SECRET", "short");
    expect(workerSignalAuthorized("Bearer short")).toBe(false);
    vi.unstubAllEnvs();
  });
});
