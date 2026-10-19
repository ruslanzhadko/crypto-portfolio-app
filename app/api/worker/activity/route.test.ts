import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async () => ({
      viewer: { since: 1, until: Date.now() + 60_000 },
      gone: { since: 1, until: Date.now() - 1 },
    }),
    set: async () => {},
  }),
}));

import { GET } from "./route";

const secret = "w".repeat(40);
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/worker/activity", () => {
  it("rejects requests without the worker secret", async () => {
    vi.stubEnv("EXCHANGE_WORKER_SIGNAL_SECRET", secret);
    const res = await GET(new NextRequest("http://localhost/api/worker/activity"));
    expect(res.status).toBe(401);
  });

  it("returns current viewers without caching", async () => {
    vi.stubEnv("EXCHANGE_WORKER_SIGNAL_SECRET", secret);
    const res = await GET(
      new NextRequest("http://localhost/api/worker/activity", {
        headers: { Authorization: `Bearer ${secret}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).users).toEqual(["viewer"]);
  });
});
