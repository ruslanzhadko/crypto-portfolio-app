import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from './register-form';

export default async function RegisterPage() {
  const t = await getTranslations('Auth');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('registerPageTitle')}</CardTitle>
        <CardDescription>{t('registerPageDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <RegisterForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-text-muted">
          {t('hasAccountPrompt')}{' '}
          <Link className="text-primary hover:underline" href="/auth/login">
            {t('loginLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
