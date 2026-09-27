'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { formatDate, formatUsd, formatPercent } from '@/lib/utils/format';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SnapshotPoint {
  timestamp: number;
  totalUsd: number;
}

interface PortfolioChartProps {
  totalUsd: number;
  priceChange24h: number;
  priceChange24hUsd: number;
  hiddenTokensCount?: number;
  onVisibilityChange: (visible: boolean) => void;
}

const CHART_VISIBILITY_KEY = 'dashboard-portfolio-chart-visible-v1';

export function PortfolioChart({
  totalUsd,
  priceChange24h,
  priceChange24hUsd,
  hiddenTokensCount = 0,
  onVisibilityChange,
}: PortfolioChartProps) {
  const t = useTranslations('PortfolioChart');
  const [mounted, setMounted] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [revision, setRevision] = useState(0);
  const [showAnomalousEstimate, setShowAnomalousEstimate] = useState(false);

  const ranges = [
    { label: t('range1d'), value: 1 as const },
    { label: t('range7d'), value: 7 as const },
    { label: t('range30d'), value: 30 as const },
  ];
  const [points, setPoints] = useState<SnapshotPoint[] | null>(null);
  const anomalousEstimate =
    totalUsd > 0 &&
    (points?.some((point) => point.totalUsd > totalUsd * 20) ?? false);

  useEffect(() => {
    setMounted(true);
    let visible = true;
    try {
      visible = localStorage.getItem(CHART_VISIBILITY_KEY) !== 'false';
    } catch {}
    setShowChart(visible);
    onVisibilityChange(visible);
    setPreferenceLoaded(true);
  }, [onVisibilityChange]);

  useEffect(() => {
    if (!preferenceLoaded || !showChart) return;
    let cancelled = false;
    setPoints(null);
    fetch(`/api/portfolio/snapshot?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = (await res.json()) as {
          points: SnapshotPoint[];
        };
        if (!cancelled) {
          setPoints(body.points ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPoints([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [days, revision, preferenceLoaded, showChart]);

  function toggleChart() {
    const next = !showChart;
    setShowChart(next);
    onVisibilityChange(next);
    try {
      localStorage.setItem(CHART_VISIBILITY_KEY, String(next));
    } catch {}
  }

  async function resetHistory() {
    setResetting(true);
    try {
      await fetch('/api/portfolio/snapshots', { method: 'DELETE' });
      setPoints(null);
      setRevision((value) => value + 1);
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card className="h-full min-w-0">
      <CardHeader className="space-y-0 xl:min-h-[132px] xl:py-[17px]">
        <div className="grid min-w-0 grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4">
          <CardTitle className="text-sm font-medium text-text-muted">{t('cardTitle')}</CardTitle>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:col-span-2 sm:row-start-2">
            <p className="min-w-0 font-mono text-3xl font-bold tracking-tight tabular-nums text-text sm:text-4xl">
              {formatUsd(totalUsd, { compact: true })}
            </p>
            {preferenceLoaded && showChart && hiddenTokensCount > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-xs text-text-muted" title={t('hiddenTokensNote', { count: hiddenTokensCount })}>
                  {t('hiddenTokensBrief', { count: hiddenTokensCount })}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={resetting}
                  onClick={() => void resetHistory()}
                >
                  {resetting ? t('resetting') : t('resetHistory')}
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm sm:col-start-1 sm:row-start-3">
            <span className={cn('font-semibold tabular-nums', priceChange24h >= 0 ? 'text-success' : 'text-danger')}>
              {formatPercent(priceChange24h)}
            </span>
            <span className="text-text-muted">{t('deltaLabel')}</span>
            {priceChange24hUsd !== 0 && (
              <span className={cn('font-medium tabular-nums', priceChange24hUsd >= 0 ? 'text-success' : 'text-danger')}>
                {priceChange24hUsd > 0 ? '+' : '-'}{formatUsd(Math.abs(priceChange24hUsd))}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1 sm:justify-end">
            {preferenceLoaded && showChart && (
              <div className="flex items-center gap-1" role="group" aria-label={t('rangeLabel')}>
                {ranges.map((r) => (
                  <Button
                    key={r.value}
                    variant={days === r.value ? 'default' : 'ghost'}
                    size="sm"
                    className={cn('h-7 px-2 text-xs', days === r.value && 'text-primary-foreground')}
                    aria-pressed={days === r.value}
                    onClick={() => {
                      setShowAnomalousEstimate(false);
                      setDays(r.value);
                    }}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              aria-expanded={preferenceLoaded && showChart}
              aria-controls="portfolio-history"
              onClick={toggleChart}
            >
              {preferenceLoaded && showChart ? t('hideChart') : t('showChart')}
              <ChevronDown className={cn('h-4 w-4 transition-transform', preferenceLoaded && showChart && 'rotate-180')} aria-hidden />
            </Button>
          </div>
        </div>
      </CardHeader>
      <div id="portfolio-history">
      {preferenceLoaded && showChart && <CardContent className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none">
          {points === null && <Skeleton className="h-[130px] w-full rounded-lg sm:h-[190px]" />}
          {points && points.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              className="min-h-[130px] p-4 sm:min-h-[190px]"
            />
          )}
          {anomalousEstimate && !showAnomalousEstimate && (
            <div className="flex min-h-[130px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 text-center sm:min-h-[190px]">
              <p className="text-sm font-medium">{t('unreliableTitle')}</p>
              <p className="max-w-md text-xs text-text-muted">{t('unreliableDescription')}</p>
              <Button variant="outline" size="sm" onClick={() => setShowAnomalousEstimate(true)}>
                {t('showEstimate')}
              </Button>
            </div>
          )}
          {points && points.length > 0 && mounted && (!anomalousEstimate || showAnomalousEstimate) && (
            <div className="h-[130px] sm:h-[190px]">
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
            </div>
          )}
      </CardContent>}
      </div>
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
