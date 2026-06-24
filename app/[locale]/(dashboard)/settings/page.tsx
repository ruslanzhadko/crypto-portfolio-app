import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      telegramChatId: true,
      createdAt: true,
      role: true,
    },
  });
  if (!user) return null;

  const t = await getTranslations('Settings');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-3xl">{t('pageTitle')}</h1>
        <p className="text-sm text-text-muted">{t('pageDescription')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profileCardTitle')}</CardTitle>
          <CardDescription>
            {t('profileCardDescription', { email: user.email, role: user.role })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={user.name}
            initialTelegramChatId={user.telegramChatId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('securityCardTitle')}</CardTitle>
          <CardDescription>{t('securityCardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
