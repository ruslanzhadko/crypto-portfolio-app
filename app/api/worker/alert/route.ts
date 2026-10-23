import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markAlertFired } from "@/lib/alerts/latest";
import { workerSignalAuthorized } from "@/lib/exchanges/activity";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1).max(64),
  at: z.number().int().positive(),
});

/** The VM reports a recorded alert; only the Runtime Cache is written, never the database. */
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!workerSignalAuthorized(req.headers.get("authorization")))
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400, headers });
  // A clock far ahead of ours would hide later alerts.
  await markAlertFired(parsed.data.userId, Math.min(parsed.data.at, Date.now()));
  return NextResponse.json({ ok: true }, { headers });
}
