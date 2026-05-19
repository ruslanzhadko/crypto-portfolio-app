'use client';

import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipProps } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AggregatedToken } from '@/lib/services/portfolio';
import { formatUsd } from '@/lib/utils/format';
import { EmptyState } from '@/components/common/empty-state';
import { PieChart as PieIcon } from 'lucide-react';

const COLORS = ['#6c63ff', '#a855f7', '#22c55e', '#f59e0b', '#0ea5e9', '#ef4444', '#14f195', '#f3ba2f'];

export function AllocationChart({ tokens }: { tokens: AggregatedToken[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const top = tokens.slice(0, 7);
  const rest = tokens.slice(7);
  const restUsd = rest.reduce((s, t) => s + t.totalUsd, 0);
  const restShare = rest.reduce((s, t) => s + t.share, 0);

  const data = [
    ...top.map((t, i) => ({
      name: t.symbol,
      value: t.totalUsd,
      share: t.share,
      color: COLORS[i % COLORS.length] ?? '#6c63ff',
    })),
    ...(rest.length > 0
      ? [{ name: `Інші (${rest.length})`, value: restUsd, share: restShare, color: '#3a3a4a' }]
      : []),
  ];

  if (tokens.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Розподіл активів</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={PieIcon}
            title="Немає даних"
            description="Додайте гаманець та зробіть Sync."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Розподіл активів</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pb-4">
        {/* Pie має фіксовану висоту, легенда росте знизу */}
        <div className="h-[220px]">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<AllocTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full animate-pulse rounded-full bg-surface-2 mx-auto aspect-square max-h-full" />
          )}
        </div>

        {/* Легенда: flex-grid з мінімальною шириною елемента, переноситься на нові рядки */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3 gap-y-1.5 text-xs">
          {data.map((d, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="min-w-0 flex-1 truncate text-text-muted">{d.name}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {d.share.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AllocTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as { name: string; value: number; share: number } | undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-card">
      <p className="font-medium">{p.name}</p>
      <p className="text-text-muted">{formatUsd(p.value)}</p>
      <p className="text-text-muted">{p.share.toFixed(2)}%</p>
    </div>
  );
}
