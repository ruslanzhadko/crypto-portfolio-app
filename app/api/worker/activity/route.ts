import { NextRequest, NextResponse } from "next/server";
import { readFeedActivityUntil } from "@/lib/feed/activity";
import { readTriggersVersion } from "@/lib/triggers/signal";
import { readPositionAlertsVersion } from "@/lib/positions/signal";
import { readPositionViews } from "@/lib/positions/view-requests";
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
    const [activity, feedUntil, triggersVersion, positionAlertsVersion, positionViews] =
      await Promise.all([
        readExchangeActivity(now),
        readFeedActivityUntil(now).catch(() => null),
        readTriggersVersion().catch(() => null),
        readPositionAlertsVersion().catch(() => null),
        readPositionViews(now).catch(() => []),
      ]);
    return NextResponse.json(
      {
        users: Object.keys(activity),
        feedUntil,
        triggersVersion,
        positionAlertsVersion,
        positionViews,
        serverTime: now,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "UNAVAILABLE" } },
      { status: 503, headers },
    );
  }
}
