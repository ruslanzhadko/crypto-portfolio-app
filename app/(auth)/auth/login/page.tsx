import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Вхід</CardTitle>
        <CardDescription>Введіть email та пароль для входу в акаунт</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-text-muted">
          Ще немає акаунту?{' '}
          <Link className="text-primary hover:underline" href="/auth/register">
            Зареєструватись
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
