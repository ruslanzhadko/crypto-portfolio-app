'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { formatUsd } from '@/lib/utils/format';
import type { AggregatedToken } from '@/lib/services/portfolio';

function MoversList({ tokens, emptyText }: { tokens: AggregatedToken[]; emptyText: string }) {
  if (tokens.length === 0) {
    return <p className="px-4 pb-4 text-sm text-text-muted">{emptyText}</p>;
  }
  return (
    <div className="divide-y divide-border">
      {tokens.map((t) => (
        <div key={t.key} className="flex items-center gap-3 px-4 py-2.5">
          <TokenLogo src={t.logoUrl} symbol={t.symbol} size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.symbol}</p>
            <p className="truncate text-xs text-text-muted">{t.name}</p>
          </div>
          <div className="text-right">
            <PriceChange value={t.priceChange24h} />
            <p className="text-xs text-text-muted">{formatUsd(t.totalUsd, { compact: true })}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TopMovers({ tokens }: { tokens: AggregatedToken[] }) {
  const withChange = tokens.filter((t) => Number.isFinite(t.priceChange24h) && t.priceChange24h !== 0);

  const trueGainers = withChange
    .filter((t) => t.priceChange24h > 0)
    .sort((a, b) => b.priceChange24h - a.priceChange24h);

  const losers = withChange
    .filter((t) => t.priceChange24h < 0)
    .sort((a, b) => a.priceChange24h - b.priceChange24h);

  const gainers =
    trueGainers.length > 0
      ? trueGainers
      : [...withChange]
          .filter((t) => t.priceChange24h < 0)
          .sort((a, b) => b.priceChange24h - a.priceChange24h);

  const gainersTitle = trueGainers.length > 0 ? 'Лідери зростання' : 'Найменше втратили';

  return (
    <>
      {/* Mobile: one card with Зростання / Падіння tabs, 3 items */}
      <div className="sm:hidden">
        <Card>
          <CardHeader className="px-4 pt-3 pb-0">
            <Tabs defaultValue="gainers">
              <TabsList className="w-full">
                <TabsTrigger value="gainers" className="flex-1 gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {gainersTitle}
                </TabsTrigger>
                <TabsTrigger value="losers" className="flex-1 gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Падіння
                </TabsTrigger>
              </TabsList>
              <TabsContent value="gainers" className="mt-0">
                <MoversList
                  tokens={gainers.slice(0, 3)}
                  emptyText="Немає даних про цінову динаміку."
                />
              </TabsContent>
              <TabsContent value="losers" className="mt-0">
                <MoversList
                  tokens={losers.slice(0, 3)}
                  emptyText="Немає активів з негативною динамікою за 24г."
                />
              </TabsContent>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0" />
        </Card>
      </div>

      {/* Desktop: 2-column grid, 5 items each */}
      <div className="hidden sm:grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="font-semibold">{gainersTitle}</span>
          </CardHeader>
          <CardContent className="p-0">
            <MoversList tokens={gainers.slice(0, 5)} emptyText="Немає даних про цінову динаміку." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="font-semibold">Лідери падіння</span>
          </CardHeader>
          <CardContent className="p-0">
            <MoversList
              tokens={losers.slice(0, 5)}
              emptyText="Немає активів з негативною динамікою за 24г."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
