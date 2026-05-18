import Link from 'next/link';
import { Bell, Plus, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Сповіщення</h1>
          <p className="text-sm text-text-muted">
            Цінові тригери та журнал повідомлень.
          </p>
        </div>
        <Button asChild>
          <Link href="/alerts/new">
            <Plus className="h-4 w-4" />
            Створити тригер
          </Link>
        </Button>
      </div>

      {!user?.telegramChatId && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Telegram не налаштовано</p>
              <p className="text-text-muted">
                Введіть Telegram Chat ID у налаштуваннях, щоб отримувати сповіщення.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">Налаштувати</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="triggers">
        <TabsList>
          <TabsTrigger value="triggers">Тригери ({triggers.length})</TabsTrigger>
          <TabsTrigger value="logs">Журнал</TabsTrigger>
        </TabsList>
        <TabsContent value="triggers" className="space-y-4">
          {triggers.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Тригери відсутні"
              description="Створіть тригер, щоб отримувати сповіщення про цінові аномалії."
              action={
                <Button asChild>
                  <Link href="/alerts/new">Створити перший тригер</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {triggers.map((t) => (
                <TriggerCard key={t.id} trigger={t} />
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
