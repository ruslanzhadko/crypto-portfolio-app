'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Loader2 } from 'lucide-react';
import { Network } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { isValidAddressForNetwork } from '@/lib/utils/validators';
import { useToast } from '@/hooks/use-toast';

export function AddWalletDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [network, setNetwork] = useState<Network>(Network.EVM);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const t = useTranslations('AddWalletDialog');

  const walletTypes = [
    {
      network: Network.EVM,
      label: t('evmLabel'),
      desc: t('evmDesc'),
      placeholder: t('evmPlaceholder'),
    },
    {
      network: Network.SOLANA,
      label: t('solanaLabel'),
      desc: t('solanaDesc'),
      placeholder: t('solanaPlaceholder'),
    },
  ];

  function reset() {
    setNetwork(Network.EVM);
    setAddress('');
    setLabel('');
    setError(null);
    setIsSyncing(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = address.trim();

    if (!isValidAddressForNetwork(trimmed, network)) {
      setError(
        network === Network.EVM ? t('evmValidationError') : t('solanaValidationError'),
      );
      return;
    }

    startTransition(async () => {
      const res = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: trimmed,
          network,
          label: label.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const msg = body?.error?.message ?? t('addFailedDefault');
        setError(msg);
        toast({ variant: 'destructive', title: t('toastErrorTitle'), description: msg });
        return;
      }

      const data = (await res.json()) as { wallet: { id: string } };
      const walletId = data.wallet.id;

      setOpen(false);
      reset();
      router.refresh();

      toast({
        title: t('toastAddedTitle'),
        description: network === Network.EVM ? t('toastSyncStartedEvm') : t('toastSyncStartedSolana'),
      });

      setIsSyncing(true);
      try {
        const syncRes = await fetch(`/api/wallets/${walletId}/sync`, { method: 'POST' });
        if (syncRes.ok) {
          const syncData = (await syncRes.json()) as {
            result?: { tokensSynced?: number; spamFiltered?: number };
          };
          toast({
            title: t('toastSyncDoneTitle'),
            description: t('toastSyncDoneDescription', {
              tokens: syncData.result?.tokensSynced ?? 0,
              spam: syncData.result?.spamFiltered ?? 0,
            }),
          });
        }
      } catch {
        toast({
          variant: 'destructive',
          title: t('toastSyncFailedTitle'),
          description: t('toastSyncFailedDescription'),
        });
      } finally {
        setIsSyncing(false);
        router.refresh();
      }
    });
  }

  const selected = walletTypes.find((wt) => wt.network === network) ?? walletTypes[0]!;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          {t('triggerButton')}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="add-wallet-dialog">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" data-testid="add-wallet-form">
          <div className="space-y-2">
            <Label>{t('addressTypeLabel')}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {walletTypes.map((wt) => (
                <button
                  key={wt.network}
                  type="button"
                  onClick={() => {
                    setNetwork(wt.network);
                    setAddress('');
                    setError(null);
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    network === wt.network
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="text-sm font-medium">{wt.label}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{wt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">{t('addressLabel')}</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={selected.placeholder}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">{t('nameLabel')}</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={50}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancelButton')}
            </Button>
            <Button type="submit" disabled={isPending || isSyncing}>
              {(isPending || isSyncing) && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('addButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
