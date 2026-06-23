import { Bell, Plus, AlertCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { TriggerCard } from '@/components/alerts/trigger-card';
import { NotificationLog } from '@/components/alerts/notification-log';
import { EmptyState } from '@/components/common/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const t = await getTranslations('Alerts');

  const [triggers, user] = await Promise.all([
    prisma.priceTrigger.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { telegramChatId: true },
    }),
  ]);

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('pageTitle')}</h1>
          <p className="text-sm text-text-muted">{t('pageDescription')}</p>
        </div>
        <Button asChild>
          <Link href="/alerts/new">
            <Plus className="h-4 w-4" />
            {t('createTriggerButton')}
          </Link>
        </Button>
      </div>

      {!user?.telegramChatId && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
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

      <Tabs defaultValue="triggers">
        <TabsList>
          <TabsTrigger value="triggers">{t('tabTriggers', { count: triggers.length })}</TabsTrigger>
          <TabsTrigger value="logs">{t('tabLogs')}</TabsTrigger>
        </TabsList>
        <TabsContent value="triggers" className="space-y-4">
          {triggers.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={t('emptyTriggersTitle')}
              description={t('emptyTriggersDescription')}
              action={
                <Button asChild>
                  <Link href="/alerts/new">{t('createFirstTrigger')}</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {triggers.map((tr) => (
                <TriggerCard
                  key={tr.id}
                  trigger={tr}
                  currentPrice={currentPriceMap.get(tr.tokenId)}
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="logs">
          <NotificationLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
