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
        <div className="min-w-0">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border text-xs uppercase text-text-muted">
              <tr>
                <th className="w-9 px-2 py-3 text-left sm:w-12 sm:px-4 sm:py-3.5">#</th>
                <th className="px-1 py-3 text-left sm:px-4 sm:py-3.5">Назва</th>
                <th className="w-28 px-2 py-3 text-right sm:w-36 sm:px-5">Ціна</th>
                <th className="hidden w-24 px-3 py-3 text-right md:table-cell">24г</th>
                <th className="hidden w-24 px-3 py-3 text-right 2xl:table-cell">7д</th>
                <th className="hidden w-36 px-4 py-3 text-right xl:table-cell">Капіталізація</th>
                <th className="hidden w-36 px-4 py-3 text-right 2xl:table-cell">Обʼєм 24г</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/60 transition-colors hover:bg-surface-2/50"
                >
                  <td className="px-2 py-3 text-text-muted sm:px-4 sm:py-3.5">{c.market_cap_rank ?? '—'}</td>
                  <td className="min-w-0 px-1 py-3 sm:px-4 sm:py-3.5">
                    <Link
                      href={`/market/${c.id}`}
                      className="flex min-w-0 items-center gap-2 sm:gap-3"
                    >
                      <TokenLogo src={c.image} symbol={c.symbol} size={32} className="shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold sm:text-base">{c.name}</p>
                        <p className="truncate text-xs uppercase text-text-muted">{c.symbol}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-right text-xs tabular-nums sm:px-5 sm:text-base">
                    <span className="block font-medium break-all sm:break-normal">{formatUsd(c.current_price)}</span>
                    <span className="mt-0.5 block md:hidden">
                      <PriceChange value={c.price_change_percentage_24h ?? 0} size="sm" />
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-right md:table-cell">
                    <PriceChange value={c.price_change_percentage_24h ?? 0} size="sm" />
                  </td>
                  <td className="hidden px-3 py-3 text-right 2xl:table-cell">
                    <PriceChange value={c.price_change_percentage_7d_in_currency ?? 0} size="sm" />
                  </td>
                  <td className="hidden px-4 py-3 text-right text-text-muted xl:table-cell">
                    {c.market_cap ? formatUsd(c.market_cap, { compact: true }) : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-text-muted 2xl:table-cell">
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
