import { describe, expect, it } from "vitest";
import { parseTelegramUsername } from "./telegram-source";

describe("parseTelegramUsername", () => {
  it.each([
    ["@BigLiquid", "bigliquid"],
    ["https://t.me/BWEnews_RU", "bwenews_ru"],
    ["t.me/makerprod/123", "makerprod"],
    [" ua_cryptomania ", "ua_cryptomania"],
  ])("normalizes %s", (input, expected) => {
    expect(parseTelegramUsername(input)).toBe(expected);
  });

  it.each(["", "https://example.com/channel", "t.me/+invite", "bad-name"])(
    "rejects %s",
    (input) => {
      expect(parseTelegramUsername(input)).toBeNull();
    },
  );
});
