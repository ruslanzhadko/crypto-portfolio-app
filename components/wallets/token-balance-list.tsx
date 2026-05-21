'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Eye,
  EyeOff,
  Coins,
  ExternalLink,
  MoreVertical,
  Loader2,
} from 'lucide-react';
import type { TokenBalance } from '@prisma/client';
import { TokenLogo } from '@/components/common/token-logo';
import { ChainBadge } from '@/components/common/network-badge';
import { PriceChange } from '@/components/common/price-change';
import { formatTokenBalance, formatUsd, shortAddress } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { MIN_TOKEN_USD } from '@/lib/services/moralis';
import { cn } from '@/lib/utils/cn';

interface TokenBalanceListProps {
  walletId: string;
  tokens: TokenBalance[];
  totalUsd: number;
}

interface BalanceGroup {
  key: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  coingeckoId: string | null;
  totalBalance: number;
  totalUsd: number;
  priceUsd: number;
  priceChange24h: number;
  chains: TokenBalance[]; // тільки видимі (після filters)
}

function groupBalances(tokens: TokenBalance[]): BalanceGroup[] {
  const map = new Map<string, BalanceGroup>();
  for (const t of tokens) {
    const key = t.tokenSymbol.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.totalBalance += t.balance;
      existing.totalUsd += t.usdValue;
      existing.chains.push(t);
      if (!existing.priceUsd && t.priceUsd > 0) existing.priceUsd = t.priceUsd;
      if (!existing.priceChange24h && t.priceChange24h !== 0) {
        existing.priceChange24h = t.priceChange24h;
      }
      if (!existing.coingeckoId && t.coingeckoId) existing.coingeckoId = t.coingeckoId;
      if (!existing.logoUrl && t.logoUrl) existing.logoUrl = t.logoUrl;
    } else {
      map.set(key, {
        key,
        symbol: t.tokenSymbol,
        name: t.tokenName,
        logoUrl: t.logoUrl,
        coingeckoId: t.coingeckoId,
        totalBalance: t.balance,
        totalUsd: t.usdValue,
        priceUsd: t.priceUsd,
        priceChange24h: t.priceChange24h,
        chains: [t],
      });
    }
  }
  for (const g of map.values()) {
    g.chains.sort((a, b) => b.usdValue - a.usdValue);
  }
  return Array.from(map.values()).sort((a, b) => b.totalUsd - a.totalUsd);
}

export function TokenBalanceList({ walletId, tokens, totalUsd }: TokenBalanceListProps) {
  const [showSpam, setShowSpam] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [localHidden, setLocalHidden] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  const spamTokens = tokens.filter((t) => t.isSpam);
  const manuallyHidden = tokens.filter(
    (t) => !t.isSpam && (localHidden[t.id] ?? t.isHidden),
  );

  // 1. Фільтрація на рівні chain-balance
  const visible = useMemo(
    () =>
      tokens.filter((t) => {
        const hidden = localHidden[t.id] ?? t.isHidden;
        if (t.isSpam) return showSpam;
        if (hidden) return showHidden;
        return true;
      }),
    [tokens, showSpam, showHidden, localHidden],
  );

  // 2. Групування за символом
  const groups = useMemo(() => groupBalances(visible), [visible]);

  // Баланс лише видимих, не-прихованих, не-спам токенів
  const visibleTotalUsd = visible
    .filter((t) => !t.isSpam && !(localHidden[t.id] ?? t.isHidden))
    .reduce((s, t) => s + t.usdValue, 0);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onToggleHide(token: TokenBalance) {
    const currentHidden = localHidden[token.id] ?? token.isHidden;
    const nextHidden = !currentHidden;
    setLocalHidden((prev) => ({ ...prev, [token.id]: nextHidden }));

    startTransition(async () => {
      const res = await fetch(`/api/wallets/${walletId}/tokens/${token.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden: nextHidden }),
      });
      if (!res.ok) {
        setLocalHidden((prev) => ({ ...prev, [token.id]: currentHidden }));
        toast({ variant: 'destructive', title: 'Не вдалось оновити' });
        return;
      }
      toast({
        title: nextHidden ? 'Токен приховано' : 'Токен відображено',
        description: `${token.tokenSymbol} ${nextHidden ? 'виключено з балансу' : 'включено в баланс'}`,
      });
    });
  }

  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={Coins}
        title="Токенів не знайдено"
        description="Натисніть Sync для завантаження балансів з блокчейну."
      />
    );
  }

  const activeTokens = visible.filter(
    (t) => !t.isSpam && !(localHidden[t.id] ?? t.isHidden),
  );
  const uniqueChainCount = new Set(activeTokens.map((t) => t.chainName)).size;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle>
          Токени{' '}
          <span className="text-sm font-normal text-text-muted">
            ({groups.length} · {uniqueChainCount} мереж)
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">
            {formatUsd(visibleTotalUsd, { compact: true })}
          </span>

          {manuallyHidden.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHidden((s) => !s)}
              className="h-7 gap-1 text-xs"
            >
              {showHidden ? (
                <><EyeOff className="h-3 w-3" />Сховати приховані ({manuallyHidden.length})</>
              ) : (
                <><Eye className="h-3 w-3" />Приховані ({manuallyHidden.length})</>
              )}
            </Button>
          )}

          {spamTokens.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSpam((s) => !s)}
              className="h-7 gap-1 text-xs"
            >
              {showSpam ? (
                <><EyeOff className="h-3 w-3" />Сховати спам ({spamTokens.length})</>
              ) : (
                <><Eye className="h-3 w-3" />Спам ({spamTokens.length})</>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {groups.map((g) => (
            <TokenGroupRow
              key={g.key}
              group={g}
              walletTotalUsd={totalUsd}
              expanded={expanded.has(g.key)}
              onToggleExpand={() => toggleExpand(g.key)}
              localHidden={localHidden}
              onToggleHide={onToggleHide}
            />
          ))}
        </div>

        {groups.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-text-muted">
            Нічого не відображається.{' '}
            {spamTokens.length > 0 && !showSpam && (
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setShowSpam(true)}
              >
                Показати спам ({spamTokens.length})
              </button>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// Рядок токена (одно-/багатомережевий)
// ─────────────────────────────────────────

function TokenGroupRow({
  group,
  walletTotalUsd,
  expanded,
  onToggleExpand,
  localHidden,
  onToggleHide,
}: {
  group: BalanceGroup;
  walletTotalUsd: number;
  expanded: boolean;
  onToggleExpand: () => void;
  localHidden: Record<string, boolean>;
  onToggleHide: (token: TokenBalance) => void;
}) {
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const isMulti = group.chains.length > 1;
  const hasMarket = !!group.coingeckoId;
  const share = walletTotalUsd > 0 ? (group.totalUsd / walletTotalUsd) * 100 : 0;
  const isLowValue = group.totalUsd > 0 && group.totalUsd < MIN_TOKEN_USD;

  async function handleSearchMarket() {
    if (searching) return;
    setSearching(true);
    try {
      // 1. Search by symbol, pick exact match with best market cap rank
      const symRes = await fetch(`/api/market/search?q=${encodeURIComponent(group.symbol)}`);
      if (symRes.ok) {
        const { results }: {
          results: Array<{ id: string; symbol: string; marketCapRank: number | null }>;
        } = await symRes.json();
        const exact = results
          .filter((r) => r.symbol.toUpperCase() === group.symbol.toUpperCase())
          .sort((a, b) => {
            if (a.marketCapRank === null) return 1;
            if (b.marketCapRank === null) return -1;
            return a.marketCapRank - b.marketCapRank;
          });
        if (exact[0]) { router.push(`/market/${exact[0].id}`); return; }
      }
      // 2. Fallback: search by full token name
      const nameQ = group.name || group.symbol;
      const nameRes = await fetch(`/api/market/search?q=${encodeURIComponent(nameQ)}`);
      if (nameRes.ok) {
        const { results }: { results: Array<{ id: string }> } = await nameRes.json();
        if (results[0]) router.push(`/market/${results[0].id}`);
      }
    } finally {
      setSearching(false);
    }
  }

  // Контент основної області (logo + info + right block) — однаковий для обох випадків
  const mainContent = (
    <>
      <TokenLogo src={group.logoUrl} symbol={group.symbol} size={36} />

      {/* Info column (flex-1) — symbol + name + meta (price/change inline) */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{group.symbol}</span>
          {hasMarket ? (
            <ExternalLink className="h-3 w-3 shrink-0 text-primary/70" />
          ) : searching ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary/70" />
          ) : null}
          {isLowValue && (
            <Badge variant="secondary" className="text-[10px]">
              {'< '}${MIN_TOKEN_USD}
            </Badge>
          )}
          {isMulti && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium text-text-muted"
              title="Кількість мереж"
            >
              {group.chains.length} мереж
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
          <span className="truncate">{group.name}</span>
          {group.priceUsd > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-text">{formatUsd(group.priceUsd)}</span>
              {group.priceChange24h !== 0 && (
                <PriceChange value={group.priceChange24h} size="sm" />
              )}
            </>
          )}
          {/* Чейн-бейджі: для single-chain — тут інлайн; для multi — у розкритті */}
          {!isMulti && group.chains[0]?.chainName && (
            <ChainBadge chainName={group.chains[0].chainName} />
          )}
        </div>
      </div>

      {/* Compact right block — фіксована ширина для вирівнювання між рядками */}
      <div className="w-36 shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">
          {formatTokenBalance(group.totalBalance)}{' '}
          <span className="text-xs text-text-muted">{group.symbol}</span>
        </p>
        <p className="text-xs text-text-muted tabular-nums">
          {group.totalUsd > 0 ? formatUsd(group.totalUsd) : '—'}
          {share >= 0.1 ? ` · ${share.toFixed(1)}%` : ''}
        </p>
      </div>
    </>
  );

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-colors',
          'hover:bg-surface-2/50',
          isMulti && expanded && 'bg-surface-2/30',
        )}
      >
        {/* Chevron: окрема кнопка для multi-chain (розкриває), spacer для single */}
        {isMulti ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Згорнути мережі' : 'Розгорнути мережі'}
            className="flex h-7 w-4 shrink-0 items-center justify-center rounded text-text-muted hover:text-text"
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                expanded && 'rotate-90 text-primary',
              )}
              aria-hidden
            />
          </button>
        ) : (
          <span aria-hidden className="inline-block w-4 shrink-0" />
        )}

        {/* Основна клікабельна зона */}
        {hasMarket ? (
          <Link
            href={`/market/${group.coingeckoId}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            {mainContent}
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleSearchMarket}
            disabled={searching}
            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
          >
            {mainContent}
          </button>
        )}

        {/* Меню — для single-chain. Для multi-chain — spacer тієї ж ширини щоб
            ціни лишались на одному рівні з рядками де є dropdown */}
        {!isMulti && group.chains[0] ? (
          <RowDropdown
            token={group.chains[0]}
            isHidden={localHidden[group.chains[0].id] ?? group.chains[0].isHidden}
            hasMarket={hasMarket}
            coingeckoId={group.coingeckoId}
            onToggleHide={() => onToggleHide(group.chains[0]!)}
          />
        ) : (
          <span aria-hidden className="h-7 w-7 shrink-0" />
        )}
      </div>

      {/* Розкриття: per-chain рядки */}
      {isMulti && expanded && (
        <ChainBreakdown
          chains={group.chains}
          groupTotalUsd={group.totalUsd}
          coingeckoId={group.coingeckoId}
          localHidden={localHidden}
          onToggleHide={onToggleHide}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Розкриття: рядки кожної мережі для multi-chain токена
// ─────────────────────────────────────────

function ChainBreakdown({
  chains,
  groupTotalUsd,
  coingeckoId,
  localHidden,
  onToggleHide,
}: {
  chains: TokenBalance[];
  groupTotalUsd: number;
  coingeckoId: string | null;
  localHidden: Record<string, boolean>;
  onToggleHide: (token: TokenBalance) => void;
}) {
  // Лічимо скільки записів припадає на кожен chainName — щоб для дублів
  // (напр. USDC vs USDC.e на Arbitrum) показати tokenName/адресу як differentiator
  const chainCounts = new Map<string, number>();
  for (const c of chains) {
    chainCounts.set(c.chainName, (chainCounts.get(c.chainName) ?? 0) + 1);
  }

  // Стандартний tokenName групи — щоб не дублювати, якщо назви різні
  const baseName = chains[0]?.tokenName;

  return (
    <div className="bg-surface-2/20 py-1.5">
      {chains.map((c) => {
        const chainShare = groupTotalUsd > 0 ? (c.usdValue / groupTotalUsd) * 100 : 0;
        const hiddenNow = localHidden[c.id] ?? c.isHidden;
        const isDuplicate = (chainCounts.get(c.chainName) ?? 0) > 1;
        const showVariantName = c.tokenName && c.tokenName !== baseName;

        return (
          <div
            key={c.id}
            className={cn(
              'flex items-center gap-3 px-4 py-1.5 pl-12 text-xs transition-colors hover:bg-surface-2/40',
              hiddenNow && 'opacity-50',
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <ChainBadge chainName={c.chainName} />
              {/* Для дублів — назва варіанту (напр. USDC.e) або скорочена адреса */}
              {isDuplicate && (
                <>
                  {showVariantName ? (
                    <span className="truncate text-[10px] font-medium text-text">
                      {c.tokenName}
                    </span>
                  ) : null}
                  {c.tokenAddress && (
                    <span className="font-mono text-[10px] text-text-muted">
                      {shortAddress(c.tokenAddress, 4)}
                    </span>
                  )}
                </>
              )}
            </div>
            <span className="ml-auto font-mono tabular-nums">
              {formatTokenBalance(c.balance)}
            </span>
            <span className="w-24 text-right font-medium tabular-nums">
              {c.usdValue > 0 ? formatUsd(c.usdValue) : '—'}
            </span>
            <span className="w-12 text-right text-text-muted tabular-nums">
              {chainShare.toFixed(1)}%
            </span>
            <RowDropdown
              token={c}
              isHidden={hiddenNow}
              hasMarket={!!coingeckoId}
              coingeckoId={coingeckoId}
              onToggleHide={() => onToggleHide(c)}
              compact
            />
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// Dropdown меню для рядка (single-chain group або chain-row)
// ─────────────────────────────────────────

function RowDropdown({
  token,
  isHidden,
  hasMarket,
  coingeckoId,
  onToggleHide,
  compact = false,
}: {
  token: TokenBalance;
  isHidden: boolean;
  hasMarket: boolean;
  coingeckoId: string | null;
  onToggleHide: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [searching, setSearching] = useState(false);

  async function handleSearchMarket(e: React.MouseEvent) {
    e.preventDefault();
    setSearching(true);
    try {
      const res = await fetch(
        `/api/market/search?q=${encodeURIComponent(token.tokenName || token.tokenSymbol)}`,
      );
      if (!res.ok) throw new Error();
      const { results }: { results: Array<{ id: string }> } = await res.json();
      if (results[0]) {
        router.push(`/market/${results[0].id}`);
      }
    } catch {
      // silently fail — user stays on page
    } finally {
      setSearching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('shrink-0', compact ? 'h-6 w-6' : 'h-7 w-7')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <MoreVertical className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasMarket && coingeckoId ? (
          <DropdownMenuItem asChild>
            <Link href={`/market/${coingeckoId}`}>
              <ExternalLink className="h-4 w-4" />
              На сторінку токена
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={searching}
            onClick={handleSearchMarket}
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Знайти на Market
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            onToggleHide();
          }}
        >
          {isHidden ? (
            <><Eye className="h-4 w-4" />Показати в балансі</>
          ) : (
            <><EyeOff className="h-4 w-4" />Приховати з балансу</>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

