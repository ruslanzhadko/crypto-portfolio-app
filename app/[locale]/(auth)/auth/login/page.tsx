import { SocialButtons } from '@/components/auth/social-buttons';
import { socialAvailability } from '@/lib/auth/social';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const t = await getTranslations('Auth');

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-7 pt-0">
        <CardTitle className="text-3xl tracking-tight">
          {t('loginPageTitle')}
        </CardTitle>
        <CardDescription className="pt-2 text-sm leading-relaxed">
          {t('loginPageDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Suspense>
          <SocialButtons available={socialAvailability()} />
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
