'use client';

import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { formatUsd } from '@/lib/utils/format';
import { dailyChange } from '@/lib/portfolio/capital-summary';
import { AnimatedNumber } from '@/components/common/animated-number';
import { useCapitalSummary } from './use-capital-summary';

/** Capital and open-position PnL in the header, visible from any page; opens the dashboard. */
export function CapitalPill({ className }: { className?: string }) {
  const t = useTranslations('Nav');
  const state = useCapitalSummary();
  if (!state) return null;
  const { summary } = state;
  const day = dailyChange(summary, state.dayAgo);
  const dayTone = !day || day.usd === 0 ? 'text-text-muted' : day.usd > 0 ? 'text-success' : 'text-danger';
  const dayText = day
    ? day.percent !== null
      ? `${day.percent > 0 ? '+' : day.percent < 0 ? '−' : ''}${Math.abs(day.percent).toFixed(2)}%`
      : `${day.usd > 0 ? '+' : day.usd < 0 ? '−' : ''}${formatUsd(Math.abs(day.usd), { compact: true })}`
    : null;
  const total = Number(summary.totalUsd);
  const pnl = summary.pnlUsd === null ? null : Number(summary.pnlUsd);
  const showPnl = pnl !== null && Number.isFinite(pnl) && summary.positions > 0;
  const tone = !showPnl || pnl === 0 ? 'text-text-muted' : pnl > 0 ? 'text-success' : 'text-danger';
  const sign = showPnl && pnl > 0 ? '+' : showPnl && pnl < 0 ? '−' : '';
  const title = [
    `${t('pillCapital')}: ${formatUsd(total)}`,
    day ? `${t('pillDay')}: ${day.usd > 0 ? '+' : day.usd < 0 ? '−' : ''}${formatUsd(Math.abs(day.usd))}${dayText && day.percent !== null ? ` (${dayText})` : ''}` : null,
    showPnl ? `${t('pillPnl', { count: summary.positions })}: ${sign}${formatUsd(Math.abs(pnl))}` : null,
    summary.stale ? t('pillStale') : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <Link
      href="/dashboard"
      title={title}
      aria-label={title}
      className={cn(
        'flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2.5 text-xs tabular-nums transition-colors hover:bg-surface-2 sm:h-9 sm:gap-2 sm:px-3 sm:text-sm',
        summary.stale && 'opacity-70',
        className,
      )}
    >
      <Wallet className="hidden h-4 w-4 shrink-0 text-text-muted sm:block" aria-hidden="true" />
      <span className="font-semibold">
        <AnimatedNumber value={total} format={(v) => formatUsd(v, { compact: true })} />
      </span>
      {/* Daily change; on phones only when there is no position PnL to show. */}
      {dayText && day && (
        <span className={cn('font-medium', dayTone, showPnl && 'hidden sm:inline')}>
          {day.percent !== null ? (
            <AnimatedNumber
              value={day.percent}
              format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`}
            />
          ) : (
            <AnimatedNumber
              value={day.usd}
              format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatUsd(Math.abs(v), { compact: true })}`}
            />
          )}
        </span>
      )}
      {showPnl && (
        <>
          <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
          <span className={cn('font-medium', tone)}>
            <AnimatedNumber
              value={pnl}
              format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatUsd(Math.abs(v), { compact: true })}`}
            />
          </span>
          <span className="hidden text-xs text-text-muted lg:inline">
            {t('pillPositions', { count: summary.positions })}
          </span>
        </>
      )}
    </Link>
  );
}
