import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { CoinGeckoError, fetchCoinDetail } from '@/lib/services/coingecko';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { tokenId: string } },
) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const detail = await fetchCoinDetail(params.tokenId);
    return ok({ coin: detail });
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
