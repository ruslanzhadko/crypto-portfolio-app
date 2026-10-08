"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { AllocationChart } from "@/components/dashboard/allocation-chart";
import { NetworkAllocationChart } from "@/components/dashboard/network-allocation";
import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
import { TokenTable } from "@/components/dashboard/token-table";
import { WalletList } from "@/components/dashboard/wallet-list";
import { TopMovers } from "@/components/dashboard/top-movers";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { SyncAllButton } from "@/components/dashboard/sync-all-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/utils/format";
import type {
  AggregatedToken,
  PortfolioOverview,
} from "@/lib/services/portfolio";
import type { Network } from "@prisma/client";
import { CapitalDashboard } from "@/components/exchanges/capital-dashboard";
import { Link } from "@/i18n/navigation";

type SectionKey = "topMovers" | "allocation" | "networkAllocation";

const DEFAULTS: Record<SectionKey, boolean> = {
  topMovers: true,
  allocation: true,
  networkAllocation: true,
};

const STORAGE_KEY = "dashboard-sections-v1";

export interface WalletDto {
  id: string;
  address: string;
  network: Network;
  label: string | null;
  lastSyncAt: string | null;
  totalUsd: number;
  tokenCount: number;
}

interface Props {
  exchangesEnabled?: boolean;
  pageTitle: string;
  overview: PortfolioOverview;
  spamTokens: AggregatedToken[];
  wallets: WalletDto[];
  hiddenTokensCount: number;
  lastPriceUpdateAt: string | null;
  latestSyncAt: string | null;
}

export function DashboardSections({
  exchangesEnabled = false,
  pageTitle,
  overview,
  spamTokens,
  wallets,
  hiddenTokensCount,
  lastPriceUpdateAt,
  latestSyncAt,
}: Props) {
  const [sections, setSections] =
    useState<Record<SectionKey, boolean>>(DEFAULTS);
  const [mounted, setMounted] = useState(false);
  const [chartVisible, setChartVisible] = useState<boolean | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(!exchangesEnabled);
  const t = useTranslations("Dashboard");
  const te = useTranslations("Exchanges");
  const ts = useTranslations("DashboardSections");
  const locale = useLocale();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSections({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setMounted(true);
  }, []);

  function toggle(key: SectionKey) {
    setDetailsVisible(true);
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const show = mounted ? sections : DEFAULTS;

  const sectionLabels: Record<SectionKey, string> = {
    topMovers: ts("topMovers"),
    allocation: ts("allocation"),
    networkAllocation: ts("networkAllocation"),
  };

  return (
    <div className="min-w-0 space-y-3 sm:space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 md:flex md:flex-wrap md:justify-between md:gap-3">
        <h1 className="min-w-0 text-lg font-bold tracking-tight sm:text-xl md:text-3xl">
          {pageTitle}
        </h1>
        <div className="contents md:flex md:flex-wrap md:items-center md:justify-end md:gap-3">
          <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {lastPriceUpdateAt && (
              <span
                className="text-[11px] text-text-muted sm:text-xs"
                suppressHydrationWarning
              >
                {t("pricesPrefix")}{" "}
                {formatRelative(new Date(lastPriceUpdateAt), locale)}
              </span>
            )}
            {latestSyncAt && (
              <span
                className="text-[11px] text-text-muted sm:text-xs"
                suppressHydrationWarning
              >
                {t("syncPrefix")}{" "}
                {formatRelative(new Date(latestSyncAt), locale)}
              </span>
            )}
          </div>
          <div className="col-start-2 row-start-1 flex items-center gap-1.5 sm:gap-2">
            <SyncAllButton compactOnMobile />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 w-11 gap-1.5 px-0 sm:h-9 sm:w-auto sm:px-3"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("sectionsButton")}
                  </span>
                  <span className="sr-only sm:hidden">
                    {t("sectionsButton")}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>{t("showSections")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(sectionLabels) as SectionKey[]).map((key) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={show[key]}
                    onCheckedChange={() => toggle(key)}
                  >
                    {sectionLabels[key]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:gap-5">
        {exchangesEnabled && (
          <CapitalDashboard
            walletAssets={
              overview.tokens.length || spamTokens.length ? (
                <TokenTable tokens={overview.tokens} spamTokens={spamTokens} />
              ) : (
                <p className="text-sm text-text-muted">
                  {te("noWalletAssets")}{" "}
                  <Link href="/wallets" className="text-primary">
                    {t("addWalletButton")}
                  </Link>
                </p>
              )
            }
          />
        )}
        {exchangesEnabled && (
          <Button
            variant="outline"
            className="self-start"
            aria-expanded={detailsVisible}
            onClick={() => setDetailsVisible((v) => !v)}
          >
            {te("walletDetails")}
          </Button>
        )}
        {(!exchangesEnabled || detailsVisible) && (
          <>
            {!exchangesEnabled && (
              <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
                <PortfolioChart
                  totalUsd={overview.totalUsd}
                  priceChange24h={overview.priceChange24h}
                  priceChange24hUsd={overview.priceChange24hUsd}
                  hiddenTokensCount={hiddenTokensCount}
                  onVisibilityChange={setChartVisible}
                />
                <div className="min-w-0 xl:w-64 xl:min-w-64 xl:shrink-0">
                  <PortfolioSummary
                    data={overview}
                    showLargestPositions={chartVisible === true}
                  />
                </div>
              </div>
            )}

            <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
              {show.topMovers && (
                <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none xl:h-full">
                  <TopMovers tokens={overview.tokens} />
                </div>
              )}
              <div
                className={
                  show.topMovers ? "min-w-0 xl:h-full" : "min-w-0 xl:col-span-2"
                }
              >
                <WalletList wallets={wallets} />
              </div>
            </div>

            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_27rem] 2xl:grid-cols-[minmax(0,1fr)_29rem]">
              <div className="min-w-0">
                {!exchangesEnabled ? (
                  <TokenTable
                    tokens={overview.tokens}
                    spamTokens={spamTokens}
                  />
                ) : (
                  <PortfolioSummary
                    data={overview}
                    showLargestPositions={false}
                  />
                )}
              </div>
              <div className="min-w-0">
                <RecentTransactions />
              </div>
            </div>

            {(show.allocation || show.networkAllocation) && (
              <div className="grid gap-4 lg:grid-cols-2">
                {show.allocation && (
                  <AllocationChart tokens={overview.tokens} />
                )}
                {show.networkAllocation && (
                  <NetworkAllocationChart chains={overview.chains} />
                )}
              </div>
            )}
          </>
        )}
        {exchangesEnabled && <div id="capital-sources" />}
      </div>
    </div>
  );
}
