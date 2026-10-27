import { getFormatter, getTranslations } from 'next-intl/server';
import { Bell, ChevronRight, Target } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Link } from '@/i18n/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { TelegramLogin } from '@/components/settings/telegram-login';
import { publicEmail } from '@/lib/auth/public-email';
import { socialAvailability, telegramBotReady } from '@/lib/auth/social';
import { exchangesEnabled } from '@/lib/exchanges/config';
import { readPositionAlertSettings } from '@/lib/positions/alert-settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ telegramError?: string }>;
}) {
  const { telegramError } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      telegramChatId: true,
      telegramUserId: true,
      telegramBotAccess: true,
      telegramNotificationsEnabled: true,
      positionAlerts: true,
      createdAt: true,
      role: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
      triggers: { select: { isActive: true } },
    },
  });
  if (!user) return null;

  const t = await getTranslations('Settings');
  const authMessages = await getTranslations('Auth');
  const format = await getFormatter();
  const positionAlerts = exchangesEnabled(session.user.id);
  const alertSettings = readPositionAlertSettings(user.positionAlerts);
  const positionKinds = (['opened', 'closed', 'liquidation', 'pnlSign'] as const).filter(
    (kind) => alertSettings[kind],
  ).length;
  const activeTriggers = user.triggers.filter((tr) => tr.isActive).length;
  const email = publicEmail(user.email) ? user.email : null;
  const loginMethods = [
    ...(user.passwordHash ? [t('loginPassword')] : []),
    ...user.accounts.map((a) =>
      a.provider === 'telegram' ? 'Telegram' : a.provider === 'google' ? 'Google' : a.provider,
    ),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-3xl">
          {t('pageTitle')}
        </h1>
        <p className="text-sm text-text-muted">{t('pageDescription')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t('profileCardTitle')}</CardTitle>
            <CardDescription>{t('profileCardHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProfileForm initialName={user.name} />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
              {email && (
                <>
                  <dt className="text-text-muted">Email</dt>
                  <dd className="truncate">{email}</dd>
                </>
              )}
              <dt className="text-text-muted">{t('profileRole')}</dt>
              <dd>{user.role}</dd>
              <dt className="text-text-muted">{t('profileLogin')}</dt>
              <dd>{loginMethods.join(' · ')}</dd>
              <dt className="text-text-muted">{t('profileSince')}</dt>
              <dd>{format.dateTime(user.createdAt, { dateStyle: 'long' })}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('securityCardTitle')}</CardTitle>
            <CardDescription>{t('loginMethodsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {user.passwordHash ? (
              <PasswordForm />
            ) : (
              <p className="text-sm text-text-muted">{t('socialNoPassword')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telegram</CardTitle>
            <CardDescription>{t('telegramUnifiedDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {telegramError && (
              <p role="alert" className="text-sm text-danger">
                {telegramError === 'TelegramLinkExpired'
                  ? authMessages('errorTelegramLinkExpired')
                  : telegramError === 'TelegramInvalidIdentity'
                    ? authMessages('errorTelegramInvalidIdentity')
                    : t('telegramLoginConflict')}
              </p>
            )}
            <TelegramLogin
              connected={user.accounts.some((a) => a.provider === 'telegram')}
              available={socialAvailability().telegram}
              chatId={user.telegramChatId}
              telegramUserId={user.telegramUserId}
              botAccess={user.telegramBotAccess}
              notificationsEnabled={user.telegramNotificationsEnabled}
              botReady={telegramBotReady()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('notificationsCardTitle')}</CardTitle>
            <CardDescription>{t('notificationsCardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-xl border border-border">
              <NotificationLink
                href="/alerts"
                icon={<Target className="h-4 w-4" />}
                title={t('notificationsTriggers')}
                status={
                  user.triggers.length
                    ? t('notificationsTriggersStatus', {
                        active: activeTriggers,
                        total: user.triggers.length,
                      })
                    : t('notificationsTriggersNone')
                }
              />
              {positionAlerts && (
                <NotificationLink
                  href="/alerts?tab=positions"
                  icon={<Bell className="h-4 w-4" />}
                  title={t('notificationsPositions')}
                  status={
                    positionKinds
                      ? t('notificationsPositionsOn', { count: positionKinds })
                      : t('notificationsOff')
                  }
                />
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** A row that leads to the notifications page, with what is set up there now. */
function NotificationLink({
  href,
  icon,
  title,
  status,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  status: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-text-muted">{status}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-text-muted" />
      </Link>
    </li>
  );
}
