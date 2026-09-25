import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { apiError, handleUnknown, noContent, ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ isActive: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", "Invalid source state", parsed.error.flatten());
    }

    const existing = await prisma.telegramFeedSource.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) return apiError("NOT_FOUND", "Telegram source not found");

    const source = await prisma.telegramFeedSource.update({
      where: { id: existing.id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, isActive: true, updatedAt: true },
    });

    return ok({ source });
  } catch (error) {
    return handleUnknown(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const source = await prisma.telegramFeedSource.findUnique({
      where: { id: params.id },
      select: { id: true, _count: { select: { posts: true } } },
    });
    if (!source) return apiError("NOT_FOUND", "Telegram source not found");
    if (source._count.posts > 0) {
      return apiError(
        "CONFLICT",
        "A source with saved posts can only be disabled",
      );
    }

    await prisma.telegramFeedSource.delete({ where: { id: source.id } });
    return noContent();
  } catch (error) {
    return handleUnknown(error);
  }
}
