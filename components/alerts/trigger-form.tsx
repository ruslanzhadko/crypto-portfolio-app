'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Bell, Target } from 'lucide-react';
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
import { cn } from '@/lib/utils/cn';
import { formatUsd } from '@/lib/utils/format';
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

type TriggerType = 'PERCENT' | 'PRICE_TARGET';

const INTERVALS = [
  { label: '1 хвилина', value: 1 },
  { label: '5 хвилин', value: 5 },
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

  const [triggerType, setTriggerType] = useState<TriggerType>('PERCENT');
  const [threshold, setThreshold] = useState(5);
  const [direction, setDirection] = useState<TriggerDirection>(TriggerDirection.BOTH);
  const [interval, setInterval] = useState(15);
  const [targetPrice, setTargetPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [tokenCurrentPrice, setTokenCurrentPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // Fetch current price when token is selected
  useEffect(() => {
    if (!selectedToken) {
      setTokenCurrentPrice(null);
      return;
    }
    const controller = new AbortController();
    setPriceLoading(true);
    fetch(`/api/market/${selectedToken.tokenId}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { coin?: { currentPrice?: number } }) => {
        const price = data.coin?.currentPrice ?? null;
        setTokenCurrentPrice(price);
        // Pre-fill targetPrice with current price for PRICE_TARGET
        if (price && !targetPrice) {
          setTargetPrice(String(price));
        }
      })
      .catch((err: unknown) => {
        // AbortError = запит скасований через зміну токена — ігноруємо
        if ((err as { name?: string }).name !== 'AbortError') setTokenCurrentPrice(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPriceLoading(false);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedToken?.tokenId]);

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
    if (triggerType === 'PRICE_TARGET' && (!targetPrice || Number(targetPrice) <= 0)) {
      toast({ variant: 'destructive', title: 'Введіть цільову ціну' });
      return;
    }
    if (triggerType === 'PRICE_TARGET' && tokenCurrentPrice === null) {
      toast({ variant: 'destructive', title: 'Поточна ціна недоступна', description: 'Спробуйте оновити сторінку' });
      return;
    }

    startTransition(async () => {
      const body =
        triggerType === 'PERCENT'
          ? {
              triggerType: 'PERCENT',
              tokenId: selectedToken.tokenId,
              tokenSymbol: selectedToken.tokenSymbol,
              tokenName: selectedToken.tokenName,
              threshold,
              direction,
              interval,
              isActive,
            }
          : {
              triggerType: 'PRICE_TARGET',
              tokenId: selectedToken.tokenId,
              tokenSymbol: selectedToken.tokenSymbol,
              tokenName: selectedToken.tokenName,
              targetPrice: Number(targetPrice),
              direction: Number(targetPrice) >= tokenCurrentPrice! ? 'UP' : 'DOWN',
              isActive,
            };

      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast({
          variant: 'destructive',
          title: 'Не вдалось створити тригер',
          description: data?.error?.message ?? 'Спробуйте пізніше',
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
      {/* Type selector */}
      <div className="space-y-2">
        <Label>Тип тригера</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTriggerType('PERCENT')}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
              triggerType === 'PERCENT'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-text-muted hover:border-border/80',
            )}
          >
            <Bell className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Зміна %</p>
              <p className="text-xs opacity-70">Реагує на різкий рух</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setTriggerType('PRICE_TARGET')}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
              triggerType === 'PRICE_TARGET'
                ? 'border-warning bg-warning/10 text-warning'
                : 'border-border bg-surface-2 text-text-muted hover:border-border/80',
            )}
          >
            <Target className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Цільова ціна</p>
              <p className="text-xs opacity-70">Спрацьовує один раз</p>
            </div>
          </button>
        </div>
      </div>

      {/* Token selector */}
      <div className="space-y-2">
        <Label>Токен</Label>
        {selectedToken ? (
          <div className="space-y-2">
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
                onClick={() => { setSelectedToken(null); setSearch(''); setTokenCurrentPrice(null); setTargetPrice(''); }}
              >
                Змінити
              </Button>
            </div>
            {/* Current price block */}
            {priceLoading ? (
              <p className="text-xs text-text-muted">Завантаження ціни…</p>
            ) : tokenCurrentPrice != null ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-surface-2/50 px-3 py-2 text-sm">
                <span className="text-text-muted">Поточна ціна:</span>
                <span className="font-semibold tabular-nums">{formatUsd(tokenCurrentPrice)}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук токену (мінімум 2 символи)..."
              autoFocus
            />
            {searching && <p className="text-xs text-text-muted">Пошук...</p>}
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

      {/* PERCENT fields */}
      {triggerType === 'PERCENT' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="threshold">Поріг Δ% (1–100)</Label>
            <Input
              id="threshold"
              type="number"
              min={1}
              max={100}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <p className="text-xs text-text-muted">
              Сповіщення надійде коли ціна зміниться на вказаний % за обраний інтервал.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Напрямок</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as TriggerDirection)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TriggerDirection.BOTH}>↑↓ Зростання або падіння</SelectItem>
                <SelectItem value={TriggerDirection.UP}>↑ Лише зростання</SelectItem>
                <SelectItem value={TriggerDirection.DOWN}>↓ Лише падіння</SelectItem>
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
        </>
      )}

      {/* PRICE_TARGET fields */}
      {triggerType === 'PRICE_TARGET' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="targetPrice">Цільова ціна (USD)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
              <Input
                id="targetPrice"
                type="number"
                min={0}
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Напрямок визначається автоматично. Тригер спрацює один раз і деактивується.
          </p>
        </>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label htmlFor="active">Активний</Label>
          <p className="text-xs text-text-muted">Вимкнений тригер не надсилає сповіщень.</p>
        </div>
        <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <Button type="submit" disabled={isPending || !selectedToken} className="w-full">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Створити тригер
      </Button>
    </form>
  );
}
