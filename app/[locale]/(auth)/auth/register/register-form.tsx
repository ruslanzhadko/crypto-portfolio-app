'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function RegisterForm() {
  const router = useRouter();
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const t = useTranslations('Auth');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    const name = String(fd.get('name') ?? '').trim() || undefined;

    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const msg = body?.error?.message ?? t('registerErrorDefault');
        setError(msg);
        toast({ variant: 'destructive', title: t('registerToastFailTitle'), description: msg });
        return;
      }

      try {
        const signed = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });
        if (signed?.error) {
          toast({ title: t('accountCreatedTitle'), description: t('accountCreatedLoginDescription') });
          router.push(`/${locale}/auth/login`);
          return;
        }
      } catch {
        toast({ title: t('accountCreatedTitle'), description: t('accountCreatedLoginDescription') });
        router.push(`/${locale}/auth/login`);
        return;
      }

      toast({ title: t('accountCreatedTitle'), description: t('accountCreatedWelcomeDescription') });
      router.push(`/${locale}/dashboard`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('nameLabel')}</Label>
        <Input id="name" name="name" autoComplete="name" placeholder={t('namePlaceholder')} />
      </div>
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
          minLength={8}
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-text-muted">{t('passwordHint')}</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('registerButton')}
      </Button>
    </form>
  );
}
