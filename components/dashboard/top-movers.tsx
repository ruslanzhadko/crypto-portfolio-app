'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TokenLogo } from '@/components/common/token-logo';
import { ExchangeTokenLogo } from '@/components/exchanges/token-logo';
import { describeTokenLocations } from '@/lib/portfolio/token-locations';
import type { ExchangeHolding } from '@/lib/portfolio/unified-assets';
import { PriceChange } from '@/components/common/price-change';
import { Link } from '@/i18n/navigation';
import { formatUsd } from '@/lib/utils/format';
import type { AggregatedToken } from '@/lib/services/portfolio';
import { getTokenPageUrl } from '@/lib/utils/token-links';
import { exchangeTradeUrl } from '@/lib/exchanges/trade-links';
import { Button } from '@/components/ui/button';
import { moverChange, type MoverChange } from '@/lib/portfolio/holding-returns';
import { useHoldingReturns } from './use-holding-returns';

const MIN_USD = 1;

/** Short dollars for a mover row: cents at most, so tiny amounts never widen the row. */
function moverUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return '<$0.01';
  return formatUsd(abs, { compact: true, minimumFractionDigits: 2 });
}
const DEFAULT_VISIBLE_COUNT = 5;

type MoverToken = AggregatedToken & { exchanges?: ExchangeHolding[] };
type MoverRowToken = MoverToken & { change: MoverChange };

function MoverRow({ tk }: { tk: MoverRowToken }) {
  const t = useTranslations('TopMovers');
  // Exchange-only coins open their market on the exchange holding most of them.
  const exchangePage = tk.exchanges?.[0]
    ? exchangeTradeUrl(tk.exchanges[0].exchange, tk.symbol, tk.exchanges[0].kind)
    : null;
  const tokenPage = getTokenPageUrl(tk) ?? (exchangePage ? { href: exchangePage, external: true } : null);
  const location = describeTokenLocations(tk);
  const changeUsd = tk.change.usd;
  // Held for less than a day (or snapshots started recently): say what period the result covers.
  const hours = tk.change.hours !== null && tk.change.hours < 23.5 ? Math.max(1, Math.round(tk.change.hours)) : null;

  const inner = (
    <div className="flex h-full min-h-12 w-full min-w-0 items-center gap-3 px-3 py-1.5 sm:px-4">
      {tk.logoUrl || tk.tokenAddress ? (
        <TokenLogo
          src={tk.logoUrl}
          symbol={tk.symbol}
          size={24}
          chainName={tk.chainName}
          tokenAddress={tk.tokenAddress}
        />
      ) : (
        // Exchange-only coins have no wallet logo: look it up by ticker.
        <ExchangeTokenLogo symbol={tk.symbol} size={24} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{tk.symbol}</p>
        <p className="truncate text-xs text-text-muted" title={location || tk.name}>
          {location || tk.name}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <PriceChange value={tk.priceChange24h} />
        <p className="flex items-center justify-end gap-1 whitespace-nowrap text-[11px] tabular-nums">
          <span className={changeUsd > 0 ? 'text-success' : changeUsd < 0 ? 'text-danger' : 'text-text-muted'}>
            {changeUsd > 0 ? '+' : changeUsd < 0 ? '−' : ''}{moverUsd(changeUsd)}
          </span>
          {hours !== null && (
            <>
              <span className="text-text-muted" aria-hidden>·</span>
              <span className="text-text-muted" title={t('periodHoursTitle', { hours })}>
                {t('periodHours', { hours })}
              </span>
            </>
          )}
          <span className="text-text-muted" aria-hidden>·</span>
          <span
            className="text-text-muted"
            title={`${t('positionValue')}: ${formatUsd(tk.totalUsd)}`}
            aria-label={`${t('positionValue')}: ${formatUsd(tk.totalUsd)}`}
          >
            {moverUsd(tk.totalUsd)}
          </span>
        </p>
      </div>
    </div>
  );

  if (tokenPage?.external) {
    return (
      <a href={tokenPage.href} target="_blank" rel="noreferrer" className="flex min-h-12 min-w-0 flex-1 transition-colors hover:bg-muted/40">
        {inner}
      </a>
    );
  }
  if (tokenPage) {
    return (
      <Link href={`${tokenPage.href}?from=dashboard`} className="flex min-h-12 min-w-0 flex-1 transition-colors hover:bg-muted/40">
        {inner}
      </Link>
    );
  }
  return (
    <div className="flex min-h-12 w-full min-w-0 flex-1 text-left">
      {inner}
    </div>
  );
}

function MoversList({ tokens, emptyText }: { tokens: MoverRowToken[]; emptyText: string }) {
  if (tokens.length === 0) {
    return <p className="px-4 pb-4 text-sm text-text-muted">{emptyText}</p>;
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col divide-y divide-border">
      {tokens.map((tk) => (
        <div key={tk.key} className="flex min-w-0 flex-1">
          <MoverRow tk={tk} />
        </div>
      ))}
    </div>
  );
}

export function TopMovers({
  tokens,
  scope = 'all',
}: {
  tokens: MoverToken[];
  /** "wallets": wallet tokens only, so coins also held on an exchange use their wallet-only result. */
  scope?: 'all' | 'wallets';
}) {
  const t = useTranslations('TopMovers');
  const holdingReturns = useHoldingReturns();
  // Personal 24h result from the 30-minute snapshots; sorted by it below.
  const rows: MoverRowToken[] = useMemo(
    () =>
      tokens.map((tk) => {
        const change = moverChange(tk, holdingReturns, scope);
        return { ...tk, priceChange24h: change.percent, change };
      }),
    [tokens, holdingReturns, scope],
  );
  const [expandedGainers, setExpandedGainers] = useState(false);
  const [expandedLosers, setExpandedLosers] = useState(false);
  const [mobileView, setMobileView] = useState<'gainers' | 'losers'>('gainers');

  // Only include tokens worth more than $1 (avoids spam/dust noise)
  const withChange = rows
    .filter((tk) => tk.totalUsd >= MIN_USD)
    .filter((tk) => Number.isFinite(tk.priceChange24h) && tk.priceChange24h !== 0);

  const trueGainers = withChange
    .filter((tk) => tk.priceChange24h > 0)
    .sort((a, b) => b.priceChange24h - a.priceChange24h);

  const losers = withChange
    .filter((tk) => tk.priceChange24h < 0)
    .sort((a, b) => a.priceChange24h - b.priceChange24h);

  const gainers =
    trueGainers.length > 0
      ? trueGainers
      : [...withChange]
          .filter((tk) => tk.priceChange24h < 0)
          .sort((a, b) => b.priceChange24h - a.priceChange24h);

  const gainersTitle = t('gainersTitle');
  const visibleGainers = expandedGainers ? gainers : gainers.slice(0, DEFAULT_VISIBLE_COUNT);
  const visibleLosers = expandedLosers ? losers : losers.slice(0, DEFAULT_VISIBLE_COUNT);
  const isMobileGainers = mobileView === 'gainers';
  const mobileTokens = isMobileGainers ? visibleGainers : visibleLosers;
  const mobileEmptyText = isMobileGainers ? t('emptyGainers') : t('emptyLosers');
  const mobileExpanded = isMobileGainers ? expandedGainers : expandedLosers;
  const setMobileExpanded = isMobileGainers ? setExpandedGainers : setExpandedLosers;
  const mobileTotal = isMobileGainers ? gainers.length : losers.length;

  return (
    <>
      <div className="h-full w-full">
        <Card className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="hidden min-w-0 flex-1 grid-cols-2 divide-x divide-border lg:grid">
            <section className="flex min-w-0 flex-col">
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 sm:p-4 sm:pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="font-semibold">{gainersTitle}</span>
                </div>
                {gainers.length > DEFAULT_VISIBLE_COUNT && <Button variant="ghost" size="sm" onClick={() => setExpandedGainers((value) => !value)}>{expandedGainers ? t('showLess') : t('showAll')}</Button>}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col p-0">
                <MoversList tokens={visibleGainers} emptyText={t('emptyGainers')} />
              </CardContent>
            </section>
            <section className="flex min-w-0 flex-col">
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 sm:p-4 sm:pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="font-semibold">{t('losersTitle')}</span>
                </div>
                {losers.length > DEFAULT_VISIBLE_COUNT && <Button variant="ghost" size="sm" onClick={() => setExpandedLosers((value) => !value)}>{expandedLosers ? t('showLess') : t('showAll')}</Button>}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col p-0">
                <MoversList tokens={visibleLosers} emptyText={t('emptyLosers')} />
              </CardContent>
            </section>
          </div>
          <section className="flex min-w-0 flex-col lg:hidden">
            <CardHeader className="flex flex-row items-center gap-2 p-3 pb-2 sm:p-4 sm:pb-2">
              <div className="flex flex-1 rounded-lg bg-surface-2 p-1" role="group" aria-label={`${t('gainersTitle')} / ${t('losersTitle')}`}>
                <button
                  type="button"
                  aria-pressed={isMobileGainers}
                  onClick={() => setMobileView('gainers')}
                  aria-label={gainersTitle}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors ${isMobileGainers ? 'bg-background text-success shadow-sm' : 'text-text-muted'}`}
                >
                  <TrendingUp className="h-4 w-4" aria-hidden />
                  {t('gainersTab')}
                </button>
                <button
                  type="button"
                  aria-pressed={!isMobileGainers}
                  onClick={() => setMobileView('losers')}
                  aria-label={t('losersTitle')}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors ${!isMobileGainers ? 'bg-background text-danger shadow-sm' : 'text-text-muted'}`}
                >
                  <TrendingDown className="h-4 w-4" aria-hidden />
                  {t('losersTab')}
                </button>
              </div>
              {mobileTotal > DEFAULT_VISIBLE_COUNT && (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setMobileExpanded((value) => !value)}>
                  {mobileExpanded ? t('showLess') : t('showAll')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col p-0">
              <MoversList tokens={mobileTokens} emptyText={mobileEmptyText} />
            </CardContent>
          </section>
        </Card>
      </div>
    </>
  );
}
