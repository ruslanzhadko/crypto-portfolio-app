import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ value: undefined as unknown, fail: false }));
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async () => {
      if (cache.fail) throw new Error("down");
      return cache.value;
    },
    set: async (_key: string, value: unknown) => {
      cache.value = value;
    },
  }),
}));

import {
  parseViewRequests,
  positionViewCooling,
  readPositionViews,
  requestPositionView,
  VIEW_COOLDOWN_MS,
} from "./view-requests";

const T0 = 1_000_000;
const ask = (chatId: number, messageId = 1, at = T0) =>
  requestPositionView({ userId: "u", chatId, messageId }, at);

beforeEach(() => {
  cache.value = undefined;
  cache.fail = false;
});

describe("position view requests", () => {
  it("keeps one request per chat and every other chat's", async () => {
    await ask(1);
    await ask(2);
    await ask(1, 2, T0 + 1000);
    const requests = await readPositionViews(T0 + 1000);
    expect(requests.map((r) => [r.chatId, r.messageId])).toEqual([[2, 1], [1, 2]]);
  });

  it("cools down per chat and then lets a new request through", async () => {
    await ask(1);
    expect(await positionViewCooling(1, T0 + 1000)).toBe(true);
    expect(await positionViewCooling(2, T0 + 1000)).toBe(false);
    expect(await positionViewCooling(1, T0 + VIEW_COOLDOWN_MS)).toBe(false);
  });

  it("drops expired and malformed entries", async () => {
    await ask(1);
    expect(await readPositionViews(T0 + 60_000)).toEqual([]);
    expect(parseViewRequests({ viewer: 1 })).toEqual([]);
    expect(parseViewRequests([{ id: "x" }, null])).toEqual([]);
  });

  it("reports a lost signal instead of promising a refresh", async () => {
    cache.fail = true;
    expect(await ask(1)).toBe(false);
    expect(await positionViewCooling(1, T0)).toBe(false);
  });
});
