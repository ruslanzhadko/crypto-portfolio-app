import { describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => void store.set(key, value),
  }),
}));

import { markAlertFired, readLatestAlert } from "./latest";
import { createAlertSignalClient } from "./signal-client";

describe("latest alert signal", () => {
  it("reads the log once on a cache miss, then answers from the cache", async () => {
    const load = vi.fn(async () => 100);
    expect(await readLatestAlert("u1", load)).toBe(100);
    expect(await readLatestAlert("u1", load)).toBe(100);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("remembers that a user has no alerts yet", async () => {
    const load = vi.fn(async () => null);
    expect(await readLatestAlert("u2", load)).toBeNull();
    expect(await readLatestAlert("u2", load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a fired alert replaces the cached moment without reading the log", async () => {
    await markAlertFired("u2", 500);
    const load = vi.fn(async () => 1);
    expect(await readLatestAlert("u2", load)).toBe(500);
    expect(load).not.toHaveBeenCalled();
  });

  it("the VM client posts the alert with the worker secret and never throws", async () => {
    const env = {
      EXCHANGE_ACTIVITY_URL: "https://app.example/api/worker/activity",
      EXCHANGE_WORKER_SIGNAL_SECRET: "s".repeat(40),
    } as unknown as NodeJS.ProcessEnv;
    const fetchImpl = vi.fn(async () => ({ ok: true }) as Response);
    await createAlertSignalClient(env, fetchImpl as unknown as typeof fetch)!.fired("u1", 42);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.example/api/worker/alert");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${"s".repeat(40)}` });
    expect(JSON.parse(String(init.body))).toEqual({ userId: "u1", at: 42 });
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(createAlertSignalClient(env, failing as unknown as typeof fetch)!.fired("u1", 1)).resolves.toBeUndefined();
    expect(createAlertSignalClient({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
