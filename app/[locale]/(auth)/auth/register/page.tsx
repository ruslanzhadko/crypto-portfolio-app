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
import { RegisterForm } from './register-form';

export default async function RegisterPage() {
  const t = await getTranslations('Auth');

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-7 pt-0">
        <CardTitle className="text-3xl tracking-tight">
          {t('registerPageTitle')}
        </CardTitle>
        <CardDescription className="pt-2 text-sm leading-relaxed">
          {t('registerPageDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Suspense>
          <SocialButtons available={socialAvailability()} />
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
