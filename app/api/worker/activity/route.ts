import { NextRequest, NextResponse } from "next/server";
import { readFeedActivityUntil } from "@/lib/feed/activity";
import { readTriggersVersion } from "@/lib/triggers/signal";
import {
  readExchangeActivity,
  workerSignalAuthorized,
} from "@/lib/exchanges/activity";

export const dynamic = "force-dynamic";

/** Polled by the exchange worker; reads only the Runtime Cache, never the database. */
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!workerSignalAuthorized(req.headers.get("authorization")))
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED" } },
      { status: 401, headers },
    );
  try {
    const now = Date.now();
    const [activity, feedUntil, triggersVersion] = await Promise.all([
      readExchangeActivity(now),
      readFeedActivityUntil(now).catch(() => null),
      readTriggersVersion().catch(() => null),
    ]);
    return NextResponse.json(
      { users: Object.keys(activity), feedUntil, triggersVersion, serverTime: now },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "UNAVAILABLE" } },
      { status: 503, headers },
    );
  }
}
