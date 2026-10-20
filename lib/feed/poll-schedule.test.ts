import { describe, expect, it } from "vitest";
import { FEED_FAST_POLL_MS, feedPollDelay } from "./poll-schedule";

const minute = 60_000;
describe("feedPollDelay", () => {
  it("polls fast for an attentive reader and slows down with idleness", () => {
    expect(feedPollDelay(0)).toBe(FEED_FAST_POLL_MS);
    expect(feedPollDelay(9 * minute)).toBe(FEED_FAST_POLL_MS);
    expect(feedPollDelay(10 * minute)).toBe(60_000);
    expect(feedPollDelay(29 * minute)).toBe(60_000);
  });

  it("stops for a tab left untouched for half an hour", () => {
    expect(feedPollDelay(30 * minute)).toBeNull();
    expect(feedPollDelay(5 * 60 * minute)).toBeNull();
  });
});
