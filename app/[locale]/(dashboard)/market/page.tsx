import { TokenSearch } from '@/components/market/token-search';
import { MarketTable } from '@/components/market/market-table';
import { fetchTopMarkets, CoinGeckoError, type MarketCoin } from '@/lib/services/coingecko';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export default async function MarketPage() {
  let coins: MarketCoin[] = [];
  let error: string | null = null;
  try {
    coins = await fetchTopMarkets({ perPage: 100 });
  } catch (err) {
    error =
      err instanceof CoinGeckoError
        ? `CoinGecko недоступний: ${err.message}`
        : 'Не вдалось завантажити ринкові дані';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Market</h1>
          <p className="text-sm text-text-muted">Топ криптовалют за капіталізацією.</p>
        </div>
        <div className="w-full md:w-80">
          <TokenSearch />
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-danger">{error}</CardContent>
        </Card>
      )}

      <MarketTable coins={coins} />
    </div>
  );
}
