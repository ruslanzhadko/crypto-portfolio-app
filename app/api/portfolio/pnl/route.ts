import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth-guard";
import { apiError, handleUnknown, ok } from "@/lib/api/response";
import { getPortfolioPnL } from "@/lib/services/portfolio";
import { exchangesEnabled } from "@/lib/exchanges/config";
import {
  getCapitalHistory,
  getCapitalOverview,
} from "@/lib/exchanges/portfolio";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().positive().max(3650).default(30),
});

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const parsed = querySchema.safeParse({
      days: req.nextUrl.searchParams.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return apiError(
        "BAD_REQUEST",
        "Помилка валідації",
        parsed.error.flatten(),
      );
    }

    if (exchangesEnabled(guard.user.id)) {
      const [overview, history] = await Promise.all([
        getCapitalOverview(guard.user.id),
        getCapitalHistory(guard.user.id, parsed.data.days),
      ]);
      return ok({
        current: overview.totalUsd,
        initial: history.points[0]?.totalUsd ?? null,
        absolute: history.changeUsd,
        percent: history.changePercent,
        periodDays: parsed.data.days,
        basis: "value-change",
      });
    }
    const result = await getPortfolioPnL(guard.user.id, parsed.data.days);
    return ok(result);
  } catch (err) {
    return handleUnknown(err);
  }
}
