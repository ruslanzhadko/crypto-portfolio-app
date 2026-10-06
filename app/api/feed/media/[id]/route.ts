import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!/^[a-z0-9_-]{1,64}$/i.test((await params).id)) {
    return new Response(null, { status: 404 });
  }

  const media = await prisma.telegramFeedMedia.findUnique({
    where: { postId: (await params).id },
    select: { data: true, mimeType: true, byteSize: true, updatedAt: true },
  });
  if (!media) return new Response(null, { status: 404 });

  const etag = `"${(await params).id}-${media.byteSize}-${media.updatedAt.getTime()}"`;
  const cacheHeaders = {
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  return new Response(new Uint8Array(media.data), {
    headers: {
      ...cacheHeaders,
      "Content-Type": media.mimeType,
      "Content-Length": String(media.byteSize),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
