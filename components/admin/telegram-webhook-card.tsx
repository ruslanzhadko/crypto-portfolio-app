'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
}

export function TelegramWebhookCard() {
  const t = useTranslations('TelegramWebhook');
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/telegram');
      if (res.ok) {
        const data = (await res.json()) as { webhook: WebhookInfo };
        setInfo(data.webhook);
      } else {
        setInfo(null);
      }
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchStatus(); }, []);

  function onRegister() {
    startTransition(async () => {
      const res = await fetch('/api/admin/telegram', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast({ variant: 'destructive', title: t('toastErrorTitle'), description: body?.error?.message });
        return;
      }
      toast({ title: t('toastRegistered') });
      void fetchStatus();
    });
  }

  const isActive = !!info?.url;
  const hasError = !!info?.last_error_message;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          {t('cardTitle')}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void fetchStatus()} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="text-text-muted">{t('loading')}</span>
          ) : isActive ? (
            <>
              {hasError ? (
                <XCircle className="h-4 w-4 text-danger" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success" />
              )}
              <Badge variant={hasError ? 'danger' : 'success'}>
                {hasError ? t('statusError') : t('statusActive')}
              </Badge>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-text-muted" />
              <Badge variant="secondary">{t('statusNotRegistered')}</Badge>
            </>
          )}
        </div>

        {isActive && (
          <p className="break-all font-mono text-xs text-text-muted">{info.url}</p>
        )}

        {hasError && (
          <p className="text-xs text-danger">{info?.last_error_message}</p>
        )}

        {isActive && (
          <p className="text-xs text-text-muted">
            {t('pendingUpdates', { count: info?.pending_update_count ?? 0 })}
          </p>
        )}

        <Button
          size="sm"
          variant={isActive ? 'outline' : 'default'}
          onClick={onRegister}
          disabled={isPending || loading}
        >
          {isPending ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Bot className="h-3 w-3" />
          )}
          {isActive ? t('btnReregister') : t('btnRegister')}
        </Button>

        {!isActive && (
          <p className="text-xs text-text-muted">
            {t('envVarsPrefix')}{' '}
            <code className="text-primary">TELEGRAM_BOT_TOKEN</code>,{' '}
            <code className="text-primary">TELEGRAM_WEBHOOK_SECRET</code>,{' '}
            <code className="text-primary">NEXT_PUBLIC_APP_URL</code> (HTTPS)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
