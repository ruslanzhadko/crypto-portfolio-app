'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowDownRight, ArrowUpRight, Bell, Target } from 'lucide-react';
import type { NotificationLog as NotificationLogModel, TriggerType, TriggerDirection } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { formatRelative, formatUsd } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type LogWithTrigger = Omit<NotificationLogModel, 'sentAt'> & {
  sentAt: string;
  trigger: {
    triggerType: TriggerType;
    direction: TriggerDirection;
    interval: number;
    targetPrice: number | null;
    tokenName: string;
  } | null;
};

const PAGE_SIZE = 30;
const LOCALE_TAGS: Record<string, string> = { en: 'en-US', ru: 'ru-RU', uk: 'uk-UA' };

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Alerts grouped by day; rows newer than `newerThan` are marked as new. */
export function NotificationLog({
  newerThan,
  latestAt,
}: {
  newerThan: number | null;
  /** Newest alert moment; a change reloads the first page. */
  latestAt: number | null;
}) {
  const t = useTranslations('Alerts');
  const locale = useLocale();
  const [items, setItems] = useState<LogWithTrigger[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/alerts/logs?page=${page}&pageSize=${PAGE_SIZE}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      logs: LogWithTrigger[];
      pagination: { total: number; totalPages: number };
    };
    setItems(data.logs);
    setTotal(data.pagination.total);
    setTotalPages(data.pagination.totalPages);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, latestAt]);

  if (items === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('logTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const tag = LOCALE_TAGS[locale] ?? 'en-US';
  const time = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const dayLabel = (date: Date) => {
    const key = dayKey(date);
    if (key === today) return t('logToday');
    if (key === yesterday) return t('logYesterday');
    return new Intl.DateTimeFormat(tag, {
      day: 'numeric',
      month: 'long',
      ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    }).format(date);
  };
  const groups: { label: string; logs: LogWithTrigger[] }[] = [];
  for (const log of items) {
    const label = dayLabel(new Date(log.sentAt));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.logs.push(log);
    else groups.push({ label, logs: [log] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg">{t('logTitle')}</CardTitle>
        {total > 0 && <span className="text-sm text-text-muted">{t('logTotal', { count: total })}</span>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Bell} title={t('logEmptyTitle')} description={t('logEmptyDescription')} />
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <h3 className="border-y border-border bg-surface-2/50 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-text-muted sm:px-6">
                {group.label}
              </h3>
              <div className="divide-y divide-border">
                {group.logs.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isNew={newerThan !== null && new Date(log.sentAt).getTime() > newerThan}
                    time={time.format(new Date(log.sentAt))}
                    relative={formatRelative(log.sentAt, locale)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('logPrevPage')}
            </Button>
            <span className="text-xs text-text-muted">{t('logPageOf', { page, total: totalPages })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('logNextPage')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRow({
  log,
  isNew,
  time,
  relative,
}: {
  log: LogWithTrigger;
  isNew: boolean;
  time: string;
  relative: string;
}) {
  const t = useTranslations('Alerts');
  const isTarget = log.trigger?.triggerType === 'PRICE_TARGET';
  const up = isTarget ? log.trigger?.direction !== 'DOWN' : log.deltaPercent > 0;
  const minutes = log.trigger?.interval;
  const period =
    minutes === undefined
      ? null
      : minutes >= 60
        ? t('logWindowHours', { hours: Math.round(minutes / 60) })
        : t('logWindowMinutes', { minutes });
  const change = `${log.deltaPercent > 0 ? '+' : log.deltaPercent < 0 ? '−' : ''}${Math.abs(log.deltaPercent).toFixed(2)}%`;
  const tone = isTarget ? 'text-warning' : up ? 'text-success' : 'text-danger';
  const Icon = isTarget ? Target : up ? ArrowUpRight : ArrowDownRight;
  const event = isTarget
    ? t('logTargetHit', { price: log.trigger?.targetPrice != null ? formatUsd(log.trigger.targetPrice) : formatUsd(log.price) })
    : period;

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(8rem,1fr)_minmax(10rem,1.4fr)_minmax(6rem,0.8fr)_5rem] sm:gap-4 sm:px-6',
        isNew && 'bg-primary/5',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full',
          isTarget ? 'bg-warning/10' : up ? 'bg-success/10' : 'bg-danger/10',
          tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0">
        <p className="flex items-center gap-2 text-base font-semibold leading-tight">
          {log.tokenSymbol}
          {isNew && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
              {t('logNew')}
            </span>
          )}
        </p>
        {/* Phones: the event and price under the ticker. */}
        <p className="truncate text-sm text-text-muted sm:hidden">
          {[event, formatUsd(log.price)].filter(Boolean).join(' · ')}
        </p>
        <p className="hidden truncate text-sm text-text-muted sm:block">{log.trigger?.tokenName ?? ''}</p>
        {log.status !== 'sent' && (
          <p className="truncate text-xs text-danger" title={log.message}>
            {t('logNotDelivered')}
          </p>
        )}
      </div>

      <div className="hidden min-w-0 sm:block">
        {isTarget ? (
          <p className={cn('text-base font-semibold', tone)}>{event}</p>
        ) : (
          <p className="text-base">
            <span className={cn('font-semibold tabular-nums', tone)}>{change}</span>
            {period && <span className="ml-1.5 text-text-muted">{period}</span>}
          </p>
        )}
      </div>

      <p className="hidden text-base tabular-nums sm:block">{formatUsd(log.price)}</p>

      <div className="text-right">
        {!isTarget && <p className={cn('text-base font-semibold tabular-nums sm:hidden', tone)}>{change}</p>}
        <p className="text-sm tabular-nums text-text-muted sm:text-base sm:text-text" title={relative}>
          {time}
        </p>
      </div>
    </div>
  );
}
