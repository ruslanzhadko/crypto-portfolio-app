'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatUsd, formatPercent } from '@/lib/utils/format';
import { TrendingUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const RANGES = [
  { label: '1Д', value: 1 },
  { label: '7Д', value: 7 },
  { label: '30Д', value: 30 },
] as const;

interface SnapshotPoint {
  timestamp: number;
  totalUsd: number;
}

type SnapshotSource = 'snapshots' | 'reconstructed' | 'mixed' | 'empty';

interface PortfolioChartProps {
  totalUsd: number;
  priceChange24h: number;
  hiddenTokensCount?: number;
}

export function PortfolioChart({ totalUsd, priceChange24h, hiddenTokensCount = 0 }: PortfolioChartProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [points, setPoints] = useState<SnapshotPoint[] | null>(null);
  const [source, setSource] = useState<SnapshotSource>('empty');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPoints(null);
    fetch(`/api/portfolio/snapshot?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = (await res.json()) as {
          points: SnapshotPoint[];
          source: SnapshotSource;
        };
        if (!cancelled) {
          setPoints(body.points ?? []);
          setSource(body.source ?? 'empty');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPoints([]);
          setSource('empty');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, days]);

  async function resetHistory() {
    setResetting(true);
    try {
      await fetch('/api/portfolio/snapshots', { method: 'DELETE' });
      setPoints(null);
      setSource('empty');
      // Перезапускаємо fetch
      setDays((d) => d);
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        className={cn('flex cursor-pointer flex-row items-center justify-between space-y-0 select-none', open ? 'pb-2' : 'pb-6')}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <CardTitle>Вартість портфеля</CardTitle>
          <span className="font-mono text-sm font-semibold text-text">
            {formatUsd(totalUsd, { compact: true })}
          </span>
          <span className={cn('text-xs font-medium', (priceChange24h ?? 0) >= 0 ? 'text-green-500' : 'text-red-500')}>
            {formatPercent(priceChange24h)}
          </span>
          {open && (source === 'reconstructed' || source === 'mixed') && (
            <span
              className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning"
              title="Графік реконструйовано з історії цін CoinGecko на основі поточних балансів. Не враховує реальних змін балансу у часі."
            >
              ≈ оцінка
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {open &&
            RANGES.map((r) => (
              <Button
                key={r.value}
                variant={days === r.value ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-7 px-2 text-xs', days === r.value && 'text-primary-foreground')}
                onClick={(e) => {
                  e.stopPropagation();
                  setDays(r.value);
                }}
              >
                {r.label}
              </Button>
            ))}
          <ChevronDown
            className={cn('h-4 w-4 text-text-muted transition-transform duration-200', open && 'rotate-180')}
          />
        </div>
      </CardHeader>
      {open && hiddenTokensCount > 0 && (
        <div className="flex items-center justify-between border-b border-border px-6 py-2">
          <p className="text-xs text-text-muted">
            {hiddenTokensCount} прихованих токен(ів) виключено зі статистики.
            Якщо ви нещодавно приховали токен з великою вартістю — скиньте історію.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs text-destructive hover:text-destructive"
            disabled={resetting}
            onClick={(e) => { e.stopPropagation(); void resetHistory(); }}
          >
            {resetting ? 'Скидання…' : 'Скинути історію'}
          </Button>
        </div>
      )}
      {open && (
        <CardContent className="h-[300px]">
          {points === null && <Skeleton className="h-full w-full rounded-lg" />}
          {points && points.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              title="Історія недоступна"
              description="Жоден з ваших токенів не має coingeckoId — реконструкція історії з CoinGecko неможлива. Зробіть Sync щоб підвантажити ринкові метадані."
            />
          )}
          {points && points.length > 0 && mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6c63ff" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6c63ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(t: number) =>
                    formatDate(new Date(t), days <= 1 ? 'HH:mm' : 'MMM d')
                  }
                  tick={{ fill: '#8888a8', fontSize: 12 }}
                  stroke="#2a2a3a"
                  minTickGap={32}
                />
                <YAxis
                  tickFormatter={(v: number) => formatUsd(v, { compact: true })}
                  tick={{ fill: '#8888a8', fontSize: 12 }}
                  stroke="#2a2a3a"
                  width={64}
                />
                <Tooltip content={<PortfolioTooltip />} />
                <Area
                  type="monotone"
                  dataKey="totalUsd"
                  stroke="#6c63ff"
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function PortfolioTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-card">
      {typeof label === 'number' && (
        <p className="mb-1 text-text-muted">{formatDate(new Date(label), 'PPp')}</p>
      )}
      <p className="font-mono text-sm font-semibold">
        {typeof value === 'number' ? formatUsd(value) : '—'}
      </p>
    </div>
  );
}
