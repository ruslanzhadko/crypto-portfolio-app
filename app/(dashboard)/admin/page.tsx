import { redirect } from 'next/navigation';
import { Bell, ShieldOff, Users, Wallet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { StatCard } from '@/components/common/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    redirect('/dashboard');
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
    select: { id: true, email: true, name: true, createdAt: true, role: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Адміністрування</h1>
        <p className="text-sm text-text-muted">Огляд та управління користувачами.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Користувачі" value={totalUsers} icon={Users} />
        <StatCard label="Заблоковані" value={blockedUsers} icon={ShieldOff} />
        <StatCard label="Гаманці" value={totalWallets} icon={Wallet} />
        <StatCard
          label="Активні тригери"
          value={activeTriggers}
          icon={Bell}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Сповіщення</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">За останні 24г</span>
              <span className="font-medium">{notifs24h}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Усього успішних</span>
              <span className="font-medium text-success">{notifsSent}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Невдалих</span>
              <span className="font-medium text-danger">{notifsFailed}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Нові користувачі</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentUsers.length === 0 && (
              <p className="text-text-muted">Поки що порожньо.</p>
            )}
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name ?? u.email}</p>
                  <p className="truncate font-mono text-xs text-text-muted">{u.email}</p>
                </div>
                <span className="text-xs text-text-muted">{u.role}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
