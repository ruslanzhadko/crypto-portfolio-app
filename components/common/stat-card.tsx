import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { PriceChange } from '@/components/common/price-change';
import { cn } from '@/lib/utils/cn';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  deltaUsd?: number;
  icon?: LucideIcon;
  iconColor?: string;
  subtext?: string;
  href?: string;
  className?: string;
  valueClassName?: string;
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  deltaUsd,
  icon: Icon,
  iconColor = 'bg-primary/10 text-primary',
  subtext,
  href,
  className,
  valueClassName,
}: StatCardProps) {
  const inner = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-surface',
        'p-5 transition-all duration-200',
        href && 'cursor-pointer',
        'hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_0_20px_-5px_rgba(108,99,255,0.25)]',
        className,
      )}
    >
      {/* Gradient shimmer on hover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-text-muted leading-tight">{label}</p>
        {Icon && (
          <div
            className={cn(
              'shrink-0 rounded-lg p-2 transition-transform duration-200 group-hover:scale-110',
              iconColor,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <p className={cn('relative mt-3 text-[1.75rem] font-bold tracking-tight leading-none', valueClassName)}>
        {value}
      </p>

      <div className="relative mt-2.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-2 gap-y-1">
        {typeof delta === 'number' && (
          <PriceChange value={delta} size="default" />
        )}
        {deltaLabel && (
          <span className="text-sm text-text-muted">{deltaLabel}</span>
        )}
        {typeof deltaUsd === 'number' && deltaUsd !== 0 && (
          <span className={cn('text-sm font-medium tabular-nums', deltaUsd >= 0 ? 'text-success' : 'text-danger')}>
            {deltaUsd >= 0 ? '+' : ''}
            {deltaUsd < 0
              ? `-$${Math.abs(deltaUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
              : `$${deltaUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
          </span>
        )}
        {subtext && !delta && (
          <span className="text-sm text-text-muted">{subtext}</span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {inner}
      </Link>
    );
  }

  return inner;
}
