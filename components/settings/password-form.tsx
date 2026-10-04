'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function PasswordForm() {
  const t = useTranslations('Settings');
  const locale = useLocale();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [isPending, setPending] = useState(false);
  const { toast } = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setPending(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast({
          variant: 'destructive',
          title: t('toastPasswordFailedTitle'),
          description: body?.error?.message ?? t('toastPasswordFailedDefault'),
        });
        return;
      }
      toast({ title: t('toastPasswordChangedTitle') });
      setCurrent('');
      setNext('');
      await signOut({ redirectTo: `/${locale}/auth/login` });
    } catch {
      toast({
        variant: 'destructive',
        title: t('toastPasswordFailedTitle'),
        description: t('toastPasswordFailedDefault'),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">{t('currentPasswordLabel')}</Label>
        <Input
          id="current"
          className="text-base md:text-sm"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">{t('newPasswordLabel')}</Label>
        <Input
          id="new"
          className="text-base md:text-sm"
          maxLength={72}
          type="password"
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-text-muted">{t('passwordMinHint')}</p>
        <p className="text-sm text-text-muted">{t('passwordSessionHint')}</p>
      </div>
      <Button type="submit" disabled={isPending || !current || next.length < 8}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('changePasswordButton')}
      </Button>
    </form>
  );
}
