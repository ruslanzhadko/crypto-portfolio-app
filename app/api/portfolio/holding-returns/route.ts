import { requireUser } from "@/lib/api/auth-guard";
import { handleUnknown, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** The 24h result of each coin from the last 30-minute snapshot; one small row per user. */
export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const row = await prisma.tokenHoldingSeries.findUnique({
      where: { userId: guard.user.id },
      select: { result: true },
    });
    // A new snapshot appears only every 30 minutes.
    return ok(
      { result: row?.result ?? null },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (err) {
    return handleUnknown(err);
  }
}
