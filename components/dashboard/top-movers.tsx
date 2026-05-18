import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { formatUsd } from '@/lib/utils/format';
import type { AggregatedToken } from '@/lib/services/portfolio';

function MoversList({ tokens, emptyText }: { tokens: AggregatedToken[]; emptyText: string }) {
  if (tokens.length === 0) {
    return <p className="px-6 pb-6 text-sm text-text-muted">{emptyText}</p>;
  }
  return (
    <div className="divide-y divide-border">
      {tokens.map((t) => (
        <div key={t.key} className="flex items-center gap-3 px-6 py-3">
          <TokenLogo src={t.logoUrl} symbol={t.symbol} size={32} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t.symbol}</p>
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
    .sort((a, b) => b.priceChange24h - a.priceChange24h)
    .slice(0, 5);

  const losers = withChange
    .filter((t) => t.priceChange24h < 0)
    .sort((a, b) => a.priceChange24h - b.priceChange24h)
    .slice(0, 5);

  // Якщо немає справжніх gainers — показуємо ті що найменше впали
  const gainers =
    trueGainers.length > 0
      ? trueGainers
      : [...withChange]
          .filter((t) => t.priceChange24h < 0)
          .sort((a, b) => b.priceChange24h - a.priceChange24h)
          .slice(0, 5);

  const gainersTitle = trueGainers.length > 0 ? 'Лідери зростання' : 'Найменше втратили';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            {gainersTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <MoversList tokens={gainers} emptyText="Немає даних про цінову динаміку." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Лідери падіння
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <MoversList tokens={losers} emptyText="Немає активів з негативною динамікою за 24г." />
        </CardContent>
      </Card>
    </div>
  );
}
