'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

export function WalletSyncButton({
  walletId,
  className,
}: {
  walletId: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function onSync() {
    startTransition(async () => {
      const res = await fetch(`/api/wallets/${walletId}/sync`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: 'Sync не вдався',
          description: body?.error?.message ?? 'Спробуйте пізніше',
        });
        return;
      }
      const data = (await res.json()) as {
        result?: { tokensSynced?: number; transactionsSynced?: number };
      };
      toast({
        title: 'Sync завершено',
        description: `${data.result?.tokensSynced ?? 0} токенів · ${data.result?.transactionsSynced ?? 0} транзакцій`,
      });
      // Сигналізуємо клієнтським компонентам (TransactionList тощо) про оновлення
      window.dispatchEvent(new CustomEvent('wallet-synced', { detail: { walletId } }));
      router.refresh();
    });
  }

  return (
    <Button onClick={onSync} disabled={isPending} className={className}>
      <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
      Sync
    </Button>
  );
}
