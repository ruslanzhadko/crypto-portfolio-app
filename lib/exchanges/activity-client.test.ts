import { describe, expect, it, vi } from "vitest";
import { createActivityClient } from "./activity-client";
import { IDLE_SYNC_MS, nextIdleSlot, staleLimits } from "./config";

const env = {
  EXCHANGE_ACTIVITY_URL: "https://app.example/api/worker/activity",
  EXCHANGE_WORKER_SIGNAL_SECRET: "x".repeat(40),
} as unknown as NodeJS.ProcessEnv;

function respond(users: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 503,
    json: async () => ({ users }),
  })) as unknown as typeof fetch;
}

describe("worker activity client", () => {
  it("is disabled without configuration", () => {
    expect(createActivityClient({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("reports viewers, throttles polls and forgets users who left", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: ["a", "b"] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: ["b"] }) });
    const client = createActivityClient(env, fetchImpl as unknown as typeof fetch)!;
    expect([...(await client.poll(100_000))].sort()).toEqual(["a", "b"]);
    expect(client.isActive("a")).toBe(true);
    // Too soon: no second request.
    await client.poll(105_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([...(await client.poll(111_000))]).toEqual(["b"]);
    expect(client.isActive("a")).toBe(false);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers.Authorization).toBe(`Bearer ${"x".repeat(40)}`);
  });

  it("hands out each position view request once", async () => {
    const view = { id: "r1", userId: "u", chatId: 1, messageId: 2, at: 100_000 };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ users: [], positionViews: [view] }),
    }));
    const client = createActivityClient(env, fetchImpl as unknown as typeof fetch)!;
    await client.poll(100_000);
    expect(client.takePositionViews()).toEqual([view]);
    expect(client.takePositionViews()).toEqual([]);
    // Still listed at the next poll: not handed out again.
    await client.poll(111_000);
    expect(client.takePositionViews()).toEqual([]);
  });

  it("keeps the last viewers through a failed poll until they expire", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: ["a"] }) })
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createActivityClient(env, fetchImpl as unknown as typeof fetch)!;
    await client.poll(0);
    expect([...(await client.poll(20_000))]).toEqual(["a"]);
    expect([...(await client.poll(20 * 60_000))]).toEqual([]);
    error.mockRestore();
  });

  it("rejects malformed responses without dropping viewers", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createActivityClient(env, respond("nope"))!;
    expect([...(await client.poll(0))]).toEqual([]);
    error.mockRestore();
  });

  it("sends the preview protection bypass when configured", async () => {
    const fetchImpl = respond([]);
    const client = createActivityClient(
      { ...env, EXCHANGE_ACTIVITY_BYPASS: "bypass" } as unknown as NodeJS.ProcessEnv,
      fetchImpl,
    )!;
    await client.poll(0);
    const init = vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-vercel-protection-bypass"]).toBe("bypass");
  });
});

describe("idle scheduling helpers", () => {
  it("aligns idle slots to the wall clock", () => {
    const slot = nextIdleSlot(IDLE_SYNC_MS * 10 + 5);
    expect(slot.getTime()).toBe(IDLE_SYNC_MS * 11);
    expect(nextIdleSlot(IDLE_SYNC_MS * 10).getTime()).toBe(IDLE_SYNC_MS * 11);
  });

  it("relaxes staleness to an idle slot only on request", () => {
    expect(staleLimits(false)).toEqual({ spot: 300_000, futures: 90_000 });
    expect(staleLimits(true).futures).toBeGreaterThan(IDLE_SYNC_MS);
  });
});
