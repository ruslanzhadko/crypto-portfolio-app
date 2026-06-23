import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { Bell, ShieldOff, Users, Wallet, ArrowRight } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { StatCard } from '@/components/common/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/utils/format';
import { TelegramWebhookCard } from '@/components/admin/telegram-webhook-card';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    const locale = await getLocale();
    redirect({ href: '/dashboard', locale });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalUsers, blockedUsers, totalWallets, activeTriggers, notifs24h, notifsSent, notifsFailed] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: true } }),
      prisma.wallet.count(),
      prisma.priceTrigger.count({ where: { isActive: true } }),
      prisma.notificationLog.count({ where: { sentAt: { gte: since24h } } }),
      prisma.notificationLog.count({ where: { status: 'sent' } }),
      prisma.notificationLog.count({ where: { status: 'failed' } }),
    ]);

  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, email: true, name: true, createdAt: true, role: true, isBlocked: true },
  });

  const t = await getTranslations('Admin');
  const locale = await getLocale();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('pageTitle')}</h1>
        <p className="text-sm text-text-muted">{t('pageDescription')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('statUsers')}
          value={totalUsers}
          icon={Users}
          subtext={blockedUsers > 0 ? t('blockedSubtext', { count: blockedUsers }) : undefined}
          href="/admin/users"
        />
        <StatCard label={t('statBlocked')} value={blockedUsers} icon={ShieldOff} href="/admin/users" />
        <StatCard label={t('statWallets')} value={totalWallets} icon={Wallet} />
        <StatCard label={t('statActiveTriggers')} value={activeTriggers} icon={Bell} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TelegramWebhookCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>{t('notificationsCardTitle')}</CardTitle>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-xs text-text-muted">
              <Link href="/admin/logs">
                {t('viewAllLink')} <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{t('notifications24h')}</span>
              <span className="font-medium">{notifs24h}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{t('notificationsTotalSuccess')}</span>
              <span className="font-medium text-success">{notifsSent}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{t('notificationsFailed')}</span>
              <span className={`font-medium ${notifsFailed > 0 ? 'text-danger' : 'text-text-muted'}`}>
                {notifsFailed}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>{t('recentUsersCardTitle')}</CardTitle>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-xs text-text-muted">
              <Link href="/admin/users">
                {t('viewAllLink')} <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentUsers.length === 0 && (
              <p className="text-text-muted">{t('noUsers')}</p>
            )}
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name ?? u.email}</p>
                  <p className="truncate font-mono text-xs text-text-muted">{u.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {u.isBlocked && <Badge variant="danger" className="text-[10px]">{t('blockedBadge')}</Badge>}
                  <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'} className="text-[10px]">
                    {u.role}
                  </Badge>
                  <span className="text-xs text-text-muted">{formatRelative(u.createdAt, locale)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
