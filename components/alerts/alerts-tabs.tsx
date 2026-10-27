'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { alertsSeenAt, markAlertsSeen, useAlertsUnread, useLatestAlertAt } from '@/lib/alerts/unread';
import { NotificationLog } from './notification-log';

export type AlertsTab = 'triggers' | 'positions' | 'logs';

/**
 * Triggers, position notifications and the notification log. With unseen alerts the page opens on
 * the log (unless a tab was asked for in the link), marks them new there and clears the navigation dot.
 */
export function AlertsTabs({
  triggerCount,
  triggers,
  positions,
  initialTab,
}: {
  triggerCount: number;
  triggers: ReactNode;
  /** Position notification settings; absent while exchanges are off for the user. */
  positions?: ReactNode;
  initialTab?: AlertsTab;
}) {
  const t = useTranslations('Alerts');
  const [tab, setTab] = useState<string>(initialTab ?? 'triggers');
  const unread = useAlertsUnread();
  const latestAt = useLatestAlertAt();
  // Alerts newer than this are highlighted; captured before the log marks them seen.
  const [seenBefore, setSeenBefore] = useState<number | null>(null);
  const [autoOpened, setAutoOpened] = useState(!!initialTab);

  useEffect(() => {
    if (!unread || autoOpened) return;
    setAutoOpened(true);
    setSeenBefore(alertsSeenAt());
    setTab('logs');
  }, [unread, autoOpened]);

  useEffect(() => {
    if (tab !== 'logs' || latestAt === undefined) return;
    setSeenBefore((before) => before ?? alertsSeenAt());
    markAlertsSeen();
  }, [tab, latestAt]);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="triggers">{t('tabTriggers', { count: triggerCount })}</TabsTrigger>
        {positions && <TabsTrigger value="positions">{t('tabPositions')}</TabsTrigger>}
        <TabsTrigger value="logs" className="gap-1.5">
          {t('tabLogs')}
          {unread && tab !== 'logs' && (
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-danger" />
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="triggers">{triggers}</TabsContent>
      {positions && <TabsContent value="positions">{positions}</TabsContent>}
      <TabsContent value="logs">
        <NotificationLog newerThan={seenBefore} latestAt={latestAt ?? null} />
      </TabsContent>
    </Tabs>
  );
}
