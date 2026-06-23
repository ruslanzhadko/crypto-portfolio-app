import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const t = await getTranslations('Auth');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('loginPageTitle')}</CardTitle>
        <CardDescription>{t('loginPageDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-text-muted">
          {t('noAccountPrompt')}{' '}
          <Link className="text-primary hover:underline" href="/auth/register">
            {t('registerLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
