import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { getCache } from '@vercel/functions';
import { CoinGeckoError, searchCoins } from '@/lib/services/coingecko';

/**
 * Search results change slowly and logos look up the same tickers over and over: a successful
 * answer is kept for a week in the Runtime Cache, shared by every user, so CoinGecko's monthly
 * budget is not spent on repeated page views.
 */
const SEARCH_TTL_SECONDS = 7 * 86400;
const cacheKey = (q: string) => `coin-search:v1:${q.toLowerCase()}`;

async function cachedSearch(q: string) {
  try {
    const hit = await getCache().get(cacheKey(q));
    if (Array.isArray(hit)) return hit as Awaited<ReturnType<typeof searchCoins>>;
  } catch {
    // Cache unavailable: ask CoinGecko directly.
  }
  const results = await searchCoins(q);
  try {
    await getCache().set(cacheKey(q), results, { ttl: SEARCH_TTL_SECONDS, name: 'coin-search' });
  } catch {
    // Not cached this time; the answer is still returned.
  }
  return results;
}

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

    const results = await cachedSearch(q);
    return ok({ results }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch (err) {
    if (err instanceof CoinGeckoError) {
      return apiError('UPSTREAM_ERROR', `CoinGecko: ${err.message}`);
    }
    return handleUnknown(err);
  }
}
