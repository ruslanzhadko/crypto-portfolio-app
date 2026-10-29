import { Bell, Plus, AlertCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { TriggerCard } from '@/components/alerts/trigger-card';
import { AlertsTabs } from '@/components/alerts/alerts-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PositionAlertsCard } from '@/components/alerts/position-alerts-card';
import { exchangesEnabled } from '@/lib/exchanges/config';
import { isDemoUser } from '@/lib/demo/config';
import { DemoNotice } from '@/components/demo/demo-context';
import { readPositionAlertSettings } from '@/lib/positions/alert-settings';

export const dynamic = 'force-dynamic';

const TABS = ['logs', 'triggers', 'positions'] as const;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;

  const t = await getTranslations('Alerts');
  const tp = await getTranslations('PositionAlerts');
  const positionAlerts = exchangesEnabled(session.user.id);
  const demo = isDemoUser(session.user.id);
  const td = await getTranslations('Demo');

  const [triggers, user, connections] = await Promise.all([
    prisma.priceTrigger.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { telegramChatId: true, telegramNotificationsEnabled: true, positionAlerts: true },
    }),
    positionAlerts
      ? prisma.exchangeConnection.findMany({
          where: { userId: session.user.id, status: { in: ['PENDING', 'ACTIVE', 'PARTIAL', 'ERROR'] } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, label: true, exchange: true },
        })
      : [],
  ]);
  const telegramReady = !!user?.telegramChatId && !!user.telegramNotificationsEnabled;
  const initialTab = TABS.find((name) => name === tab && (name !== 'positions' || positionAlerts));

  const priceTargetIds = triggers
    .filter((tr) => tr.triggerType === 'PRICE_TARGET')
    .map((tr) => tr.tokenId);
  const cachedPrices =
    priceTargetIds.length > 0
      ? await prisma.tokenPrice.findMany({
          where: { tokenId: { in: priceTargetIds } },
          select: { tokenId: true, currentPrice: true },
        })
      : [];
  const currentPriceMap = new Map(cachedPrices.map((p) => [p.tokenId, p.currentPrice]));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-3xl">{t('pageTitle')}</h1>
          <p className="text-sm text-text-muted">{t('pageDescription')}</p>
        </div>
        {!demo && (
          <Button asChild>
            <Link href="/alerts/new">
              <Plus className="h-4 w-4" />
              {t('createTriggerButton')}
            </Link>
          </Button>
        )}
      </div>

      {demo && <DemoNotice title={td('alertsTitle')} description={td('alertsDescription')} />}
      {!demo && !telegramReady && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-start gap-3 p-4 pt-4 sm:p-4 sm:pt-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="flex-1 text-sm">
              <p className="font-medium">{t('telegramWarningTitle')}</p>
              <p className="text-text-muted">{t('telegramWarningDescription')}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">{t('telegramSetupButton')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertsTabs
        triggerCount={triggers.length}
        activeTriggers={triggers.filter((tr) => tr.isActive).length}
        positionKinds={
          (['opened', 'closed', 'liquidation', 'pnlSign', 'dailySummary'] as const).filter(
            (kind) => readPositionAlertSettings(user?.positionAlerts ?? null)[kind],
          ).length
        }
        initialTab={initialTab}
        positions={
          positionAlerts ? (
            <Card>
              <CardHeader>
                <CardTitle>{tp('cardTitle')}</CardTitle>
                <CardDescription>{tp('cardDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <PositionAlertsCard
                  initial={readPositionAlertSettings(user?.positionAlerts ?? null)}
                  connections={connections}
                />
              </CardContent>
            </Card>
          ) : undefined
        }
        triggers={
          triggers.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={t('emptyTriggersTitle')}
              description={t('emptyTriggersDescription')}
              action={
                <Button asChild>
                  <Link href={demo ? '/demo' : '/alerts/new'}>{t('createFirstTrigger')}</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
              {triggers.map((tr) => (
                <TriggerCard key={tr.id} trigger={tr} currentPrice={currentPriceMap.get(tr.tokenId)} />
              ))}
            </div>
          )
        }
      />
    </div>
  );
}
