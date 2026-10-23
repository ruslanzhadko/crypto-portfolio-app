'use client';

import { useTranslations } from 'next-intl';
import { Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { formatUsd } from '@/lib/utils/format';
import { useCapitalSummary } from './use-capital-summary';

/** Capital and open-position PnL in the header, visible from any page; opens the dashboard. */
export function CapitalPill({ className }: { className?: string }) {
  const t = useTranslations('Nav');
  const summary = useCapitalSummary();
  if (!summary) return null;
  const total = Number(summary.totalUsd);
  const pnl = summary.pnlUsd === null ? null : Number(summary.pnlUsd);
  const showPnl = pnl !== null && Number.isFinite(pnl) && summary.positions > 0;
  const tone = !showPnl || pnl === 0 ? 'text-text-muted' : pnl > 0 ? 'text-success' : 'text-danger';
  const sign = showPnl && pnl > 0 ? '+' : showPnl && pnl < 0 ? '−' : '';
  const title = [
    `${t('pillCapital')}: ${formatUsd(total)}`,
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
      <span className="font-semibold">{formatUsd(total, { compact: true })}</span>
      {showPnl && (
        <>
          <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
          <span className={cn('font-medium', tone)}>
            {sign}
            {formatUsd(Math.abs(pnl), { compact: true })}
          </span>
          <span className="hidden text-xs text-text-muted lg:inline">
            {t('pillPositions', { count: summary.positions })}
          </span>
        </>
      )}
    </Link>
  );
}
