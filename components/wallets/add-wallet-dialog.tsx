'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

const WALLET_TYPES: { network: Network; label: string; desc: string; placeholder: string }[] = [
  {
    network: Network.EVM,
    label: 'EVM-адреса',
    desc: 'Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche',
    placeholder: '0x...',
  },
  {
    network: Network.SOLANA,
    label: 'Solana-адреса',
    desc: 'Мережа Solana (окрема адреса)',
    placeholder: 'Base58 адреса...',
  },
];

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
        network === Network.EVM
          ? 'Невірна EVM-адреса. Формат: 0x + 40 hex-символів'
          : 'Невірна Solana-адреса. Формат: Base58, 32–44 символи',
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
        const msg = body?.error?.message ?? 'Не вдалось додати гаманець';
        setError(msg);
        toast({ variant: 'destructive', title: 'Помилка', description: msg });
        return;
      }

      const data = (await res.json()) as { wallet: { id: string } };
      const walletId = data.wallet.id;

      // Закриваємо діалог одразу
      setOpen(false);
      reset();
      router.refresh();

      // Автоматичний sync у фоні
      toast({
        title: 'Гаманець додано',
        description:
          network === Network.EVM
            ? 'Синхронізація 7 мереж розпочата, це займе кілька секунд...'
            : 'Синхронізація розпочата...',
      });

      setIsSyncing(true);
      try {
        const syncRes = await fetch(`/api/wallets/${walletId}/sync`, { method: 'POST' });
        if (syncRes.ok) {
          const syncData = (await syncRes.json()) as {
            result?: { tokensSynced?: number; spamFiltered?: number };
          };
          toast({
            title: 'Sync завершено',
            description: `${syncData.result?.tokensSynced ?? 0} токенів знайдено (${syncData.result?.spamFiltered ?? 0} спам відфільтровано)`,
          });
        }
      } catch {
        toast({
          variant: 'destructive',
          title: 'Sync не вдався',
          description: 'Спробуйте натиснути Sync вручну',
        });
      } finally {
        setIsSyncing(false);
        router.refresh();
      }
    });
  }

  const selected = WALLET_TYPES.find((t) => t.network === network) ?? WALLET_TYPES[0]!;

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
          Додати гаманець
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Додати гаманець</DialogTitle>
          <DialogDescription>
            Read-only режим — приватні ключі не потрібні.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Вибір типу */}
          <div className="space-y-2">
            <Label>Тип адреси</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {WALLET_TYPES.map((t) => (
                <button
                  key={t.network}
                  type="button"
                  onClick={() => {
                    setNetwork(t.network);
                    setAddress('');
                    setError(null);
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    network === t.network
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Публічна адреса</Label>
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
            <Label htmlFor="label">Назва (опційно)</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Main Wallet"
              maxLength={50}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
            <Button type="submit" disabled={isPending || isSyncing}>
              {(isPending || isSyncing) && <Loader2 className="h-4 w-4 animate-spin" />}
              Додати
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
