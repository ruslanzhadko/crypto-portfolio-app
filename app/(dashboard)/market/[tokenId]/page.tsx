import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/common/stat-card';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { PriceChart } from '@/components/market/price-chart';
import { CreateTriggerButton } from '@/components/alerts/create-trigger-button';
import { CoinGeckoError, fetchCoinDetail, type CoinDetail } from '@/lib/services/coingecko';
import { formatUsd } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function TokenDetailPage({
  params,
}: {
  params: { tokenId: string };
}) {
  let coin: CoinDetail | null = null;
  let fetchError: string | null = null;

  try {
    coin = await fetchCoinDetail(params.tokenId);
  } catch (err) {
    if (err instanceof CoinGeckoError) {
      if (err.status === 404) notFound();
      fetchError = `Дані CoinGecko тимчасово недоступні: ${err.message}`;
    } else {
      fetchError = 'Не вдалось завантажити дані токена';
    }
  }

  if (fetchError && !coin) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/market">
            <ChevronLeft className="h-4 w-4" />
            До Market
          </Link>
        </Button>
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
            <div>
              <p className="font-medium">Інформація про токен недоступна</p>
              <p className="mt-1 text-sm text-text-muted">{fetchError}</p>
              <p className="mt-2 text-xs text-text-muted">
                Ідентифікатор токена: <code className="font-mono">{params.tokenId}</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!coin) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/market">
          <ChevronLeft className="h-4 w-4" />
          До Market
        </Link>
      </Button>

      <Card className="card-gradient">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <TokenLogo src={coin.image} symbol={coin.symbol} size={56} />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold md:text-3xl">{coin.name}</h1>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs uppercase text-text-muted">
                  {coin.symbol}
                </span>
                {coin.rank && (
                  <span className="text-xs text-text-muted">#{coin.rank}</span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-bold">{formatUsd(coin.currentPrice)}</span>
                <PriceChange value={coin.priceChange24h} />
              </div>
              {coin.description && (
                <p className="mt-3 max-w-2xl text-sm text-text-muted">
                  {coin.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <CreateTriggerButton
              tokenId={coin.id}
              tokenSymbol={coin.symbol}
              tokenName={coin.name}
            />
            {coin.homepage && (
              <Button asChild variant="outline" size="sm">
                <a href={coin.homepage} target="_blank" rel="noreferrer">
                  Website <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Капіталізація"
          value={coin.marketCap ? formatUsd(coin.marketCap, { compact: true }) : '—'}
        />
        <StatCard
          label="Обʼєм 24г"
          value={coin.volume24h ? formatUsd(coin.volume24h, { compact: true }) : '—'}
        />
        <StatCard label="7д" value="" delta={coin.priceChange7d} deltaLabel="за тиждень" />
        <StatCard label="30д" value="" delta={coin.priceChange30d} deltaLabel="за місяць" />
      </div>

      <PriceChart tokenId={coin.id} />
    </div>
  );
}
