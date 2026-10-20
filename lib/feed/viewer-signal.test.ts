import { describe, expect, it, vi } from "vitest";
import { createFeedViewerSignal } from "./viewer-signal";

const env = {
  EXCHANGE_ACTIVITY_URL: "https://example.test/api/worker/activity",
  EXCHANGE_WORKER_SIGNAL_SECRET: "s".repeat(40),
} as unknown as NodeJS.ProcessEnv;
const reply = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response);

describe("createFeedViewerSignal", () => {
  it("is disabled without configuration", () => {
    expect(createFeedViewerSignal({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("reports a viewer only while feedUntil is in the future", async () => {
    const now = 1_000_000;
    const watched = createFeedViewerSignal(env, reply({ feedUntil: now + 5_000 }))!;
    expect(await watched.poll(now)).toBe(true);
    const idle = createFeedViewerSignal(env, reply({ feedUntil: null }))!;
    expect(await idle.poll(now)).toBe(false);
  });

  it("treats an unavailable signal as watched so posts are not delayed", async () => {
    const failing = createFeedViewerSignal(env, reply({}, false))!;
    expect(await failing.poll()).toBe(true);
    const malformed = createFeedViewerSignal(env, reply({ feedUntil: "x" }))!;
    expect(await malformed.poll()).toBe(true);
  });
});
