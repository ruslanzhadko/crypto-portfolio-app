import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
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
      createdAt: true,
      role: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) return null;

  const t = await getTranslations('Settings');
  const authMessages = await getTranslations('Auth');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-3xl">
          {t('pageTitle')}
        </h1>
        <p className="text-sm text-text-muted">{t('pageDescription')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profileCardTitle')}</CardTitle>
          <CardDescription>
            {publicEmail(user.email)
              ? t('profileCardDescription', {
                  email: user.email,
                  role: user.role,
                })
              : t('telegramProfileDescription', { role: user.role })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 md:grid-cols-2 md:gap-10">
          <ProfileForm initialName={user.name} />
          <section className="space-y-3 border-t border-border pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
            <div>
              <h3 className="font-semibold leading-none">
                {t('securityCardTitle')}
              </h3>
              <p className="mt-1.5 text-sm text-text-muted">
                {t('loginMethodsDescription')}
              </p>
            </div>
            {user.passwordHash ? (
              <PasswordForm />
            ) : (
              <p className="text-sm text-text-muted">{t('socialNoPassword')}</p>
            )}
          </section>
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
    </div>
  );
}
