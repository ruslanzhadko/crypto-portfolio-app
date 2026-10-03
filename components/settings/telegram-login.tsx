'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TelegramLogin({
  connected,
  available,
}: {
  connected: boolean;
  available: boolean;
}) {
  const t = useTranslations('Settings');
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function connect() {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch('/api/user/telegram-link', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Link failed');
      await signIn('telegram', { redirectTo: `/${locale}/settings` });
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-text-muted">
        {t('telegramLoginDescription')}
      </p>
      {connected ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Check aria-hidden className="h-4 w-4" />
          {t('telegramLoginConnected')}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={connect}
          disabled={pending || !available}
        >
          {pending ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Send aria-hidden className="h-4 w-4" />
          )}
          {t('telegramLoginConnect')}
        </Button>
      )}
      {!connected && !available && (
        <p className="text-sm text-text-muted">
          {t('telegramLoginUnavailable')}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t('telegramLoginFailed')}
        </p>
      )}
    </div>
  );
}
