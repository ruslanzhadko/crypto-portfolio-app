'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, ChevronDown, ChevronRight, Eye, Search, Wallet as WalletIcon, Network as NetworkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenLogo } from '@/components/common/token-logo';
import { PriceChange } from '@/components/common/price-change';
import {
  formatTokenBalance,
  formatUsd,
  shortAddress,
} from '@/lib/utils/format';
import { ChainBadge } from '@/components/common/network-badge';
import { LowValueFilter, useLowValueFilter } from '@/components/common/low-value-filter';
import { cn } from '@/lib/utils/cn';
import { getChainDisplayName } from '@/lib/utils/networks';
import { filterDashboardTokens } from '@/lib/utils/dashboard-token-filter';
import type { AggregatedToken, WalletTokenBreakdown } from '@/lib/services/portfolio';
import { mergeExchangeHoldings, type ExchangeHolding, type UnifiedToken } from '@/lib/portfolio/unified-assets';
import { ExchangeTokenLogo } from '@/components/exchanges/token-logo';
import { ExchangeLogo, exchangeName } from '@/components/exchanges/exchange-logo';
import { useDisplayPreference } from '@/components/exchanges/display-preferences';

type SortKey = 'value' | 'balance' | 'change';

interface WalletGroup {
  walletId: string;
  walletLabel: string | null;
  walletAddress: string;
  totalBalance: number;
  totalUsd: number;
  chains: WalletTokenBreakdown[];
}

export function TokenTable({
  tokens: walletTokens,
  spamTokens,
  exchangeHoldings,
  variant = 'default',
}: {
  tokens: AggregatedToken[];
  spamTokens: AggregatedToken[];
  /** "exchanges": exchange coins only — no spam or network controls. */
  variant?: 'default' | 'exchanges';
  /** When given, exchange balances join the list (dashboard "All"). */
  exchangeHoldings?: ExchangeHolding[];
}) {
  const t = useTranslations('TokenTable');
  const tokens: UnifiedToken[] = useMemo(
    () => mergeExchangeHoldings(walletTokens, exchangeHoldings ?? []),
    [walletTokens, exchangeHoldings],
  );
  const spam: UnifiedToken[] = useMemo(
    () => mergeExchangeHoldings(spamTokens, []),
    [spamTokens],
  );
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [desc, setDesc] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedChains, setSelectedChains] = useState<Set<string>>(() => new Set());
  const [showSpam, setShowSpam] = useState(false);
  const [hideLowValue, setHideLowValue] = useLowValueFilter('tokens');
  // The combined list uses the exchange "Balances from" minimum for rows and
  // for every wallet/exchange line in the breakdown (totals are unchanged).
  const combined = exchangeHoldings !== undefined;
  const [minimum, setMinimum] = useDisplayPreference('exchange-dust-minimum', '0.10');
  const threshold = combined
    ? (['0', '0.10', '1', '10'].includes(minimum) ? Number(minimum) : 0.1)
    : null;
  const te = useTranslations('Exchanges');
  // Окремі множини для розгорнутих токенів і розгорнутих гаманців (ключі: tokenKey та tokenKey::walletId)
  const [openTokens, setOpenTokens] = useState<Set<string>>(new Set());
  const [openWallets, setOpenWallets] = useState<Set<string>>(new Set());

  const availableChains = useMemo(() => Array.from(new Set(
    [...tokens, ...spamTokens].flatMap((token) => token.chains),
  )).sort((a, b) => getChainDisplayName(a).localeCompare(getChainDisplayName(b))), [tokens, spamTokens]);

  const tickerSymbols = useMemo(
    () => [...new Set(tokens.filter((tok) => tok.exchangeOnly).map((tok) => tok.symbol.toUpperCase()))].sort().join(','),
    [tokens],
  );
  const [tickerChanges, setTickerChanges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!tickerSymbols) return;
    const controller = new AbortController();
    fetch(`/api/market/changes?symbols=${encodeURIComponent(tickerSymbols)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { changes?: Record<string, number> } | null) => {
        if (body?.changes) setTickerChanges(body.changes);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tickerSymbols]);
  const changeOf = (tok: UnifiedToken): number | null =>
    tok.exchangeOnly
      ? (tickerChanges[tok.symbol.toUpperCase()] ?? null)
      : tok.priceChange24h !== 0
        ? tok.priceChange24h
        : null;

  const spamKeys = useMemo(() => new Set(spam.map((token) => token.key)), [spam]);
  const sorted = useMemo(() => {
    const order = (arr: UnifiedToken[]) => arr.sort((a, b) => {
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
          av = changeOf(a) ?? 0;
          bv = changeOf(b) ?? 0;
          break;
      }
      return desc ? bv - av : av - bv;
    });
    const regular = filterDashboardTokens(tokens, selectedChains, search)
      .filter((token) => (threshold === null ? !hideLowValue || token.totalUsd >= 1 : token.totalUsd >= threshold));
    // Spam asked for explicitly is shown whatever its value, after the regular tokens.
    const shownSpam = showSpam ? filterDashboardTokens(spam, selectedChains, search) : [];
    return [...order(regular), ...order(shownSpam)];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- changeOf reads tickerChanges
  }, [tokens, spam, showSpam, selectedChains, search, sortKey, desc, hideLowValue, threshold, tickerChanges]);

  function toggleChain(chain: string) {
    setSelectedChains((current) => {
      const next = new Set(current);
      if (next.has(chain)) next.delete(chain);
      else next.add(chain);
      return next;
    });
  }

  const networkLabel = selectedChains.size === 0
    ? t('allNetworks')
    : selectedChains.size === 1
      ? getChainDisplayName([...selectedChains][0]!)
      : t('networksSelected', { count: selectedChains.size });

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
    <Card className="[overflow-anchor:none]">
      <CardHeader className="space-y-2 p-3 pb-2 sm:space-y-3 sm:p-6 sm:pb-3">
        {/* Title with the list settings on one row; search and networks below. */}
        <div className="flex items-center gap-2">
          <CardTitle className="mr-auto text-base sm:text-lg">{t('cardTitle')}</CardTitle>
          {threshold === null ? (
            <LowValueFilter checked={hideLowValue} onCheckedChange={setHideLowValue} />
          ) : (
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <span className="sr-only sm:not-sr-only">{te('minimumBalance')}</span>
              <select
                aria-label={te('minimumBalance')}
                title={te('minimumBalance')}
                className="h-8 rounded-md border border-border bg-surface px-1.5 text-xs text-text sm:h-9 sm:px-2 sm:text-sm"
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              >
                {['0', '0.10', '1', '10'].map((value) => (
                  <option key={value} value={value}>
                    {value === '0' ? te('showAllBalances') : `≥ $${value}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {variant !== 'exchanges' && <Button
            variant={showSpam ? 'default' : 'outline'}
            size="sm"
            className="h-8 shrink-0 gap-1.5 border px-2 text-xs tabular-nums sm:h-9 sm:px-3 sm:text-sm"
            disabled={spamTokens.length === 0}
            aria-pressed={showSpam}
            title={t('spamNotice')}
            onClick={() => setShowSpam((value) => !value)}
          >
            <Eye className="h-4 w-4" aria-hidden />
            {t('showSpam', { count: spamTokens.length })}
          </Button>}
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              className="h-9 pl-9 text-[13px] sm:h-10 sm:text-sm"
            />
          </div>
          {variant !== 'exchanges' && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-32 shrink-0 justify-between gap-1 px-2.5 text-[13px] sm:h-10 sm:w-44 sm:gap-2 sm:px-4 sm:text-sm"
                aria-label={t('networkFilter')}
              >
                <span className="truncate">{networkLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuCheckboxItem
                checked={selectedChains.size === 0}
                onCheckedChange={() => setSelectedChains(new Set())}
                onSelect={(event) => event.preventDefault()}
              >
                {t('allNetworks')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {availableChains.map((chain) => (
                <DropdownMenuCheckboxItem
                  key={chain}
                  checked={selectedChains.has(chain)}
                  onCheckedChange={() => toggleChain(chain)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {getChainDisplayName(chain)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
        {spamTokens.length > 0 && <p className="hidden text-xs text-text-muted sm:block">{t('spamNotice')}</p>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border text-xs uppercase text-text-muted">
              <tr>
                <th className="w-3/5 px-3 py-2 text-left sm:px-4 sm:py-3 lg:w-1/2 2xl:w-[22%]">{t('colToken')}</th>
                <th className="hidden px-4 py-3 text-left 2xl:table-cell 2xl:w-[30%]">{t('colNetworks')}</th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell 2xl:w-[11%]">
                  <SortButton active={sortKey === 'balance'} desc={desc} onClick={() => toggleSort('balance')}>
                    {t('colBalance')}
                  </SortButton>
                </th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell 2xl:w-[10%]">{t('colPrice')}</th>
                <th className="px-3 py-2 text-right sm:px-4 sm:py-3 2xl:w-[11%]">
                  <SortButton active={sortKey === 'value'} desc={desc} onClick={() => toggleSort('value')}>
                    {t('colUsd')}
                  </SortButton>
                </th>
                <th className="hidden px-4 py-3 text-right lg:table-cell 2xl:w-[10%]">
                  <SortButton active={sortKey === 'change'} desc={desc} onClick={() => toggleSort('change')}>
                    {t('col24h')}
                  </SortButton>
                </th>
                <th className="hidden px-4 py-3 text-right 2xl:table-cell 2xl:w-[6%]">{t('colShare')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tok) => {
                const isOpen = openTokens.has(tok.key);
                // Приховуємо dust (< $0.01) у розгорнутому вигляді
                const lineMinimum = Math.max(0.01, threshold ?? 0);
                const isSpam = spamKeys.has(tok.key);
                const visibleWallets = isSpam ? tok.wallets : tok.wallets.filter((w) => w.usdValue >= lineMinimum);
                const visibleExchanges = tok.exchanges.filter((h) => Math.abs(h.usdValue) >= (threshold ?? 0));
                const hiddenCount =
                  tok.wallets.length - visibleWallets.length + tok.exchanges.length - visibleExchanges.length;
                const groups = groupByWallet(visibleWallets);
                const lineCount = visibleWallets.length + visibleExchanges.length;
                const hasBreakdown = lineCount > 1;
                const sourceCount = groups.length + visibleExchanges.length;
                const isMulti = sourceCount > 1;
                const onlyExchange = lineCount === 1 ? visibleExchanges[0] : undefined;
                const onlyWallet = lineCount === 1 ? visibleWallets[0] : undefined;
                const subtitle = onlyExchange
                  ? `${onlyExchange.label} · ${te.has(`kinds.${onlyExchange.kind}`) ? te(`kinds.${onlyExchange.kind}`) : onlyExchange.kind}`
                  : onlyWallet
                    ? `${tok.name} · ${onlyWallet.walletLabel ?? shortAddress(onlyWallet.walletAddress, 4)}`
                    : tok.exchangeOnly
                      ? [...new Set(tok.exchanges.map((h) => exchangeName(h.exchange)))].join(' · ')
                      : tok.name;
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
                      <td className="overflow-hidden px-3 py-2 sm:px-4 sm:py-3">
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
                            <span aria-hidden className="inline-block w-4 shrink-0" />
                          )}
                          <span className="shrink-0">
                            {tok.exchangeOnly ? (
                              <ExchangeTokenLogo symbol={tok.symbol} />
                            ) : (
                              <TokenLogo
                                src={tok.logoUrl}
                                symbol={tok.symbol}
                                size={28}
                                chainName={tok.chainName}
                                tokenAddress={tok.tokenAddress}
                              />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium sm:text-base">
                              {tok.symbol}
                              {isSpam && (
                                <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-medium uppercase text-warning">
                                  {t('spamBadge')}
                                </span>
                              )}
                            </p>
                            <p className="flex items-center gap-1.5 text-xs text-text-muted">
                              <span className="truncate" title={subtitle}>
                                {subtitle}
                              </span>
                              {isMulti && (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium text-text-muted"
                                  title={t('countWallets')}
                                >
                                  <WalletIcon className="h-2.5 w-2.5" aria-hidden />
                                  {sourceCount}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 hidden font-mono text-xs text-text-muted sm:block xl:hidden">
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
                          {[...new Set(tok.exchanges.map((h) => h.exchange))].map((exchange) => (
                            <ExchangeBadge key={exchange} exchange={exchange} />
                          ))}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-xs text-text-muted 2xl:table-cell">
                        {formatTokenBalance(tok.totalBalance)}
                      </td>
                      <td className="hidden px-4 py-3 text-right 2xl:table-cell">
                        {tok.currentPrice ? formatUsd(tok.currentPrice) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums sm:px-4 sm:py-3">
                        {formatUsd(tok.totalUsd)}
                        <p className="truncate font-mono text-[11px] font-normal text-text-muted sm:hidden">
                          {formatTokenBalance(tok.totalBalance)} {tok.symbol}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 text-right lg:table-cell">
                        {changeOf(tok) !== null ? (
                          <PriceChange value={changeOf(tok)!} size="sm" />
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-text-muted 2xl:table-cell">
                        {isSpam ? '—' : `${tok.share.toFixed(1)}%`}
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
                              index === 0 && 'lg:hidden',
                              index === 1 && 'hidden lg:table-cell 2xl:hidden',
                              index === 2 && 'hidden 2xl:table-cell',
                            )}
                          >
                            <WalletBreakdown
                              tokenKey={tok.key}
                              groups={groups}
                              totalUsd={tok.totalUsd}
                              hiddenCount={threshold === null ? hiddenCount : 0}
                              openWallets={openWallets}
                              onToggleWallet={(walletKey) => toggle(openWallets, setOpenWallets, walletKey)}
                            />
                            {visibleExchanges.length > 0 && (
                              <ExchangeBreakdown holdings={visibleExchanges} totalUsd={tok.totalUsd} />
                            )}
                            {threshold !== null && hiddenCount > 0 && (
                              <div className="pl-2 pt-1 text-[11px] text-text-muted sm:ml-6">
                                {t('hiddenBelow', { count: hiddenCount, minimum: threshold > 0 ? minimum : '0.01' })}
                              </div>
                            )}
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
                    {search.trim() || selectedChains.size > 0 || hideLowValue
                      ? t('noFilterResults')
                      : t('emptyText')}
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
    <div className={cn('sm:ml-6 sm:space-y-1', UNFOLD)}>
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

// A short fade and slide for content that appears when a row is unfolded.
const UNFOLD = 'animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none';

function ChainBreakdown({
  chains,
  walletTotalUsd,
}: {
  chains: WalletTokenBreakdown[];
  walletTotalUsd: number;
}) {
  return (
    <div className={cn('ml-5 md:ml-7 md:mt-0.5 md:space-y-0.5 md:border-l md:border-border/60 md:pl-3', UNFOLD)}>
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

function ExchangeBadge({ exchange }: { exchange: string }) {
  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text">
      <ExchangeLogo exchange={exchange} size={14} />
      {exchangeName(exchange)}
    </span>
  );
}

function ExchangeBreakdown({ holdings, totalUsd }: { holdings: ExchangeHolding[]; totalUsd: number }) {
  const te = useTranslations('Exchanges');
  return (
    <div className={cn('sm:ml-6 sm:space-y-1', UNFOLD)}>
      {holdings.map((h) => {
        const share = totalUsd > 0 ? (h.usdValue / totalUsd) * 100 : 0;
        return (
          <div
            key={h.key}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-xs md:grid md:grid-cols-[1rem_minmax(0,1fr)_auto_auto_auto] md:gap-x-3 md:px-2"
          >
            <span aria-hidden />
            <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
              <ExchangeLogo exchange={h.exchange} size={14} />
              <span className="truncate font-medium">{h.label}</span>
              <span className="hidden shrink-0 text-[10px] text-text-muted md:inline">
                {exchangeName(h.exchange)} · {te.has(`kinds.${h.kind}`) ? te(`kinds.${h.kind}`) : h.kind}
                {h.note === 'equity' && ` · ${te('asterEquityBalance')}`}
              </span>
            </div>
            <span className="hidden text-right font-mono text-[11px] tabular-nums md:inline">
              {formatTokenBalance(h.amount)}
            </span>
            <span className="hidden text-right font-medium md:inline">{formatUsd(h.usdValue)}</span>
            <div className="flex shrink-0 items-baseline justify-end gap-2 tabular-nums md:items-center">
              <span className="font-mono text-[11px] text-text md:hidden">{formatTokenBalance(h.amount)}</span>
              <div className="hidden h-1 w-12 overflow-hidden rounded-full bg-surface-2 md:block" aria-hidden>
                <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(share, 100).toFixed(1)}%` }} />
              </div>
              <span className="w-10 text-right text-text-muted md:w-12">{share.toFixed(1)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
