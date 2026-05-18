import { requireUser } from '@/lib/api/auth-guard';
import { handleUnknown, ok } from '@/lib/api/response';
import { getPortfolioOverview } from '@/lib/services/portfolio';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const overview = await getPortfolioOverview(guard.user.id);
    return ok(overview);
  } catch (err) {
    return handleUnknown(err);
  }
}
