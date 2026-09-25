import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { apiError, handleUnknown, ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  type: z
    .enum([
      "ALL",
      "NEWS",
      "LISTING",
      "ARBITRAGE",
      "PRICE_ANOMALY",
      "LIQUIDATION",
      "TRADE_IDEA",
      "AIRDROP",
      "ANALYSIS",
      "OTHER",
    ])
    .default("ALL"),
  source: z.string().trim().max(64).optional(),
  search: z.string().trim().max(80).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      type: req.nextUrl.searchParams.get("type") ?? undefined,
      source: req.nextUrl.searchParams.get("source") ?? undefined,
      search: req.nextUrl.searchParams.get("search") ?? undefined,
      before: req.nextUrl.searchParams.get("before") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success)
      return apiError(
        "BAD_REQUEST",
        "Неверные параметры ленты",
        parsed.error.flatten(),
      );

    const { type, source, search, before, limit } = parsed.data;
    const posts = await prisma.telegramFeedPost.findMany({
      where: {
        source: { isActive: true },
        ...(type !== "ALL" ? { type } : {}),
        ...(source ? { source: { isActive: true, username: source } } : {}),
        ...(before ? { publishedAt: { lt: before } } : {}),
        ...(search
          ? {
              OR: [
                { text: { contains: search, mode: "insensitive" } },
                { symbol: { contains: search, mode: "insensitive" } },
                {
                  source: { title: { contains: search, mode: "insensitive" } },
                },
              ],
            }
          : {}),
      },
      include: {
        source: { select: { username: true, title: true, avatarUrl: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    const sources = await prisma.telegramFeedSource.findMany({
      where: { isActive: true },
      select: { username: true, title: true },
      orderBy: { title: "asc" },
    });

    return ok({
      posts: posts.map((post) => ({ ...post, metadata: undefined })),
      sources,
      nextCursor:
        posts.length === limit
          ? (posts.at(-1)?.publishedAt.toISOString() ?? null)
          : null,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return handleUnknown(error);
  }
}
