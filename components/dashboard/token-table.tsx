'use client';

import { useMemo, useState, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, ChevronRight, Wallet as WalletIcon, Network as NetworkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import {
  formatTokenBalance,
  formatUsd,
  shortAddress,
} from '@/lib/utils/format';
import { ChainBadge } from '@/components/common/network-badge';
import { cn } from '@/lib/utils/cn';
import type { AggregatedToken, WalletTokenBreakdown } from '@/lib/services/portfolio';

type SortKey = 'value' | 'balance' | 'change';

interface WalletGroup {
  walletId: string;
  walletLabel: string | null;
  walletAddress: string;
  totalBalance: number;
  totalUsd: number;
  chains: WalletTokenBreakdown[];
}

export function TokenTable({ tokens }: { tokens: AggregatedToken[] }) {
  const t = useTranslations('TokenTable');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [desc, setDesc] = useState(true);
  // Окремі множини для розгорнутих токенів і розгорнутих гаманців (ключі: tokenKey та tokenKey::walletId)
  const [openTokens, setOpenTokens] = useState<Set<string>>(new Set());
  const [openWallets, setOpenWallets] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const arr = [...tokens];
    arr.sort((a, b) => {
      let av: number;
      let bv: number;
      switch (sortKey) {
        case 'value':
          av = a.totalUsd;
          bv = b.totalUsd;
          break;
        case 'balance':
          av = a.totalBalance;
          bv = b.totalBalance;
          break;
        case 'change':
          av = a.priceChange24h;
          bv = b.priceChange24h;
          break;
      }
      return desc ? bv - av : av - bv;
    });
    return arr;
  }, [tokens, sortKey, desc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm 2xl:table-auto">
            <thead className="border-b border-border text-xs uppercase text-text-muted">
              <tr>
                <th className="w-3/5 px-3 py-3 text-left sm:px-4 2xl:w-auto">{t('colToken')}</th>
                <th className="hidden px-4 py-3 text-left 2xl:table-cell">{t('colNetworks')}</th>
                <th className="hidden px-4 py-3 text-right xl:table-cell">
                  <SortButton active={sortKey === 'balance'} desc={desc} onClick={() => toggleSort('balance')}>
                    {t('colBalance')}
                  </SortButton>
                </th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell">{t('colPrice')}</th>
                <th className="px-3 py-3 text-right sm:px-4">
                  <SortButton active={sortKey === 'value'} desc={desc} onClick={() => toggleSort('value')}>
                    {t('colUsd')}
                  </SortButton>
                </th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell">
                  <SortButton active={sortKey === 'change'} desc={desc} onClick={() => toggleSort('change')}>
                    {t('col24h')}
                  </SortButton>
                </th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell">{t('colShare')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tok) => {
                const isOpen = openTokens.has(tok.key);
                // Приховуємо dust (< $0.01) у розгорнутому вигляді
                const visibleWallets = tok.wallets.filter((w) => w.usdValue >= 0.01);
                const hiddenCount = tok.wallets.length - visibleWallets.length;
                const groups = groupByWallet(visibleWallets);
                const hasBreakdown = groups.length > 0;
                const isMulti = groups.length > 1;
                return (
                  <Fragment key={tok.key}>
                    <tr
                      className={cn(
                        'border-b border-border/60 transition-colors',
                        hasBreakdown && 'cursor-pointer hover:bg-surface-2/50',
                        isOpen && 'bg-surface-2/40',
                      )}
                      onClick={() => hasBreakdown && toggle(openTokens, setOpenTokens, tok.key)}
                    >
                      <td className="overflow-hidden px-3 py-3 sm:px-4">
                        <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                          {hasBreakdown ? (
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 shrink-0 text-text-muted transition-transform',
                                isOpen && 'rotate-90 text-primary',
                              )}
                              aria-hidden
                            />
                          ) : (
                            <span aria-hidden className="inline-block w-4" />
                          )}
                          <TokenLogo
                            src={tok.logoUrl}
                            symbol={tok.symbol}
                            size={28}
                            chainName={tok.chainName}
                            tokenAddress={tok.tokenAddress}
                          />
                          <div className="min-w-0">
                            <p className="font-medium">{tok.symbol}</p>
                            <p className="flex items-center gap-1.5 text-xs text-text-muted">
                              <span className="truncate">{tok.name}</span>
                              {isMulti && (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium text-text-muted"
                                  title={t('countWallets')}
                                >
                                  <WalletIcon className="h-2.5 w-2.5" aria-hidden />
                                  {groups.length}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-text-muted xl:hidden">
                              {formatTokenBalance(tok.totalBalance)} {tok.symbol}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 2xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tok.chains.map((chainName) => (
                            <ChainBadge key={chainName} chainName={chainName} />
                          ))}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-xs xl:table-cell">
                        {formatTokenBalance(tok.totalBalance)}
                      </td>
                      <td className="hidden px-4 py-3 text-right 2xl:table-cell">
                        {tok.currentPrice ? formatUsd(tok.currentPrice) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-medium sm:px-4">
                        {formatUsd(tok.totalUsd)}
                      </td>
                      <td className="hidden px-4 py-3 text-right 2xl:table-cell">
                        {tok.priceChange24h !== 0 ? (
                          <PriceChange value={tok.priceChange24h} size="sm" />
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-text-muted 2xl:table-cell">
                        {tok.share.toFixed(1)}%
                      </td>
                    </tr>

                    {isOpen && hasBreakdown && (
                      <tr className="border-b border-border/60 bg-surface-2/20">
                        {([2, 3, 7] as const).map((span, index) => (
                          <td
                            key={span}
                            colSpan={span}
                            className={cn(
                              'min-w-0 px-2 py-1.5 md:px-4 md:py-3',
                              index === 0 && 'xl:hidden',
                              index === 1 && 'hidden xl:table-cell 2xl:hidden',
                              index === 2 && 'hidden 2xl:table-cell',
                            )}
                          >
                            <WalletBreakdown
                              tokenKey={tok.key}
                              groups={groups}
                              totalUsd={tok.totalUsd}
                              hiddenCount={hiddenCount}
                              openWallets={openWallets}
                              onToggleWallet={(walletKey) => toggle(openWallets, setOpenWallets, walletKey)}
                            />
                          </td>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                    {t('emptyText')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function groupByWallet(wallets: WalletTokenBreakdown[]): WalletGroup[] {
  const map = new Map<string, WalletGroup>();
  for (const w of wallets) {
    const g = map.get(w.walletId);
    if (g) {
      g.totalBalance += w.balance;
      g.totalUsd += w.usdValue;
      g.chains.push(w);
    } else {
      map.set(w.walletId, {
        walletId: w.walletId,
        walletLabel: w.walletLabel,
        walletAddress: w.walletAddress,
        totalBalance: w.balance,
        totalUsd: w.usdValue,
        chains: [w],
      });
    }
  }
  for (const g of map.values()) {
    g.chains.sort((a, b) => b.usdValue - a.usdValue);
  }
  return Array.from(map.values()).sort((a, b) => b.totalUsd - a.totalUsd);
}

function WalletBreakdown({
  tokenKey,
  groups,
  totalUsd,
  hiddenCount,
  openWallets,
  onToggleWallet,
}: {
  tokenKey: string;
  groups: WalletGroup[];
  totalUsd: number;
  hiddenCount: number;
  openWallets: Set<string>;
  onToggleWallet: (walletKey: string) => void;
}) {
  const t = useTranslations('TokenTable');
  return (
    <div className="sm:ml-6 sm:space-y-1">
      {groups.map((g) => {
        const walletKey = `${tokenKey}::${g.walletId}`;
        const isOpen = openWallets.has(walletKey);
        const walletShare = totalUsd > 0 ? (g.totalUsd / totalUsd) * 100 : 0;
        const hasMultipleChains = g.chains.length > 1;
        return (
          <div key={walletKey}>
            <button
              type="button"
              onClick={() => hasMultipleChains && onToggleWallet(walletKey)}
              className={cn(
                'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-xs transition-colors md:grid md:grid-cols-[1rem_minmax(0,1fr)_auto_auto_auto] md:gap-x-3 md:px-2',
                hasMultipleChains ? 'cursor-pointer hover:bg-surface-2/60' : 'cursor-default',
                isOpen && 'md:bg-surface-2/40',
              )}
            >
              {hasMultipleChains ? (
                <ChevronRight
                  className={cn(
                    'h-3 w-3 shrink-0 text-text-muted transition-transform',
                    isOpen && 'rotate-90 text-primary',
                  )}
                  aria-hidden
                />
              ) : (
                <span aria-hidden />
              )}

              <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
                <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                  <WalletIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                  <span className="truncate font-medium">{g.walletLabel ?? t('walletFallback')}</span>
                </span>
                <span className="hidden font-mono text-[10px] text-text-muted md:inline">
                  {shortAddress(g.walletAddress, 4)}
                </span>
                {hasMultipleChains ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium text-text-muted"
                    title={t('countNetworks')}
                  >
                    <NetworkIcon className="h-2.5 w-2.5" aria-hidden />
                    {g.chains.length}
                  </span>
                ) : g.chains[0] ? (
                  <ChainBadge chainName={g.chains[0].chainName} />
                ) : null}
              </div>

              <span className="hidden text-right font-mono text-[11px] tabular-nums md:inline">
                {formatTokenBalance(g.totalBalance)}
              </span>

              <span className="hidden text-right font-medium md:inline">
                {formatUsd(g.totalUsd)}
              </span>

              <div className="flex shrink-0 items-baseline justify-end gap-2 tabular-nums md:items-center">
                <span className="font-mono text-[11px] text-text md:hidden">
                  {formatTokenBalance(g.totalBalance)}
                </span>
                <div
                  className="hidden h-1 w-12 overflow-hidden rounded-full bg-surface-2 md:block"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(walletShare, 100).toFixed(1)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-text-muted md:w-12">
                  {walletShare.toFixed(1)}%
                </span>
              </div>
            </button>

            {isOpen && hasMultipleChains && (
              <ChainBreakdown chains={g.chains} walletTotalUsd={g.totalUsd} />
            )}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <div className="pl-2 pt-1 text-[11px] text-text-muted">
          {t('hiddenDust', { count: hiddenCount })}
        </div>
      )}
    </div>
  );
}

function ChainBreakdown({
  chains,
  walletTotalUsd,
}: {
  chains: WalletTokenBreakdown[];
  walletTotalUsd: number;
}) {
  return (
    <div className="ml-5 md:ml-7 md:mt-0.5 md:space-y-0.5 md:border-l md:border-border/60 md:pl-3">
      {chains.map((c, idx) => {
        const chainShare = walletTotalUsd > 0 ? (c.usdValue / walletTotalUsd) * 100 : 0;
        return (
          <div
            key={`${c.chainName}::${idx}`}
            className="flex min-w-0 items-center justify-between gap-2 rounded-md px-1 py-1.5 text-[11px] text-text-muted md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:gap-x-3 md:px-2 md:py-1 md:hover:bg-surface-2/40"
          >
            <ChainBadge chainName={c.chainName} />
            <span className="hidden text-right font-mono tabular-nums md:inline">{formatTokenBalance(c.balance)}</span>
            <span className="hidden text-right font-medium text-text md:inline">
              {formatUsd(c.usdValue)}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums md:block md:w-12 md:text-right">
              <span className="font-mono text-text md:hidden">{formatTokenBalance(c.balance)}</span>
              <span>{chainShare.toFixed(1)}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SortButton({
  active,
  desc,
  onClick,
  children,
}: {
  active: boolean;
  desc: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations('TokenTable');
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="-mr-2 h-6 px-1 text-[11px] uppercase tracking-wide text-text-muted hover:text-text"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${active ? 'text-primary' : 'opacity-50'}`} />
      {active && <span className="sr-only">{desc ? t('sortDescSr') : t('sortAscSr')}</span>}
    </Button>
  );
}
