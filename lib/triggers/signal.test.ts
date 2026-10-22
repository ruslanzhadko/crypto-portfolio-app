import { describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => void store.set(key, value),
  }),
}));

import {
  createTriggersVersionClient,
  markTriggersChanged,
  readTriggersVersion,
} from "./signal";

const env = {
  EXCHANGE_ACTIVITY_URL: "https://app.example/api/worker/activity",
  EXCHANGE_WORKER_SIGNAL_SECRET: "s".repeat(40),
} as unknown as NodeJS.ProcessEnv;
const respond = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("price trigger change signal", () => {
  it("stores the moment of the last change", async () => {
    expect(await readTriggersVersion()).toBeNull();
    await markTriggersChanged(123);
    expect(await readTriggersVersion()).toBe(123);
  });

  it("is disabled without the activity endpoint", () => {
    expect(createTriggersVersionClient({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("reads the version and treats failures as unknown", async () => {
    expect(await createTriggersVersionClient(env, respond({ triggersVersion: 5 }))!.poll()).toBe(5);
    expect(await createTriggersVersionClient(env, respond({ triggersVersion: null }))!.poll()).toBeNull();
    expect(await createTriggersVersionClient(env, respond({}, false))!.poll()).toBeNull();
  });
});
