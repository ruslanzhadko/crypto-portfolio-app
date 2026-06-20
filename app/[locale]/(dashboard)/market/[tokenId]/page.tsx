import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ChevronLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/common/stat-card';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { PriceChart } from '@/components/market/price-chart';
import { OpenInterestCard } from '@/components/market/open-interest-card';
import { CreateTriggerButton } from '@/components/alerts/create-trigger-button';
import { CoinGeckoError, fetchCoinDetail, type CoinDetail } from '@/lib/services/coingecko';
import { fetchOpenInterest } from '@/lib/services/open-interest';
import { formatUsd, formatPercent } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function TokenDetailPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const t = await getTranslations('TokenDetail');
  const { tokenId } = await params;
  let coin: CoinDetail | null = null;
  let fetchError: string | null = null;

  try {
    coin = await fetchCoinDetail(tokenId);
  } catch (err) {
    if (err instanceof CoinGeckoError) {
      if (err.status === 404) notFound();
      fetchError = t('errorCoinGecko', { message: err.message });
    } else {
      fetchError = t('errorLoadFailed');
    }
  }

  const openInterest = coin
    ? await fetchOpenInterest(coin.symbol, coin.currentPrice).catch(() => null)
    : null;

  if (fetchError && !coin) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/market">
            <ChevronLeft className="h-4 w-4" />
            {t('backToMarket')}
          </Link>
        </Button>
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
            <div>
              <p className="font-medium">{t('errorTitle')}</p>
              <p className="mt-1 text-sm text-text-muted">{fetchError}</p>
              <p className="mt-2 text-xs text-text-muted">
                {t('errorTokenId')} <code className="font-mono">{tokenId}</code>
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
          {t('backToMarket')}
        </Link>
      </Button>

      <Card className="card-gradient">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <TokenLogo src={coin.image} symbol={coin.symbol} size={56} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <h1 className="text-2xl font-bold md:text-3xl truncate">{coin.name}</h1>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-sm font-medium uppercase text-text-muted shrink-0">
                    {coin.symbol}
                  </span>
                  {coin.rank && (
                    <span className="text-sm text-text-muted shrink-0">#{coin.rank}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CreateTriggerButton
                    tokenId={coin.id}
                    tokenSymbol={coin.symbol}
                    tokenName={coin.name}
                  />
                  {coin.homepage && (
                    <Button asChild variant="outline" size="sm">
                      <a href={coin.homepage} target="_blank" rel="noreferrer">
                        {t('websiteButton')} <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-bold">{formatUsd(coin.currentPrice)}</span>
                <PriceChange value={coin.priceChange24h} />
              </div>
              {coin.description && (
                <p className="mt-2.5 text-sm text-text-muted line-clamp-2">
                  {coin.description}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ряд 1 — ринкові показники */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('statMarketCap')}
          value={coin.marketCap !== null ? formatUsd(coin.marketCap, { compact: true }) : '—'}
          delta={coin.priceChange24h}
          deltaLabel={t('deltaLabel')}
        />
        <StatCard
          label={t('statVolume24h')}
          value={coin.volume24h !== null ? formatUsd(coin.volume24h, { compact: true }) : '—'}
          subtext={
            coin.volume24h !== null && coin.marketCap
              ? t('volumeOfMarketCap', { percent: ((coin.volume24h / coin.marketCap) * 100).toFixed(1) })
              : undefined
          }
        />
        <div className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_0_20px_-5px_rgba(108,99,255,0.25)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <p className="relative text-sm font-medium text-text-muted leading-tight">{t('statRange24h')}</p>
          <div className="relative mt-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-success">↑</span>
              <span className="text-[1.75rem] font-bold tabular-nums leading-tight">
                {coin.high24h !== null ? formatUsd(coin.high24h) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-danger">↓</span>
              <span className="text-[1.75rem] font-bold tabular-nums leading-tight text-text-muted">
                {coin.low24h !== null ? formatUsd(coin.low24h) : '—'}
              </span>
            </div>
          </div>
        </div>
        <OpenInterestCard data={openInterest} symbol={coin.symbol} />
      </div>

      {/* Ряд 2 — динаміка цін */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('stat1h')}
          value={formatPercent(coin.priceChange1h)}
          valueClassName={coin.priceChange1h >= 0 ? 'text-success' : 'text-danger'}
          subtext={t('stat1hSubtext')}
        />
        <StatCard
          label={t('stat7d')}
          value={formatPercent(coin.priceChange7d)}
          valueClassName={coin.priceChange7d >= 0 ? 'text-success' : 'text-danger'}
          subtext={t('stat7dSubtext')}
        />
        <StatCard
          label={t('stat30d')}
          value={formatPercent(coin.priceChange30d)}
          valueClassName={coin.priceChange30d >= 0 ? 'text-success' : 'text-danger'}
          subtext={t('stat30dSubtext')}
        />
        <StatCard
          label={t('statAth')}
          value={coin.athChangePercent !== null ? formatPercent(coin.athChangePercent) : '—'}
          valueClassName={
            coin.athChangePercent !== null
              ? coin.athChangePercent >= 0 ? 'text-success' : 'text-danger'
              : undefined
          }
          subtext={coin.ath !== null ? t('athSubtext', { value: formatUsd(coin.ath) }) : undefined}
        />
      </div>

      <PriceChart tokenId={coin.id} />
    </div>
  );
}
