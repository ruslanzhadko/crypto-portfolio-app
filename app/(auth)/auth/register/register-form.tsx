'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function RegisterForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
        const msg = body?.error?.message ?? 'Помилка реєстрації';
        setError(msg);
        toast({ variant: 'destructive', title: 'Не вдалось зареєструватись', description: msg });
        return;
      }

      const signed = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (signed?.error) {
        toast({ title: 'Акаунт створено', description: 'Увійдіть з вашими даними.' });
        router.push('/auth/login');
        return;
      }

      toast({ title: 'Акаунт створено', description: 'Ласкаво просимо!' });
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Імʼя (опційно)</Label>
        <Input id="name" name="name" autoComplete="name" placeholder="Іван" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-text-muted">Мінімум 8 символів</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Створити акаунт
      </Button>
    </form>
  );
}
