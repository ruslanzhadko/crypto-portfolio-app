import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { apiError, created, handleUnknown, ok } from "@/lib/api/response";
import { parseTelegramUsername } from "@/lib/feed/telegram-source";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  channel: z.string().trim().min(1).max(160),
});

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const sources = await prisma.telegramFeedSource.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        username: true,
        title: true,
        isActive: true,
        telegramId: true,
        lastMessageId: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return ok({ sources });
  } catch (error) {
    return handleUnknown(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", "Invalid Telegram channel", parsed.error.flatten());
    }

    const username = parseTelegramUsername(parsed.data.channel);
    if (!username) {
      return apiError("BAD_REQUEST", "Enter a public Telegram username or t.me link");
    }

    const existing = await prisma.telegramFeedSource.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return apiError("CONFLICT", "This channel is already in the list");

    const source = await prisma.telegramFeedSource.create({
      data: { username, title: `@${username}` },
      select: {
        id: true,
        username: true,
        title: true,
        isActive: true,
        telegramId: true,
        lastMessageId: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return created({ source });
  } catch (error) {
    return handleUnknown(error);
  }
}
