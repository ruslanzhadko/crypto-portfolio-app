'use client';

import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { Link } from '@/i18n/navigation';
import { formatUsd } from '@/lib/utils/format';
import type { AggregatedToken } from '@/lib/services/portfolio';

const MIN_USD = 1;

function MoverRow({ tk }: { tk: AggregatedToken }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <TokenLogo src={tk.logoUrl} symbol={tk.symbol} size={28} />
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

  if (tk.coingeckoId) {
    return (
      <Link
        href={`/market/${tk.coingeckoId}`}
        className="block transition-colors hover:bg-muted/40"
      >
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
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

  return (
    <>
      {/* Mobile: one card with tabs */}
      <div className="sm:hidden">
        <Card>
          <CardHeader className="px-4 pb-0 pt-3">
            <Tabs defaultValue="gainers">
              <TabsList className="w-full">
                <TabsTrigger value="gainers" className="flex-1 gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {t('gainersTab')}
                </TabsTrigger>
                <TabsTrigger value="losers" className="flex-1 gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {t('losersTab')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="gainers" className="mt-0">
                <MoversList tokens={gainers.slice(0, 3)} emptyText={t('emptyGainers')} />
              </TabsContent>
              <TabsContent value="losers" className="mt-0">
                <MoversList tokens={losers.slice(0, 3)} emptyText={t('emptyLosers')} />
              </TabsContent>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0" />
        </Card>
      </div>

      {/* Desktop: 2-column grid, 5 items each */}
      <div className="hidden gap-4 sm:grid lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="font-semibold">{gainersTitle}</span>
          </CardHeader>
          <CardContent className="p-0">
            <MoversList tokens={gainers.slice(0, 5)} emptyText={t('emptyGainers')} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="font-semibold">{t('losersTitle')}</span>
          </CardHeader>
          <CardContent className="p-0">
            <MoversList tokens={losers.slice(0, 5)} emptyText={t('emptyLosers')} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
