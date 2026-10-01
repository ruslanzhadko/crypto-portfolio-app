import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    telegramFeedPost: { findMany: vi.fn() },
    telegramFeedSource: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { GET } from "./route";

const findPosts = vi.mocked(prisma.telegramFeedPost.findMany);
const findSources = vi.mocked(prisma.telegramFeedSource.findMany);

function albumMessage(id: string, messageId: number, text = "") {
  return {
    id,
    sourceId: "source-a",
    telegramMessageId: messageId,
    text,
    mediaUrl: `/api/feed/media/${id}`,
    metadata: { telegramAlbumId: "telegram-group-1", links: [] },
    publishedAt: new Date("2026-10-01T10:00:00Z"),
    type: text ? "ANALYSIS" : "OTHER",
    source: { username: "ludoslan", title: "Ludoslan", avatarUrl: null },
    telegramUrl: `https://t.me/ludoslan/${messageId}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findSources.mockResolvedValue([]);
});

describe("GET /api/feed albums", () => {
  it("returns one complete album even when the page contains only its caption", async () => {
    const caption = albumMessage("caption", 102, "One post with three photos");
    const first = albumMessage("first", 101);
    const third = albumMessage("third", 103);
    findPosts
      .mockResolvedValueOnce([caption] as never)
      .mockResolvedValueOnce([third, caption, first] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/feed?limit=1&type=ANALYSIS"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({
      id: "album:source-a:telegram-group-1",
      text: "One post with three photos",
      mediaUrls: [
        "/api/feed/media/first",
        "/api/feed/media/caption",
        "/api/feed/media/third",
      ],
    });
    expect(body.nextCursor).toBe("2026-10-01T10:00:00.000Z");
    expect(findPosts).toHaveBeenCalledTimes(2);
  });
});
