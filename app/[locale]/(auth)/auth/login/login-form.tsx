'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const defaultDashboard = `/${locale}/dashboard`;
  const rawCallbackUrl = searchParams.get('callbackUrl');
  // Only use relative URLs from search params to prevent open redirects and wrong-locale hops
  const callbackUrl = (rawCallbackUrl?.startsWith('/') ? rawCallbackUrl : null) ?? defaultDashboard;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const t = useTranslations('Auth');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    setError(null);
    startTransition(async () => {
      try {
        const res = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });
        if (res?.error) {
          setError(t('loginErrorMessage'));
          toast({
            variant: 'destructive',
            title: t('loginToastFailTitle'),
            description: t('loginToastFailDescription'),
          });
          return;
        }
      } catch {
        setError(t('loginErrorMessage'));
        toast({
          variant: 'destructive',
          title: t('loginToastFailTitle'),
          description: t('loginToastFailDescription'),
        });
        return;
      }
      toast({ title: t('loginToastWelcome') });
      router.push(callbackUrl);
      // Fire-and-forget: sync wallets in background without blocking navigation
      fetch('/api/portfolio/sync', { method: 'POST' }).catch(() => {});
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input
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
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('loginButton')}
      </Button>
    </form>
  );
}
