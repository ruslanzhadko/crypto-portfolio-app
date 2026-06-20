'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { AllocationChart } from '@/components/dashboard/allocation-chart';
import { NetworkAllocationChart } from '@/components/dashboard/network-allocation';
import { PortfolioChart } from '@/components/dashboard/portfolio-chart';
import { TokenTable } from '@/components/dashboard/token-table';
import { WalletList } from '@/components/dashboard/wallet-list';
import { TopMovers } from '@/components/dashboard/top-movers';
import { SyncAllButton } from '@/components/dashboard/sync-all-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { formatRelative } from '@/lib/utils/format';
import type { PortfolioOverview } from '@/lib/services/portfolio';
import type { Network } from '@prisma/client';

type SectionKey = 'topMovers' | 'allocation' | 'networkAllocation';

const SECTION_LABELS: Record<SectionKey, string> = {
  topMovers: 'Лідери зростання / Падіння',
  allocation: 'Розподіл активів',
  networkAllocation: 'Розподіл по мережах',
};

const DEFAULTS: Record<SectionKey, boolean> = {
  topMovers: true,
  allocation: true,
  networkAllocation: true,
};

const STORAGE_KEY = 'dashboard-sections-v1';

export interface WalletDto {
  id: string;
  address: string;
  network: Network;
  label: string | null;
  lastSyncAt: Date | null;
  totalUsd: number;
  tokenCount: number;
}

interface Props {
  overview: PortfolioOverview;
  wallets: WalletDto[];
  hiddenTokensCount: number;
  lastPriceUpdateAt: string | null;
  latestSyncAt: string | null;
}

export function DashboardSections({
  overview,
  wallets,
  hiddenTokensCount,
  lastPriceUpdateAt,
  latestSyncAt,
}: Props) {
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSections({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setMounted(true);
  }, []);

  function toggle(key: SectionKey) {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Use defaults before mount to avoid layout shift
  const show = mounted ? sections : DEFAULTS;

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {lastPriceUpdateAt && (
            <span className="text-xs text-text-muted" suppressHydrationWarning>
              Ціни: {formatRelative(new Date(lastPriceUpdateAt))}
            </span>
          )}
          {latestSyncAt && (
            <span className="text-xs text-text-muted" suppressHydrationWarning>
              Sync: {formatRelative(new Date(latestSyncAt))}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncAllButton />
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/compare">Порівняти гаманці</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Розділи</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Показувати розділи</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={show[key]}
                  onCheckedChange={() => toggle(key)}
                >
                  {SECTION_LABELS[key]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/*
        Mobile order:  Stats → PfChart → Tokens → TopMovers → AllocCharts
        Desktop order: Stats → TopMovers → AllocCharts → PfChart → Tokens
      */}
      <div className="flex flex-col gap-6">
        <PortfolioSummary data={overview} />

        {/* PfChart: mobile 2nd, desktop 4th */}
        <div className="sm:order-4">
          <PortfolioChart
            totalUsd={overview.totalUsd}
            priceChange24h={overview.priceChange24h}
            hiddenTokensCount={hiddenTokensCount}
          />
        </div>

        {/* Tokens: mobile 3rd, desktop last */}
        <div className="sm:order-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TokenTable tokens={overview.tokens} />
            </div>
            <WalletList wallets={wallets} />
          </div>
        </div>

        {/* TopMovers: mobile 4th, desktop 2nd */}
        {show.topMovers && (
          <div className="sm:order-1">
            <TopMovers tokens={overview.tokens} />
          </div>
        )}

        {/* Allocation charts: mobile 5th, desktop 3rd */}
        {(show.allocation || show.networkAllocation) && (
          <div className="sm:order-2">
            <div className="grid gap-4 lg:grid-cols-2">
              {show.allocation && <AllocationChart tokens={overview.tokens} />}
              {show.networkAllocation && <NetworkAllocationChart chains={overview.chains} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
