'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChainAllocation } from '@/lib/services/portfolio';
import { formatUsd } from '@/lib/utils/format';

type TFn = ReturnType<typeof useTranslations<'NetworkAllocationChart'>>;

interface NetworkAllocationProps {
  chains: ChainAllocation[];
}

export function NetworkAllocationChart({ chains }: NetworkAllocationProps) {
  const t = useTranslations('NetworkAllocationChart');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        {chains.length === 0 ? (
          <p className="text-sm text-text-muted">{t('noData')}</p>
        ) : !mounted ? (
          <div className="h-full animate-pulse rounded-lg bg-surface-2" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chains}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="displayName"
                type="category"
                tick={{ fill: '#8888a8', fontSize: 12 }}
                stroke="#2a2a3a"
                width={84}
              />
              <Tooltip
                content={<ChainTooltip t={t} />}
                cursor={{ fill: 'rgba(108,99,255,0.08)' }}
              />
              <Bar dataKey="totalUsd" radius={[0, 6, 6, 0]}>
                {chains.map((c, i) => (
                  <Cell key={i} fill={c.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ChainTooltip({ active, payload, t }: TooltipProps<number, string> & { t: TFn }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as ChainAllocation | undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-card">
      <p className="font-medium">{p.displayName}</p>
      <p className="text-text-muted">{formatUsd(p.totalUsd)}</p>
      <p className="text-text-muted">
        {p.share.toFixed(2)}% · {t('tooltipTokens', { count: p.tokenCount })}
      </p>
    </div>
  );
}
