'use client';

import { PasswordInput } from '@/components/auth/password-input';
import { safeCallbackUrl } from '@/lib/auth/redirect';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function LoginForm() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const rawCallbackUrl = searchParams.get('callbackUrl');
  // Only use relative URLs from search params to prevent open redirects and wrong-locale hops
  const callbackUrl = safeCallbackUrl(rawCallbackUrl, locale);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const t = useTranslations('Auth');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    setError(null);
    setPending(true);
    void (async () => {
      try {
        try {
          const res = await signIn('credentials', {
            email,
            password,
            redirect: false,
          });
          if (!res?.ok || res.error) {
            const invalidCredentials = res?.error === 'CredentialsSignin';
            setError(
              t(
                invalidCredentials
                  ? 'loginErrorMessage'
                  : 'loginServiceErrorMessage',
              ),
            );
            toast({
              variant: 'destructive',
              title: t('loginToastFailTitle'),
              description: t(
                invalidCredentials
                  ? 'loginToastFailDescription'
                  : 'loginToastServiceFailDescription',
              ),
            });
            return;
          }
        } catch {
          setError(t('loginServiceErrorMessage'));
          toast({
            variant: 'destructive',
            title: t('loginToastFailTitle'),
            description: t('loginToastServiceFailDescription'),
          });
          return;
        }
        toast({ title: t('loginToastWelcome') });
        localStorage.setItem('pending_prize', 'LOGIN');
        // Hard navigation clears the Next.js router cache so the middleware
        // sees the fresh session cookie instead of a stale unauthenticated redirect.
        fetch('/api/portfolio/sync', { method: 'POST' }).catch(() => {});
        window.location.href = callbackUrl;
      } catch {
        setError(t('loginServiceErrorMessage'));
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-busy={isPending}>
      <div className="space-y-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input
          className="h-12"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <PasswordInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="h-12 w-full" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('loginButton')}
      </Button>
    </form>
  );
}
