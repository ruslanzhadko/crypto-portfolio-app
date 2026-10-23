import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readLatestAlert } from "@/lib/alerts/latest";
import { tokenUserId } from "@/lib/auth/token-user";

export const dynamic = "force-dynamic";

/** When the newest alert fired, for the "new alerts" dot. Polled often, so it avoids the database. */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const userId = await tokenUserId();
  if (!userId)
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  try {
    const latestAt = await readLatestAlert(userId, async () => {
      const row = await prisma.notificationLog.findFirst({
        where: { userId },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      return row?.sentAt.getTime() ?? null;
    });
    return NextResponse.json({ latestAt }, { headers });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE" } }, { status: 503, headers });
  }
}
