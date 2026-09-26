import { describe, expect, it } from "vitest";
import { extractTelegramLinks, resolveFeedTextLinks } from "@/lib/feed/links";

describe("Telegram feed links", () => {
  it("finds visible URLs in existing post text", () => {
    expect(resolveFeedTextLinks("Read https://example.com/news.")).toEqual([
      { offset: 5, length: 24, url: "https://example.com/news" },
    ]);
  });

  it("keeps the target of a hidden Telegram text URL", () => {
    const text = "Open the report";
    expect(
      extractTelegramLinks(text, [
        {
          className: "MessageEntityTextUrl",
          offset: 9,
          length: 6,
          url: "https://example.com/report",
        },
      ]),
    ).toEqual([{ offset: 9, length: 6, url: "https://example.com/report" }]);
  });

  it("rejects unsafe hidden-link protocols", () => {
    expect(
      extractTelegramLinks("Open", [
        {
          className: "MessageEntityTextUrl",
          offset: 0,
          length: 4,
          url: "javascript:alert(1)",
        },
      ]),
    ).toEqual([]);
  });
});
