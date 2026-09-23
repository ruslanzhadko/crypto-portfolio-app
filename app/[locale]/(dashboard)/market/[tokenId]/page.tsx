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
import { getTokenDetailReturn } from '@/lib/utils/token-links';

export const dynamic = 'force-dynamic';

export default async function TokenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tokenId: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const t = await getTranslations('TokenDetail');
  const { tokenId } = await params;
  const back = getTokenDetailReturn((await searchParams)?.from);
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
          <Link href={back.href}>
            <ChevronLeft className="h-4 w-4" />
            {t(back.label)}
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
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={back.href}>
          <ChevronLeft className="h-4 w-4" />
          {t(back.label)}
        </Link>
      </Button>

      <Card className="card-gradient">
        <CardContent className="p-3 sm:p-5">
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:gap-x-4">
            <TokenLogo src={coin.image} symbol={coin.symbol} size={40} className="shrink-0 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight sm:text-3xl" title={coin.name}>{coin.name}</h1>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-text-muted sm:text-sm">
                <span className="truncate uppercase">{coin.symbol}</span>
                {coin.rank && <span className="shrink-0">#{coin.rank}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CreateTriggerButton tokenId={coin.id} tokenSymbol={coin.symbol} tokenName={coin.name} />
              {coin.homepage && (
                <Button asChild variant="outline" size="sm">
                  <a href={coin.homepage} target="_blank" rel="noreferrer" aria-label={t('websiteButton')}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t('websiteButton')}</span>
                  </a>
                </Button>
              )}
            </div>
            <div className="col-span-3 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 sm:pl-16">
              <span className="min-w-0 break-all text-2xl font-bold leading-tight tabular-nums sm:break-normal sm:text-3xl">{formatUsd(coin.currentPrice)}</span>
              <PriceChange value={coin.priceChange24h} />
            </div>
            {coin.description && (
              <p className="col-span-3 min-w-0 truncate text-xs text-text-muted sm:line-clamp-2 sm:whitespace-normal sm:pl-16 sm:text-sm">
                {coin.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* На мобільному спочатку показуємо короткі метрики, а деталі ф'ючерсів — нижче. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          compactMobile
          label={t('statMarketCap')}
          value={coin.marketCap !== null ? formatUsd(coin.marketCap, { compact: true }) : '—'}
          delta={coin.priceChange24h}
          deltaLabel={t('deltaLabel')}
        />
        <StatCard
          compactMobile
          label={t('statVolume24h')}
          value={coin.volume24h !== null ? formatUsd(coin.volume24h, { compact: true }) : '—'}
          subtext={
            coin.volume24h !== null && coin.marketCap
              ? t('volumeOfMarketCap', { percent: ((coin.volume24h / coin.marketCap) * 100).toFixed(1) })
              : undefined
          }
        />
        <div className="col-span-2 flex min-w-0 flex-col justify-center rounded-xl border border-border bg-surface p-3 xl:col-span-1">
          <p className="text-sm font-medium leading-tight text-text-muted">{t('statRange24h')}</p>
          <div className="mt-2 grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="text-base font-semibold text-success">↑</span>
              <span className="min-w-0 break-all text-sm font-bold leading-tight tabular-nums sm:break-normal sm:text-xl xl:text-2xl">
                {coin.high24h !== null ? formatUsd(coin.high24h) : '—'}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <span className="text-base font-semibold text-danger">↓</span>
              <span className="min-w-0 break-all text-sm font-bold leading-tight tabular-nums text-text-muted sm:break-normal sm:text-xl xl:text-2xl">
                {coin.low24h !== null ? formatUsd(coin.low24h) : '—'}
              </span>
            </div>
          </div>
        </div>
        <StatCard
          compactMobile
          className="xl:col-start-1"
          label={t('stat1h')}
          value={formatPercent(coin.priceChange1h)}
          valueClassName={coin.priceChange1h >= 0 ? 'text-success' : 'text-danger'}
          subtext={t('stat1hSubtext')}
        />
        <StatCard
          compactMobile
          label={t('stat7d')}
          value={formatPercent(coin.priceChange7d)}
          valueClassName={coin.priceChange7d >= 0 ? 'text-success' : 'text-danger'}
          subtext={t('stat7dSubtext')}
        />
        <StatCard
          compactMobile
          label={t('stat30d')}
          value={formatPercent(coin.priceChange30d)}
          valueClassName={coin.priceChange30d >= 0 ? 'text-success' : 'text-danger'}
          subtext={t('stat30dSubtext')}
        />
        <StatCard
          compactMobile
          label={t('statAth')}
          value={coin.athChangePercent !== null ? formatPercent(coin.athChangePercent) : '—'}
          valueClassName={
            coin.athChangePercent !== null
              ? coin.athChangePercent >= 0 ? 'text-success' : 'text-danger'
              : undefined
          }
          subtext={coin.ath !== null ? t('athSubtext', { value: formatUsd(coin.ath) }) : undefined}
        />
        <div className="col-span-2 xl:col-span-1 xl:col-start-4 xl:row-start-1">
          <OpenInterestCard data={openInterest} symbol={coin.symbol} />
        </div>
      </div>

      <PriceChart tokenId={coin.id} />
    </div>
  );
}
