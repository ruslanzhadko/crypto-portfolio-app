'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const BOT_URL = 'https://t.me/cryptoportfolio_rzhad_bot';

interface ProfileFormProps {
  initialName: string | null;
  initialTelegramChatId: string | null;
}

export function ProfileForm({ initialName, initialTelegramChatId }: ProfileFormProps) {
  const router = useRouter();
  const t = useTranslations('Settings');
  const [name, setName] = useState(initialName ?? '');
  const [chatId, setChatId] = useState(initialTelegramChatId ?? '');
  const [isPending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();
  const { toast } = useToast();

  const isConnected = !!initialTelegramChatId;

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
          title: t('toastSaveFailedTitle'),
          description: body?.error?.message ?? t('toastSaveFailedDefault'),
        });
        return;
      }
      toast({ title: t('toastSavedTitle') });
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
          title: t('toastTestFailedTitle'),
          description: body?.error?.message ?? t('toastTestFailedDefault'),
        });
        return;
      }
      toast({ title: t('toastTestSentTitle') });
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('nameLabel')}</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="chatId">Telegram Chat ID</Label>
          <Badge variant={isConnected ? 'success' : 'secondary'}>
            {isConnected ? t('telegramConnected') : t('telegramDisconnected')}
          </Badge>
        </div>
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
            {t('testButton')}
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          {t('telegramHint')}
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={BOT_URL} target="_blank" rel="noreferrer">
            <Bot className="h-4 w-4" />
            {t('openBotButton')}
          </a>
        </Button>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('saveButton')}
      </Button>
    </form>
  );
}
