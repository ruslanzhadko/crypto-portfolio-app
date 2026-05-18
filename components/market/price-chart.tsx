'use client';

import { useState, useEffect } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatUsd } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface PricePoint {
  timestamp: number;
  price: number;
}

interface PriceChartProps {
  tokenId: string;
  initialDays?: number;
}

const RANGES = [
  { label: '1Д', value: 1 },
  { label: '7Д', value: 7 },
  { label: '30Д', value: 30 },
  { label: '90Д', value: 90 },
  { label: '1Р', value: 365 },
] as const;

export function PriceChart({ tokenId, initialDays = 7 }: PriceChartProps) {
  const [days, setDays] = useState<number>(initialDays);
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setError(null);
    fetch(`/api/market/${tokenId}/history?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Не вдалось завантажити графік');
        const data = (await res.json()) as { points: PricePoint[] };
        if (!cancelled) setPoints(data.points);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Помилка завантаження');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId, days]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Динаміка ціни</CardTitle>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={days === r.value ? 'default' : 'ghost'}
              size="sm"
              className={cn('h-7 px-2 text-xs', days === r.value && 'text-primary-foreground')}
              onClick={() => setDays(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-[320px]">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && points === null && <Skeleton className="h-full w-full rounded-lg" />}
        {!error && points && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
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
                domain={['auto', 'auto']}
                tickFormatter={(v: number) =>
                  formatUsd(v, { minimumFractionDigits: v < 1 ? 4 : 2 })
                }
                tick={{ fill: '#8888a8', fontSize: 12 }}
                stroke="#2a2a3a"
                width={70}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#6c63ff"
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value;
  const t = typeof label === 'number' ? new Date(label) : null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-card">
      {t && (
        <p className="mb-1 text-text-muted">{formatDate(t, 'PPp')}</p>
      )}
      <p className="font-mono text-sm font-semibold">
        {typeof value === 'number' ? formatUsd(value) : '—'}
      </p>
    </div>
  );
}
