import { describe, expect, it } from "vitest";
import { FEED_FAST_POLL_MS, feedPollDelay } from "./poll-schedule";

const minute = 60_000;
describe("feedPollDelay", () => {
  it("polls fast for an attentive reader and slows down with idleness", () => {
    expect(feedPollDelay(0)).toBe(FEED_FAST_POLL_MS);
    expect(feedPollDelay(9 * minute)).toBe(FEED_FAST_POLL_MS);
    expect(feedPollDelay(10 * minute)).toBe(15_000);
    expect(feedPollDelay(30 * minute)).toBe(60_000);
  });

  it("stops for a tab left open for hours", () => {
    expect(feedPollDelay(119 * minute)).toBe(60_000);
    expect(feedPollDelay(120 * minute)).toBeNull();
  });
});
