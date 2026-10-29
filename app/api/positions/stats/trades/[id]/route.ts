import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { exchangeGuard, exchangeJson, failure, readBody, safeApiFailure } from "@/lib/exchanges/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ excluded: z.boolean() }).strict();

/** Leaves a closed trade out of the statistics, or counts it again (one leg of a hedge is not a result). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await exchangeGuard(req);
    if (!guard.ok) return guard.response;
    const parsed = bodySchema.safeParse(await readBody(req));
    if (!parsed.success) return failure("BAD_REQUEST");
    const { count } = await prisma.closedTrade.updateMany({
      where: { id: (await params).id, userId: guard.user.id },
      data: { excluded: parsed.data.excluded },
    });
    if (!count) return failure("NOT_FOUND", 404);
    return exchangeJson({ excluded: parsed.data.excluded });
  } catch (error) {
    return safeApiFailure(error);
  }
}
