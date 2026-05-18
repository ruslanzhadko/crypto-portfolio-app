'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TriggerDirection } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TokenLogo } from '@/components/common/token-logo';
import { useToast } from '@/hooks/use-toast';
import type { SearchResult } from '@/lib/services/coingecko';

interface InitialToken {
  tokenId: string;
  tokenSymbol: string;
  tokenName: string;
  logoUrl?: string | null;
}

interface TriggerFormProps {
  initial?: InitialToken | null;
}

const INTERVALS = [
  { label: '15 хвилин', value: 15 },
  { label: '1 година', value: 60 },
  { label: '4 години', value: 240 },
  { label: '24 години', value: 1440 },
];

export function TriggerForm({ initial = null }: TriggerFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const [selectedToken, setSelectedToken] = useState<InitialToken | null>(initial);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [threshold, setThreshold] = useState(10);
  const [direction, setDirection] = useState<TriggerDirection>(TriggerDirection.BOTH);
  const [interval, setInterval] = useState(60);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (search.length < 2 || selectedToken) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = (await res.json()) as { results: SearchResult[] };
        setSearchResults(data.results);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, selectedToken]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToken) {
      toast({ variant: 'destructive', title: 'Оберіть токен' });
      return;
    }
    startTransition(async () => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: selectedToken.tokenId,
          tokenSymbol: selectedToken.tokenSymbol,
          tokenName: selectedToken.tokenName,
          threshold,
          direction,
          interval,
          isActive,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: 'Не вдалось створити тригер',
          description: body?.error?.message ?? 'Спробуйте пізніше',
        });
        return;
      }
      toast({ title: 'Тригер створено' });
      router.push('/alerts');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Токен</Label>
        {selectedToken ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-3">
              <TokenLogo src={selectedToken.logoUrl ?? null} symbol={selectedToken.tokenSymbol} size={36} />
              <div>
                <p className="font-medium">{selectedToken.tokenName}</p>
                <p className="text-xs uppercase text-text-muted">{selectedToken.tokenSymbol}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedToken(null);
                setSearch('');
              }}
            >
              Змінити
            </Button>
          </div>
        ) : (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук токену (мінімум 2 символи)..."
              autoFocus
            />
            {searching && (
              <p className="text-xs text-text-muted">Пошук...</p>
            )}
            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-auto rounded-lg border border-border bg-popover">
                {searchResults.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() =>
                      setSelectedToken({
                        tokenId: r.id,
                        tokenSymbol: r.symbol,
                        tokenName: r.name,
                        logoUrl: r.thumb,
                      })
                    }
                    className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 last:border-b-0"
                  >
                    <TokenLogo src={r.thumb} symbol={r.symbol} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-xs uppercase text-text-muted">{r.symbol}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="threshold">Поріг Δ% (1–100)</Label>
        <Input
          id="threshold"
          type="number"
          min={0.1}
          max={100}
          step={0.5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
        <p className="text-xs text-text-muted">
          Сповіщення спрацює коли зміна ціни за обраний інтервал перевищить вказаний поріг.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Напрямок</Label>
        <Select
          value={direction}
          onValueChange={(v) => setDirection(v as TriggerDirection)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TriggerDirection.BOTH}>Зростання або падіння</SelectItem>
            <SelectItem value={TriggerDirection.UP}>Лише зростання ↑</SelectItem>
            <SelectItem value={TriggerDirection.DOWN}>Лише падіння ↓</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Інтервал перевірки</Label>
        <Select value={String(interval)} onValueChange={(v) => setInterval(Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map((i) => (
              <SelectItem key={i.value} value={String(i.value)}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label htmlFor="active">Активний</Label>
          <p className="text-xs text-text-muted">Вимкнений тригер не надсилає сповіщень.</p>
        </div>
        <Switch
          id="active"
          checked={isActive}
          onCheckedChange={(c) => setIsActive(c)}
        />
      </div>

      <Button type="submit" disabled={isPending || !selectedToken} className="w-full">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Створити тригер
      </Button>
    </form>
  );
}
