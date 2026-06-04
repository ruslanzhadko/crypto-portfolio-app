import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatUsd } from '@/lib/utils/format';
import type { OpenInterestData } from '@/lib/services/open-interest';

function exchangeUrl(exchange: string, symbol: string): string {
  const s = symbol.toUpperCase();
  switch (exchange) {
    case 'Binance': return `https://www.binance.com/en/futures/${s}USDT`;
    case 'Bybit':   return `https://www.bybit.com/trade/usdt/${s}USDT`;
    case 'OKX':     return `https://www.okx.com/trade-swap/${s.toLowerCase()}-usdt-swap`;
    default:        return '#';
  }
}

interface Props {
  data: OpenInterestData | null;
  symbol: string;
}

export function OpenInterestCard({ data, symbol }: Props) {
  const cardBase =
    'group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_0_20px_-5px_rgba(108,99,255,0.25)]';

  if (!data) {
    return (
      <div className={cardBase}>
        <p className="text-sm font-medium text-text-muted leading-tight">Відкритий інтерес</p>
        <p className="mt-3 text-[1.75rem] font-bold leading-none text-text-muted">—</p>
        <p className="mt-2 text-xs text-text-muted">Ф&apos;ючерси недоступні</p>
      </div>
    );
  }

  const { totalUsd, totalChange24hPct, exchanges } = data;
  const changePositive = totalChange24hPct !== null && totalChange24hPct >= 0;

  return (
    <div className={cardBase}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-text-muted leading-tight">Відкритий інтерес</p>
          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-text-muted">
            ф&apos;ючерси
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2 leading-none">
          <span className="text-[1.75rem] font-bold tracking-tight">
            {formatUsd(totalUsd, { compact: true })}
          </span>
          {totalChange24hPct !== null && (
            <span
              className={cn(
                'text-sm font-medium tabular-nums',
                changePositive ? 'text-success' : 'text-danger',
              )}
            >
              {changePositive ? '+' : ''}
              {totalChange24hPct.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {exchanges.map((ex) => (
            <a
              key={ex.exchange}
              href={exchangeUrl(ex.exchange, symbol)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-surface-2"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ex.color }}
                />
                <span className="text-sm text-text-muted group-hover:text-text">
                  {ex.exchange}
                </span>
                <ExternalLink className="h-2.5 w-2.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-xs font-medium">
                  {formatUsd(ex.openInterestUsd, { compact: true })}
                </span>
                {ex.change24hPct !== null ? (
                  <span
                    className={cn(
                      'w-12 text-right text-xs',
                      ex.change24hPct >= 0 ? 'text-success' : 'text-danger',
                    )}
                  >
                    {ex.change24hPct >= 0 ? '+' : ''}
                    {ex.change24hPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="w-12 text-right text-[10px] text-text-muted">—</span>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
