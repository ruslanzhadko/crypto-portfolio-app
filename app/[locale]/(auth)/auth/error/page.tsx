import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: code = 'Default' } = await searchParams;
  const t = await getTranslations('Auth');

  const messageKey = {
    Configuration: 'errorConfiguration',
    AccessDenied: 'errorAccessDenied',
    Verification: 'errorVerification',
    CredentialsSignin: 'errorCredentialsSignin',
  }[code] ?? 'errorDefault';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('errorPageTitle')}</CardTitle>
        <CardDescription>{t(messageKey as 'errorDefault')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild className="w-full">
          <Link href="/auth/login">{t('backToLoginButton')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
