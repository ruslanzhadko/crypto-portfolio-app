import { NextRequest } from "next/server";
import { z } from "zod";
import {
  exchangeGuard,
  exchangeJson,
  failure,
  safeApiFailure,
} from "@/lib/exchanges/api";
import {
  getCapitalOverview,
  getCapitalHistory,
} from "@/lib/exchanges/portfolio";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const guard = await exchangeGuard();
    if (!guard.ok) return guard.response;
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .safeParse(req.nextUrl.searchParams.get("days") ?? 30);
    if (!days.success) return failure("BAD_REQUEST");
    if (req.nextUrl.searchParams.get("view") === "overview")
      return exchangeJson({
        overview: await getCapitalOverview(guard.user.id),
      });
    if (req.nextUrl.searchParams.get("view") === "history")
      return exchangeJson({
        history: await getCapitalHistory(guard.user.id, days.data),
      });
    const [overview, history] = await Promise.all([
      getCapitalOverview(guard.user.id),
      getCapitalHistory(guard.user.id, days.data),
    ]);
    return exchangeJson({ overview, history });
  } catch (e) {
    return safeApiFailure(e);
  }
}
