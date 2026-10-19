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

  const postId = (await params).id;
  // Metadata first: a revalidation must not pull the image bytes from the database.
  const meta = await prisma.telegramFeedMedia.findUnique({
    where: { postId },
    select: { mimeType: true, byteSize: true, updatedAt: true },
  });
  if (!meta) return new Response(null, { status: 404 });

  const etag = `"${postId}-${meta.byteSize}-${meta.updatedAt.getTime()}"`;
  const cacheHeaders = {
    "Cache-Control": "public, max-age=31536000, immutable",
    // Browser max-age alone is not cached by the Vercel CDN; this is.
    "CDN-Cache-Control": "public, max-age=604800",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  const media = await prisma.telegramFeedMedia.findUnique({
    where: { postId },
    select: { data: true },
  });
  if (!media) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(media.data), {
    headers: {
      ...cacheHeaders,
      "Content-Type": meta.mimeType,
      "Content-Length": String(meta.byteSize),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
