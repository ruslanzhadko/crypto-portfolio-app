import { describe, expect, it } from "vitest";
import { groupTelegramAlbums } from "./albums";

function post(
  id: string,
  messageId: number,
  text: string,
  albumId: string | null,
  sourceId = "source-a",
) {
  return {
    id,
    sourceId,
    telegramMessageId: messageId,
    text,
    mediaUrl: `/api/feed/media/${id}`,
    metadata: (albumId ? { telegramAlbumId: albumId } : {}) as Record<string, unknown>,
    publishedAt: new Date("2026-10-01T10:00:00Z"),
  };
}

describe("groupTelegramAlbums", () => {
  it("renders one caption and ordered photos for messages from the same album", () => {
    const posts = [
      post("third", 103, "", "group-1"),
      post("second", 102, "Main caption", "group-1"),
      post("first", 101, "", "group-1"),
    ];

    expect(groupTelegramAlbums(posts)).toEqual([
      expect.objectContaining({
        id: "album:source-a:group-1",
        text: "Main caption",
        mediaUrls: [
          "/api/feed/media/first",
          "/api/feed/media/second",
          "/api/feed/media/third",
        ],
      }),
    ]);
  });

  it("does not merge albums from different channels or independent posts", () => {
    const posts = [
      post("a", 101, "A", "group-1"),
      post("b", 101, "B", "group-1", "source-b"),
      post("c", 102, "C", null),
    ];

    expect(groupTelegramAlbums(posts)).toHaveLength(3);
  });

  it("preserves multiple captions and shifts their link offsets", () => {
    const first = post("a", 101, "First", "group-1");
    const second = post("b", 102, "More", "group-1");
    second.metadata = {
      telegramAlbumId: "group-1",
      links: [{ offset: 0, length: 4, url: "https://example.com" }],
    };

    expect(groupTelegramAlbums([second, first])[0]).toEqual(
      expect.objectContaining({
        text: "First\n\nMore",
        links: [{ offset: 7, length: 4, url: "https://example.com/" }],
      }),
    );
  });
});
