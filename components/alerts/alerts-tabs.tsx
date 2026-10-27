'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, History, Target, type LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { alertsSeenAt, markAlertsSeen, useAlertsUnread, useLatestAlertAt } from '@/lib/alerts/unread';
import { cn } from '@/lib/utils/cn';
import { NotificationLog } from './notification-log';

export type AlertsTab = 'logs' | 'triggers' | 'positions';

/** Sent by the position settings card so the tab shows how many kinds are on without a reload. */
export const POSITION_KINDS_EVENT = 'position-alerts-kinds';

/**
 * The log of fired alerts first, then the two kinds of rules that produce them. Each tab is a card
 * saying what is inside and its state, so the log is not mistaken for settings and back.
 */
export function AlertsTabs({
  triggerCount,
  activeTriggers,
  triggers,
  positions,
  positionKinds = 0,
  initialTab,
}: {
  triggerCount: number;
  activeTriggers: number;
  triggers: ReactNode;
  /** Position notification settings; absent while exchanges are off for the user. */
  positions?: ReactNode;
  /** Position alert kinds switched on (of 4). */
  positionKinds?: number;
  initialTab?: AlertsTab;
}) {
  const t = useTranslations('Alerts');
  const [tab, setTab] = useState<string>(initialTab ?? 'logs');
  const [kinds, setKinds] = useState(positionKinds);
  const unread = useAlertsUnread();
  const latestAt = useLatestAlertAt();
  // Alerts newer than this are highlighted; captured before the log marks them seen.
  const [seenBefore, setSeenBefore] = useState<number | null>(null);

  useEffect(() => {
    if (tab !== 'logs' || latestAt === undefined) return;
    setSeenBefore((before) => before ?? alertsSeenAt());
    markAlertsSeen();
  }, [tab, latestAt]);

  useEffect(() => {
    const onKinds = (event: Event) => setKinds((event as CustomEvent<number>).detail);
    window.addEventListener(POSITION_KINDS_EVENT, onKinds);
    return () => window.removeEventListener(POSITION_KINDS_EVENT, onKinds);
  }, []);

  const cards: { value: AlertsTab; icon: LucideIcon; title: string; short: string; hint: string; status: ReactNode }[] = [
    {
      value: 'logs',
      icon: History,
      title: t('tabLogs'),
      short: t('tabLogs'),
      hint: t('tabLogsHint'),
      status: unread && tab !== 'logs' ? (
        <span className="inline-flex items-center gap-1.5 text-danger">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-danger" />
          {t('tabLogsNew')}
        </span>
      ) : null,
    },
    {
      value: 'triggers',
      icon: Target,
      title: t('tabTriggersTitle'),
      short: t('tabTriggersShort'),
      hint: t('tabTriggersHint'),
      status: triggerCount
        ? t('tabTriggersStatus', { active: activeTriggers, total: triggerCount })
        : t('tabTriggersNone'),
    },
    ...(positions
      ? [
          {
            value: 'positions' as const,
            icon: Activity,
            title: t('tabPositionsTitle'),
            short: t('tabPositionsShort'),
            hint: t('tabPositionsHint'),
            status: kinds ? t('tabPositionsOn', { count: kinds }) : t('tabPositionsOff'),
          },
        ]
      : []),
  ];

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList
        className={cn(
          'grid h-auto w-full gap-2 bg-transparent p-0',
          cards.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
        )}
      >
        {cards.map(({ value, icon: Icon, title, short, hint, status }) => (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(
              'group h-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-text shadow-none sm:px-4 sm:py-3',
              'hover:border-primary/40 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-text data-[state=active]:shadow-none',
            )}
          >
            <span className="flex w-full flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Icon
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-text-muted group-data-[state=active]:text-primary"
              />
              <span className="truncate text-sm font-semibold sm:hidden">{short}</span>
              <span className="hidden truncate text-base font-semibold sm:inline">{title}</span>
            </span>
            <span className="hidden text-xs font-normal text-text-muted sm:block">{hint}</span>
            <span className="min-h-4 text-xs font-medium text-text-muted">{status}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="logs" className="mt-4">
        <NotificationLog newerThan={seenBefore} latestAt={latestAt ?? null} />
      </TabsContent>
      <TabsContent value="triggers" className="mt-4">
        {triggers}
      </TabsContent>
      {positions && (
        <TabsContent value="positions" className="mt-4">
          {positions}
        </TabsContent>
      )}
    </Tabs>
  );
}
