'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Send, Check, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function TelegramLogin({
  connected,
  available,
  chatId,
  telegramUserId,
  botAccess,
  notificationsEnabled,
  botReady,
}: {
  connected: boolean;
  available: boolean;
  chatId: string | null;
  telegramUserId: string | null;
  botAccess: boolean;
  notificationsEnabled: boolean;
  botReady: boolean;
}) {
  const t = useTranslations('Settings');
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const mismatch = !!chatId && !!telegramUserId && chatId !== telegramUserId;
  async function connect() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/user/telegram-link', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Link failed');
      await signIn('telegram', {
        redirectTo: `/${locale}/settings`,
        linkAccount: 'true',
      });
    } catch {
      setError(t('telegramLoginFailed'));
      setPending(false);
    }
  }
  async function updateNotifications(enabled: boolean, useLinked = false) {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(false);
    try {
      const response = await fetch('/api/user/telegram-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, useLinked }),
      });
      if (!response.ok) {
        setError(
          t(
            response.status === 409
              ? 'telegramRecipientConflict'
              : 'telegramLoginFailed',
          ),
        );
        return;
      }
      router.refresh();
    } catch {
      setError(t('telegramLoginFailed'));
    } finally {
      setPending(false);
    }
  }
  async function test() {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(false);
    try {
      const response = await fetch('/api/user/telegram-test', {
        method: 'POST',
      });
      if (!response.ok) {
        setError(t('telegramBotTestRecovery'));
        return;
      }
      setNotice(true);
    } catch {
      setError(t('telegramLoginFailed'));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-text-muted">
          {t('telegramLoginDescription')}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {connected && (
            <p className="flex items-center gap-2 text-sm text-success">
              <Check aria-hidden className="h-4 w-4 shrink-0" />
              {t('telegramLoginConnected')}
            </p>
          )}
          {(!connected || !botAccess || !telegramUserId) && (
            <Button
              type="button"
              variant="outline"
              onClick={connect}
              disabled={pending || !available}
              className="h-auto min-h-11 whitespace-normal text-left"
            >
              {pending ? (
                <Loader2
                  aria-hidden
                  className="h-4 w-4 shrink-0 animate-spin"
                />
              ) : (
                <Send aria-hidden className="h-4 w-4 shrink-0" />
              )}
              {t(connected ? 'telegramGrantMessages' : 'telegramLoginConnect')}
            </Button>
          )}
        </div>
        {!available && (
          <p className="text-sm text-text-muted">
            {t('telegramLoginUnavailable')}
          </p>
        )}
      </div>
      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex items-center gap-4">
          <Label htmlFor="telegram-notifications" className="leading-relaxed">
            {t('telegramNotificationsLabel')}
          </Label>
          <Switch
            id="telegram-notifications"
            checked={!!chatId && notificationsEnabled}
            disabled={
              pending ||
              (!chatId && (!telegramUserId || !botAccess || !botReady))
            }
            onCheckedChange={(value) => updateNotifications(value)}
          />
        </div>
        <p className="text-sm leading-relaxed text-text-muted">
          {t('telegramNotificationsHint')}
        </p>
        {!botReady && (
          <p className="text-sm text-text-muted">
            {t('telegramBotUnavailable')}
          </p>
        )}
        {chatId && (!telegramUserId || mismatch) && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-text-muted">
              {t(
                mismatch
                  ? 'telegramRecipientMismatch'
                  : 'telegramLegacyPreserved',
              )}
            </p>
            {mismatch && (
              <Button
                type="button"
                variant="outline"
                disabled={pending || !botAccess || !botReady}
                onClick={() => updateNotifications(true, true)}
                className="h-auto min-h-11 whitespace-normal text-left"
              >
                {t('telegramUseLinkedRecipient')}
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending || !chatId || !notificationsEnabled || !botReady}
            onClick={test}
          >
            <Send aria-hidden className="h-4 w-4" />
            {t('testButton')}
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-auto min-h-11 whitespace-normal text-left"
          >
            <a
              href="https://t.me/cryptoportfolio_rzhad_bot"
              target="_blank"
              rel="noreferrer"
            >
              <Bot aria-hidden className="h-4 w-4 shrink-0" />
              {t('openBotButton')}
            </a>
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {t('toastTestSentTitle')}
        </p>
      )}
    </div>
  );
}
