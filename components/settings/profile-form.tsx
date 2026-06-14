'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface ProfileFormProps {
  initialName: string | null;
  initialTelegramChatId: string | null;
}

export function ProfileForm({ initialName, initialTelegramChatId }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? '');
  const [chatId, setChatId] = useState(initialTelegramChatId ?? '');
  const [isPending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();
  const { toast } = useToast();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          telegramChatId: chatId.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: 'Не вдалось зберегти',
          description: body?.error?.message ?? 'Спробуйте ще раз',
        });
        return;
      }
      toast({ title: 'Профіль збережено' });
      router.refresh();
    });
  }

  function onTest() {
    startTest(async () => {
      const res = await fetch('/api/user/telegram-test', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: 'Не вдалось надіслати',
          description: body?.error?.message ?? 'Перевірте Chat ID і токен бота',
        });
        return;
      }
      toast({ title: 'Тестове повідомлення надіслано' });
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Імʼя</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ваше імʼя"
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="chatId">Telegram Chat ID</Label>
        <div className="flex gap-2">
          <Input
            id="chatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="123456789"
            inputMode="numeric"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={!chatId.trim() || testing}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Тест
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          Відкрийте{' '}
          <a
            href="https://t.me/cryptoportfolio_rzhad_bot"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            @cryptoportfolio_rzhad_bot
          </a>{' '}
          і натисніть <span className="font-mono">/start</span> — бот надішле ваш{' '}
          <strong>Chat ID</strong>. Вставте його сюди та збережіть, щоб отримувати
          сповіщення про спрацювання цінових тригерів.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Зберегти
      </Button>
    </form>
  );
}
