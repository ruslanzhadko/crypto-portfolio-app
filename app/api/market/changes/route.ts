import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tickerChanges } from "@/lib/market/ticker-changes";

export const dynamic = "force-dynamic";

const symbolsSchema = z
  .string()
  .max(4000)
  .transform((s) =>
    [...new Set(s.split(",").map((x) => x.trim().toUpperCase()))].filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^[A-Z0-9]{1,20}$/)).max(300));

/** 24h change (percent) for exchange tickers; public market data only. */
export async function GET(req: NextRequest) {
  const parsed = symbolsSchema.safeParse(
    req.nextUrl.searchParams.get("symbols") ?? "",
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: "BAD_REQUEST" } },
      { status: 400 },
    );
  const all = await tickerChanges();
  const changes: Record<string, number> = {};
  for (const symbol of parsed.data) {
    const change = all.get(symbol);
    if (change !== undefined) changes[symbol] = Math.round(change * 100) / 100;
  }
  return NextResponse.json(
    { changes },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
        "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    },
  );
}
