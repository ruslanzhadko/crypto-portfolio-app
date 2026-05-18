import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown, ok } from '@/lib/api/response';
import { fetchTopMarkets, CoinGeckoError } from '@/lib/services/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(250).default(100),
});

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const parsed = querySchema.safeParse({
      page: req.nextUrl.searchParams.get('page') ?? undefined,
      perPage: req.nextUrl.searchParams.get('perPage') ?? undefined,
    });
    if (!parsed.success) {
      return apiError('BAD_REQUEST', 'Помилка валідації', parsed.error.flatten());
    }
    const { page, perPage } = parsed.data;

    const coins = await fetchTopMarkets({ page, perPage });

    // Cache top results into TokenPrice
    if (page === 1) {
      await Promise.all(
        coins.map((c) =>
          prisma.tokenPrice.upsert({
            where: { tokenId: c.id },
            create: {
              tokenId: c.id,
              symbol: c.symbol,
              name: c.name,
              currentPrice: c.current_price ?? 0,
              priceChange24h: c.price_change_percentage_24h ?? 0,
              priceChange7d: c.price_change_percentage_7d_in_currency ?? 0,
              marketCap: c.market_cap,
              volume24h: c.total_volume,
              logoUrl: c.image,
            },
            update: {
              symbol: c.symbol,
              name: c.name,
              currentPrice: c.current_price ?? 0,
              priceChange24h: c.price_change_percentage_24h ?? 0,
              priceChange7d: c.price_change_percentage_7d_in_currency ?? 0,
              marketCap: c.market_cap,
              volume24h: c.total_volume,
              logoUrl: c.image,
            },
          }),
        ),
      ).catch((err) => console.warn('[market/prices] cache failed:', err));
    }

    return ok({ coins, page, perPage });
  } catch (err) {
    if (err instanceof CoinGeckoError) {
      return apiError('UPSTREAM_ERROR', `CoinGecko: ${err.message}`);
    }
    return handleUnknown(err);
  }
}
