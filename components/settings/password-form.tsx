'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: 'Не вдалось змінити пароль',
          description: body?.error?.message ?? 'Спробуйте ще раз',
        });
        return;
      }
      toast({ title: 'Пароль оновлено' });
      setCurrent('');
      setNext('');
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">Поточний пароль</Label>
        <Input
          id="current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">Новий пароль</Label>
        <Input
          id="new"
          type="password"
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-text-muted">Мінімум 8 символів</p>
      </div>
      <Button type="submit" disabled={isPending || !current || next.length < 8}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Змінити пароль
      </Button>
    </form>
  );
}
