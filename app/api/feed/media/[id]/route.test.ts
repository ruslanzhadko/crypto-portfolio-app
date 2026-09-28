import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    telegramFeedMedia: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { GET } from "./route";

const mockFindUnique = vi.mocked(prisma.telegramFeedMedia.findUnique);
const params = { params: { id: "cm123" } };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/feed/media/[id]", () => {
  it("rejects an invalid post id without querying the database", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/feed/media/%21"),
      { params: { id: "!" } },
    );
    expect(response.status).toBe(404);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the post has no stored media", async () => {
    mockFindUnique.mockResolvedValue(null);
    const response = await GET(
      new NextRequest("http://localhost/api/feed/media/cm123"),
      params,
    );
    expect(response.status).toBe(404);
  });

  it("serves image bytes with immutable caching and nosniff", async () => {
    mockFindUnique.mockResolvedValue({
      postId: "cm123",
      data: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mimeType: "image/jpeg",
      byteSize: 4,
      createdAt: new Date("2026-09-29T00:00:00Z"),
      updatedAt: new Date("2026-09-29T00:00:00Z"),
    });
    const response = await GET(
      new NextRequest("http://localhost/api/feed/media/cm123"),
      params,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      Uint8Array.from([0xff, 0xd8, 0xff, 0x00]),
    );
  });

  it("returns 304 for a matching ETag", async () => {
    mockFindUnique.mockResolvedValue({
      postId: "cm123",
      data: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mimeType: "image/jpeg",
      byteSize: 4,
      createdAt: new Date("2026-09-29T00:00:00Z"),
      updatedAt: new Date("2026-09-29T00:00:00Z"),
    });
    const first = await GET(
      new NextRequest("http://localhost/api/feed/media/cm123"),
      params,
    );
    const response = await GET(
      new NextRequest("http://localhost/api/feed/media/cm123", {
        headers: { "If-None-Match": first.headers.get("etag")! },
      }),
      params,
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });
});
