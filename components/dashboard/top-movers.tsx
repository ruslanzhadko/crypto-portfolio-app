'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { Link } from '@/i18n/navigation';
import { formatUsd } from '@/lib/utils/format';
import type { AggregatedToken } from '@/lib/services/portfolio';
import { getTokenPageUrl } from '@/lib/utils/token-links';
import { Button } from '@/components/ui/button';

const MIN_USD = 1;
const DEFAULT_VISIBLE_COUNT = 5;

function MoverRow({ tk }: { tk: AggregatedToken }) {
  const t = useTranslations('TopMovers');
  const tokenPage = getTokenPageUrl(tk);
  // Convert the 24h price percentage into the dollar change of this position.
  // totalUsd is the current value, so compare it with the implied previous value.
  const changeFraction = Math.max(-0.999, tk.priceChange24h / 100);
  const changeUsd = tk.totalUsd - tk.totalUsd / (1 + changeFraction);

  const inner = (
    <div className="flex h-full min-h-12 w-full items-center gap-3 px-3 py-1.5 sm:px-4">
      <TokenLogo
        src={tk.logoUrl}
        symbol={tk.symbol}
        size={24}
        chainName={tk.chainName}
        tokenAddress={tk.tokenAddress}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{tk.symbol}</p>
        <p className="truncate text-xs text-text-muted">{tk.name}</p>
      </div>
      <div className="text-right">
        <PriceChange value={tk.priceChange24h} />
        <p className="flex items-center justify-end gap-1 text-[11px] tabular-nums">
          <span className={changeUsd > 0 ? 'text-success' : changeUsd < 0 ? 'text-danger' : 'text-text-muted'}>
            {changeUsd > 0 ? '+' : changeUsd < 0 ? '−' : ''}{formatUsd(Math.abs(changeUsd), { compact: true })}
          </span>
          <span className="text-text-muted" aria-hidden>·</span>
          <span
            className="text-text-muted"
            title={`${t('positionValue')}: ${formatUsd(tk.totalUsd)}`}
            aria-label={`${t('positionValue')}: ${formatUsd(tk.totalUsd)}`}
          >
            {formatUsd(tk.totalUsd, { compact: true })}
          </span>
        </p>
      </div>
    </div>
  );

  if (tokenPage?.external) {
    return (
      <a href={tokenPage.href} target="_blank" rel="noreferrer" className="flex min-h-12 flex-1 transition-colors hover:bg-muted/40">
        {inner}
      </a>
    );
  }
  if (tokenPage) {
    return (
      <Link href={`${tokenPage.href}?from=dashboard`} className="flex min-h-12 flex-1 transition-colors hover:bg-muted/40">
        {inner}
      </Link>
    );
  }
  return (
    <div className="flex min-h-12 flex-1 w-full text-left">
      {inner}
    </div>
  );
}

function MoversList({ tokens, emptyText }: { tokens: AggregatedToken[]; emptyText: string }) {
  if (tokens.length === 0) {
    return <p className="px-4 pb-4 text-sm text-text-muted">{emptyText}</p>;
  }
  return (
    <div className="flex flex-1 flex-col divide-y divide-border">
      {tokens.map((tk) => (
        <div key={tk.key} className="flex flex-1">
          <MoverRow tk={tk} />
        </div>
      ))}
    </div>
  );
}

export function TopMovers({ tokens }: { tokens: AggregatedToken[] }) {
  const t = useTranslations('TopMovers');
  const [expandedGainers, setExpandedGainers] = useState(false);
  const [expandedLosers, setExpandedLosers] = useState(false);
  const [mobileView, setMobileView] = useState<'gainers' | 'losers'>('gainers');

  // Only include tokens worth more than $1 (avoids spam/dust noise)
  const withChange = tokens
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
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors ${isMobileGainers ? 'bg-background text-success shadow-sm' : 'text-text-muted'}`}
                >
                  <TrendingUp className="h-4 w-4" aria-hidden />
                  {gainersTitle}
                </button>
                <button
                  type="button"
                  aria-pressed={!isMobileGainers}
                  onClick={() => setMobileView('losers')}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors ${!isMobileGainers ? 'bg-background text-danger shadow-sm' : 'text-text-muted'}`}
                >
                  <TrendingDown className="h-4 w-4" aria-hidden />
                  {t('losersTitle')}
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
