import { requireUser } from "@/lib/api/auth-guard";
import { handleUnknown, ok } from "@/lib/api/response";
import { getPortfolioOverview } from "@/lib/services/portfolio";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { getCapitalOverview } from "@/lib/exchanges/portfolio";
import {
  markExchangeActivity,
  withinActivityGrace,
} from "@/lib/exchanges/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const overview = await getPortfolioOverview(guard.user.id);
    if (!exchangesEnabled(guard.user.id)) return ok(overview);
    // Wallet pages include exchange capital, so they count as a viewer too.
    const since = await markExchangeActivity(guard.user.id);
    const capital = await getCapitalOverview(guard.user.id, {
      relaxed: withinActivityGrace(since),
    });
    return ok(
      {
        ...overview,
        totalUsd: Number(capital.totalUsd),
        walletsUsd: overview.totalUsd,
        capital,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return handleUnknown(err);
  }
}
