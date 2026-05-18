import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { historyDaysSchema } from '@/lib/utils/validators';
import { CoinGeckoError, fetchMarketChart } from '@/lib/services/coingecko';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { tokenId: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const parsed = historyDaysSchema.safeParse(
      req.nextUrl.searchParams.get('days') ?? undefined,
    );
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Невірний параметр days', parsed.error.flatten());
    }

    const points = await fetchMarketChart(params.tokenId, parsed.data);
    return ok({ points });
  } catch (err) {
    if (err instanceof CoinGeckoError) {
      if (err.status === 404) {
        return apiError('NOT_FOUND', 'Токен не знайдено');
      }
      return apiError('UPSTREAM_ERROR', `CoinGecko: ${err.message}`);
    }
    return handleUnknown(err);
  }
}
