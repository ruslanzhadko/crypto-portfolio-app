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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Налаштування</h1>
        <p className="text-sm text-text-muted">Профіль, Telegram інтеграція та безпека.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Профіль</CardTitle>
          <CardDescription>
            Email: <span className="font-mono">{user.email}</span> · Роль: {user.role}
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
          <CardTitle>Безпека</CardTitle>
          <CardDescription>Зміна пароля акаунту.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
