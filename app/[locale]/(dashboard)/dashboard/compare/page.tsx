import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronLeft, Sparkles, Wallet as WalletIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NetworkBadge, ChainBadge } from '@/components/common/network-badge';
import { PriceChange } from '@/components/common/price-change';
import { formatRelative, formatUsd, shortAddress } from '@/lib/utils/format';
import { EmptyState } from '@/components/common/empty-state';
import { cn } from '@/lib/utils/cn';

export const dynamic = 'force-dynamic';

// ─── Дбайливо підібрана палітра для дашборду ─────────────────────
// 8 пар кольорів gradient — для аватарок гаманців і сегментів stacked-bar
const WALLET_PALETTE: ReadonlyArray<{ from: string; to: string }> = [
  { from: '#6366f1', to: '#8b5cf6' }, // Indigo → Violet
  { from: '#ec4899', to: '#f43f5e' }, // Pink → Rose
  { from: '#06b6d4', to: '#0ea5e9' }, // Cyan → Sky
  { from: '#10b981', to: '#14b8a6' }, // Emerald → Teal
  { from: '#f59e0b', to: '#f97316' }, // Amber → Orange
  { from: '#a855f7', to: '#d946ef' }, // Purple → Fuchsia
  { from: '#3b82f6', to: '#6366f1' }, // Blue → Indigo
  { from: '#84cc16', to: '#22c55e' }, // Lime → Green
];

// Плоскі кольори для токенів (узгоджені з палітрою гаманців за тоном)
const TOKEN_COLORS = [
  '#818cf8', // Indigo-400
  '#c084fc', // Violet-400
  '#22d3ee', // Cyan-400
  '#34d399', // Emerald-400
  '#fbbf24', // Amber-400
  '#fb7185', // Rose-400
  '#60a5fa', // Blue-400
  '#a3e635', // Lime-400
];
const REST_COLOR = '#3a3a4a';

interface WalletAccent {
  from: string;
  to: string;
  gradient: string;
}

function accentForWallet(address: string): WalletAccent {
  const seed = address
    .toLowerCase()
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.codePointAt(0)!) >>> 0, 7);
  const idx = seed % WALLET_PALETTE.length;
  const palette = WALLET_PALETTE[idx]!;
  return {
    from: palette.from,
    to: palette.to,
    gradient: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
  };
}

function getInitials(label: string | null, address: string): string {
  if (label?.trim()) {
    const words = label.trim().split(/\s+/);
    const a = words[0]?.[0];
    const b = words[1]?.[0];
    if (a && b) return (a + b).toUpperCase();
    return label.slice(0, 2).toUpperCase();
  }
  return address.startsWith('0x')
    ? address.slice(2, 4).toUpperCase()
    : address.slice(0, 2).toUpperCase();
}

// ─── Reusable StackedBar з hover-тултіпами ──────────────────────
interface BarSegment {
  id: string;
  label: string;
  usd: number;
  pct: number;
  color: string; // CSS background (solid color or gradient)
}

function StackedBar({
  segments,
  height = 'h-3',
}: {
  segments: BarSegment[];
  height?: string;
}) {
  // Малий поріг щоб не показувати сегменти 0% (вони ламають верстку tooltip'а)
  const visible = segments.filter((s) => s.pct > 0);

  return (
    <div className="relative">
      {/* Видимий бар */}
      <div className={cn('flex w-full overflow-hidden rounded-full bg-surface-2', height)}>
        {visible.map((s) => (
          <div key={s.id} style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </div>

      {/* Невидимий hover-шар поверх — кожен сегмент = group для tooltip'а */}
      <div className={cn('absolute inset-0 flex', height)}>
        {visible.map((s) => (
          <div
            key={s.id}
            className="group/seg relative cursor-pointer"
            style={{ width: `${s.pct}%` }}
          >
            <div
              className={cn(
                'pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2',
                'whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-card',
                'opacity-0 transition-opacity group-hover/seg:opacity-100',
              )}
            >
              <p className="font-medium">{s.label}</p>
              <p className="tabular-nums text-text-muted">
                {formatUsd(s.usd, { compact: true })} · {s.pct.toFixed(1)}%
              </p>
              {/* Маленька стрілка-трикутник */}
              <div
                className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-border bg-popover"
                aria-hidden
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ComparePage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const wallets = await prisma.wallet.findMany({
    where: { userId: session.user.id },
    include: {
      balances: {
        where: { isSpam: false, isHidden: false },
        orderBy: { usdValue: 'desc' },
      },
    },
  });

  const t = await getTranslations('Compare');
  const locale = await getLocale();

  if (wallets.length === 0) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>
        </Button>
        <EmptyState
          icon={WalletIcon}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      </div>
    );
  }

  const enriched = wallets
    .map((w) => {
      const totalUsd = w.balances.reduce((s, b) => s + b.usdValue, 0);
      const change24hUsd = w.balances.reduce((s, b) => {
        if (b.priceChange24h === 0 || b.usdValue === 0) return s;
        const prev = b.usdValue / (1 + b.priceChange24h / 100);
        return s + (b.usdValue - prev);
      }, 0);
      const change24hPct = totalUsd > 0 ? (change24hUsd / totalUsd) * 100 : 0;
      const chainSet = new Set(w.balances.map((b) => b.chainName).filter((c) => !!c));
      return {
        ...w,
        totalUsd,
        change24hUsd,
        change24hPct,
        chains: Array.from(chainSet),
        accent: accentForWallet(w.address),
      };
    })
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const portfolioTotal = enriched.reduce((s, w) => s + w.totalUsd, 0);
  const portfolioChangeUsd = enriched.reduce((s, w) => s + w.change24hUsd, 0);
  const portfolioChangePct =
    portfolioTotal > 0 ? (portfolioChangeUsd / portfolioTotal) * 100 : 0;
  const totalTokens = enriched.reduce((s, w) => s + w.balances.length, 0);

  // Сегменти для глобального бару гаманців
  const walletSegments: BarSegment[] = enriched.map((w) => ({
    id: w.id,
    label: w.label ?? shortAddress(w.address),
    usd: w.totalUsd,
    pct: portfolioTotal > 0 ? (w.totalUsd / portfolioTotal) * 100 : 0,
    color: w.accent.gradient,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">{t('pageTitle')}</h1>
        <p className="text-sm text-text-muted">{t('pageDescription')}</p>
      </div>

      {/* ─── Summary panel ─────────────────────────────────────── */}
      <Card className="card-gradient">
        <CardContent className="space-y-6 p-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              {t('totalValueLabel')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-bold tabular-nums">
                {formatUsd(portfolioTotal)}
              </span>
              {Math.abs(portfolioChangePct) > 0 && (
                <PriceChange value={portfolioChangePct} />
              )}
              <span className="text-xs text-text-muted">
                {t('walletsTokensSummary', { wallets: enriched.length, tokens: totalTokens })}
              </span>
            </div>
          </div>

          {/* Stacked bar — частка кожного гаманця у портфелі */}
          {portfolioTotal > 0 && (
            <div className="space-y-3">
              <StackedBar segments={walletSegments} height="h-2.5" />

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                {enriched.map((w) => {
                  const widthPct =
                    portfolioTotal > 0 ? (w.totalUsd / portfolioTotal) * 100 : 0;
                  return (
                    <div key={w.id} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: w.accent.gradient }}
                      />
                      <span className="text-text-muted">
                        {w.label ?? shortAddress(w.address)}
                      </span>
                      <span className="font-medium tabular-nums">
                        {widthPct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Wallet cards ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {enriched.map((w, idx) => {
          const share = portfolioTotal > 0 ? (w.totalUsd / portfolioTotal) * 100 : 0;
          const top = w.balances.slice(0, 5);
          const topUsd = top.reduce((s, t) => s + t.usdValue, 0);
          const restUsd = w.totalUsd - topUsd;
          const restPct = w.totalUsd > 0 ? (restUsd / w.totalUsd) * 100 : 0;
          const isLargest = idx === 0 && enriched.length > 1 && w.totalUsd > 0;

          return (
            <Card
              key={w.id}
              className={cn(
                'card-gradient relative transition-shadow hover:shadow-card',
                isLargest && 'ring-1 ring-primary/40',
              )}
            >
              {/* Декоративна вертикальна смуга кольору гаманця зліва */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-2xl"
                style={{ background: w.accent.gradient }}
              />

              {isLargest && (
                <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {t('largestBadge')}
                </div>
              )}

              <CardContent className="space-y-5 p-6 pl-7">
                {/* Header: avatar + label + address + network */}
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-card"
                    style={{ background: w.accent.gradient }}
                    aria-hidden
                  >
                    {getInitials(w.label, w.address)}
                  </div>
                  <div className="min-w-0 flex-1 pr-20">
                    <h3 className="truncate text-lg font-bold leading-tight">
                      {w.label ?? t('noLabel')}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate font-mono text-xs text-text-muted">
                        {shortAddress(w.address, 8)}
                      </p>
                      <NetworkBadge network={w.network} className="shrink-0 text-[10px]" />
                    </div>
                  </div>
                </div>

                {/* Total + 24h */}
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-3xl font-bold tabular-nums">
                      {formatUsd(w.totalUsd)}
                    </span>
                    {w.change24hPct !== 0 && <PriceChange value={w.change24hPct} />}
                  </div>
                  <p className="mt-1.5 text-xs text-text-muted">
                    {t('walletShareSummary', { share: share.toFixed(1), tokens: w.balances.length, networks: w.chains.length })}
                  </p>
                </div>

                {/* Список топ-5 — кожен рядок має м'який bg-fill за пропорцією */}
                {top.length > 0 && w.totalUsd > 0 && (
                  <div>
                    <p className="mb-2.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {t('topTokensHeading')}
                    </p>
                    <ul className="space-y-1">
                      {top.map((t, i) => {
                        const tokenPct = (t.usdValue / w.totalUsd) * 100;
                        const color = TOKEN_COLORS[i % TOKEN_COLORS.length]!;
                        return (
                          <li
                            key={t.id}
                            className="relative grid grid-cols-[minmax(0,1fr),auto,auto] items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-xs"
                            style={{
                              backgroundImage: `linear-gradient(to right, ${color}22 ${tokenPct}%, transparent ${tokenPct}%)`,
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              <span className="truncate font-medium">{t.tokenSymbol}</span>
                            </div>
                            <span className="tabular-nums text-text-muted">
                              {formatUsd(t.usdValue, { compact: true })}
                            </span>
                            <span className="w-12 text-right tabular-nums text-text-muted">
                              {tokenPct.toFixed(1)}%
                            </span>
                          </li>
                        );
                      })}
                      {restUsd > 0 && (
                        <li
                          className="relative grid grid-cols-[minmax(0,1fr),auto,auto] items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-xs text-text-muted"
                          style={{
                            backgroundImage: `linear-gradient(to right, ${REST_COLOR}40 ${restPct}%, transparent ${restPct}%)`,
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: REST_COLOR }}
                            />
                            <span className="truncate">
                              {t('otherTokens', { count: w.balances.length - top.length })}
                            </span>
                          </div>
                          <span className="tabular-nums">
                            {formatUsd(restUsd, { compact: true })}
                          </span>
                          <span className="w-12 text-right tabular-nums">
                            {restPct.toFixed(1)}%
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Мережі — показуємо лише якщо їх більше однієї */}
                {w.chains.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    {w.chains.map((c) => (
                      <ChainBadge key={c} chainName={c} />
                    ))}
                  </div>
                )}

                {/* Footer: sync time */}
                <p className="text-[11px] text-text-muted">
                  {t('lastSync', { time: formatRelative(w.lastSyncAt, locale) })}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
