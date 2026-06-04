import Link from 'next/link';
import type { MarketCoin } from '@/lib/services/coingecko';
import { Card, CardContent } from '@/components/ui/card';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import { formatUsd } from '@/lib/utils/format';

export function MarketTable({ coins }: { coins: MarketCoin[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-3.5 text-left">#</th>
                <th className="px-4 py-3.5 text-left">Назва</th>
                <th className="px-5 py-3 text-right">Ціна</th>
                <th className="hidden px-5 py-3 text-right md:table-cell">24г</th>
                <th className="hidden px-5 py-3 text-right lg:table-cell">7д</th>
                <th className="hidden px-5 py-3 text-right md:table-cell">Капіталізація</th>
                <th className="hidden px-5 py-3 text-right lg:table-cell">Обʼєм 24г</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/60 transition-colors hover:bg-surface-2/50"
                >
                  <td className="px-4 py-3.5 text-text-muted">{c.market_cap_rank ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/market/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <TokenLogo src={c.image} symbol={c.symbol} size={28} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="text-xs uppercase text-text-muted">{c.symbol}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    {formatUsd(c.current_price)}
                  </td>
                  <td className="hidden px-5 py-3 text-right md:table-cell">
                    <PriceChange value={c.price_change_percentage_24h ?? 0} size="sm" />
                  </td>
                  <td className="hidden px-5 py-3 text-right lg:table-cell">
                    <PriceChange value={c.price_change_percentage_7d_in_currency ?? 0} size="sm" />
                  </td>
                  <td className="hidden px-5 py-3 text-right text-text-muted md:table-cell">
                    {c.market_cap ? formatUsd(c.market_cap, { compact: true }) : '—'}
                  </td>
                  <td className="hidden px-5 py-3 text-right text-text-muted lg:table-cell">
                    {c.total_volume ? formatUsd(c.total_volume, { compact: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
