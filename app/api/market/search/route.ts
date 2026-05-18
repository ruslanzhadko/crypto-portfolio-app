import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { CoinGeckoError, searchCoins } from '@/lib/services/coingecko';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (!q) return ok({ results: [] });
    if (q.length < 2) {
      return apiError('BAD_REQUEST', 'Мінімум 2 символи');
    }

    const results = await searchCoins(q);
    return ok({ results });
  } catch (err) {
    if (err instanceof CoinGeckoError) {
      return apiError('UPSTREAM_ERROR', `CoinGecko: ${err.message}`);
    }
    return handleUnknown(err);
  }
}
