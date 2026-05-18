import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const MESSAGES: Record<string, string> = {
  Configuration: 'Помилка конфігурації серверу. Звʼяжіться з адміністратором.',
  AccessDenied: 'Доступ заборонено.',
  Verification: 'Посилання верифікації недійсне або застаріле.',
  CredentialsSignin: 'Невірний email або пароль.',
  Default: 'Сталася помилка під час авторизації.',
};

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const code = searchParams.error ?? 'Default';
  const message = MESSAGES[code] ?? MESSAGES.Default;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Помилка авторизації</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild className="w-full">
          <Link href="/auth/login">Повернутись до входу</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
