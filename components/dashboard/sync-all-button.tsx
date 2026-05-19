'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

interface SyncResponse {
  data?: {
    synced?: Array<{ walletId: string; tokensSynced: number }>;
    skipped?: Array<{ label: string | null; nextSyncInSeconds: number }>;
    errors?: Array<{ label: string | null; message: string }>;
    durationMs?: number;
  };
  error?: { message?: string };
}

interface SyncAllButtonProps {
  /** Якщо найстаріший lastSyncAt старший за цю кількість хвилин — авто-sync у фоні. null = вимкнено */
  autoSyncStaleMinutes?: number | null;
  /** Час останнього sync найстарішого гаманця (ISO або Date) — для auto-sync рішення */
  oldestSyncAt?: string | Date | null;
}

export function SyncAllButton({
  autoSyncStaleMinutes = 10,
  oldestSyncAt = null,
}: SyncAllButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const autoTriggeredRef = useRef(false);

  function runSync(opts: { force?: boolean; silent?: boolean } = {}) {
    const { force = false, silent = false } = opts;
    startTransition(async () => {
      const res = await fetch(`/api/portfolio/sync${force ? '?force=true' : ''}`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as SyncResponse | null;

      if (!res.ok) {
        if (!silent) {
          toast({
            variant: 'destructive',
            title: 'Sync не вдався',
            description: body?.error?.message ?? 'Спробуйте пізніше',
          });
        }
        return;
      }

      const synced = body?.data?.synced ?? [];
      const skipped = body?.data?.skipped ?? [];
      const errors = body?.data?.errors ?? [];
      const tokensTotal = synced.reduce((s, r) => s + (r.tokensSynced ?? 0), 0);

      if (!silent) {
        if (synced.length === 0 && skipped.length > 0) {
          const next = Math.min(...skipped.map((s) => s.nextSyncInSeconds));
          toast({
            title: 'Дані ще свіжі',
            description: `Спробуйте через ${Math.ceil(next / 60)} хв або натисніть ще раз для примусового sync.`,
          });
        } else {
          const descParts: string[] = [];
          if (tokensTotal > 0) {
            descParts.push(`${tokensTotal} токенів`);
          } else if (synced.length > 0) {
            descParts.push('Дані актуальні (API не повернув змін)');
          }
          if (skipped.length > 0) descParts.push(`${skipped.length} пропущено`);
          if (errors.length > 0) descParts.push(`${errors.length} з помилкою`);
          toast({
            title: `Sync завершено · ${synced.length} гаманц(ів)`,
            description: descParts.join(' · '),
            variant: errors.length > 0 ? 'destructive' : 'default',
          });
        }
      }

      // Завжди оновлюємо дашборд — навіть якщо synced.length = 0 (помилки чи throttle)
      router.refresh();
    });
  }

  // Авто-sync у фоні якщо найстаріший гаманець давно не оновлювався
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (autoSyncStaleMinutes == null) return;
    if (!oldestSyncAt) return;

    const date = oldestSyncAt instanceof Date ? oldestSyncAt : new Date(oldestSyncAt);
    const ageMinutes = (Date.now() - date.getTime()) / 60_000;
    if (ageMinutes >= autoSyncStaleMinutes) {
      autoTriggeredRef.current = true;
      runSync({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldestSyncAt, autoSyncStaleMinutes]);

  // Подвійний клік — force; одинарний — звичайний sync. Throttle вирішує сервер.
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => runSync()}
      disabled={isPending}
      title="Натисніть Shift+Click для примусового sync (ігнорує throttle)"
      onClickCapture={(e) => {
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          runSync({ force: true });
        }
      }}
    >
      <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
      {isPending ? 'Синхронізую…' : 'Синхронізувати'}
    </Button>
  );
}
