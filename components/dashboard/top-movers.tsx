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
  const tokenPage = getTokenPageUrl(tk);

  const inner = (
    <div className="flex items-center gap-3 px-4 py-2">
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
        <p className="text-xs text-text-muted">{formatUsd(tk.totalUsd, { compact: true })}</p>
      </div>
    </div>
  );

  if (tokenPage?.external) {
    return (
      <a href={tokenPage.href} target="_blank" rel="noreferrer" className="block transition-colors hover:bg-muted/40">
        {inner}
      </a>
    );
  }
  if (tokenPage) {
    return (
      <Link href={`${tokenPage.href}?from=dashboard`} className="block transition-colors hover:bg-muted/40">
        {inner}
      </Link>
    );
  }
  return (
    <div className="block w-full text-left">
      {inner}
    </div>
  );
}

function MoversList({ tokens, emptyText }: { tokens: AggregatedToken[]; emptyText: string }) {
  if (tokens.length === 0) {
    return <p className="px-4 pb-4 text-sm text-text-muted">{emptyText}</p>;
  }
  return (
    <div className="divide-y divide-border">
      {tokens.map((tk) => (
        <MoverRow key={tk.key} tk={tk} />
      ))}
    </div>
  );
}

export function TopMovers({ tokens }: { tokens: AggregatedToken[] }) {
  const t = useTranslations('TopMovers');
  const [expandedGainers, setExpandedGainers] = useState(false);
  const [expandedLosers, setExpandedLosers] = useState(false);

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

  return (
    <>
      <div className="w-full lg:w-1/2">
        <Card className="min-w-0 overflow-hidden">
          <div className="grid min-w-0 grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <section className="min-w-0">
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 sm:p-4 sm:pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="font-semibold">{gainersTitle}</span>
                </div>
                {gainers.length > DEFAULT_VISIBLE_COUNT && <Button variant="ghost" size="sm" onClick={() => setExpandedGainers((value) => !value)}>{expandedGainers ? t('showLess') : t('showAll')}</Button>}
              </CardHeader>
              <CardContent className="p-0">
                <MoversList tokens={visibleGainers} emptyText={t('emptyGainers')} />
              </CardContent>
            </section>
            <section className="min-w-0">
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 sm:p-4 sm:pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="font-semibold">{t('losersTitle')}</span>
                </div>
                {losers.length > DEFAULT_VISIBLE_COUNT && <Button variant="ghost" size="sm" onClick={() => setExpandedLosers((value) => !value)}>{expandedLosers ? t('showLess') : t('showAll')}</Button>}
              </CardHeader>
              <CardContent className="p-0">
                <MoversList tokens={visibleLosers} emptyText={t('emptyLosers')} />
              </CardContent>
            </section>
          </div>
        </Card>
      </div>
    </>
  );
}
