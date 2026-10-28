"use client";
import { useEffect, useState, useMemo } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  CapitalOverview,
  getCapitalHistory,
} from "@/lib/exchanges/portfolio";
import { useExchangeData, exchangeAction } from "./use-exchange-data";
import { publishCapitalSummary } from "@/components/layout/use-capital-summary";
import { summarizeOverview } from "@/lib/portfolio/capital-summary";
import { Money, Quantity, Updated, ExchangeErrorNotice } from "./shared";
import { BalanceTable } from "./balance-table";
import { exchangeBalanceRows } from "@/lib/exchanges/balance-rows";
import { TokenTable } from "@/components/dashboard/token-table";
import type {
  AggregatedToken,
  ChainAllocation,
} from "@/lib/services/portfolio";
import {
  mergeExchangeHoldings,
  type ExchangeHolding,
  type UnifiedToken,
} from "@/lib/portfolio/unified-assets";
import {
  combineAllocations,
  exchangeAllocation,
} from "@/lib/portfolio/exchange-allocation";
import { EXCHANGE_NAMES } from "./exchange-logo";
import { TopMovers } from "@/components/dashboard/top-movers";
import { AllocationChart } from "@/components/dashboard/allocation-chart";
import { NetworkAllocationChart } from "@/components/dashboard/network-allocation";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import {
  tokenChange,
  useTickerChanges,
} from "@/components/dashboard/use-ticker-changes";
import { PositionsPage } from "./positions-page";
import { capitalChartData } from "./capital-chart-data";
import { useDisplayPreference } from "./display-preferences";
import { useWalletSync } from "@/components/dashboard/sync-all-button";
import { useTouchTooltip } from "@/components/common/use-touch-tooltip";
import {
  runInBackground,
  useBackgroundTask,
} from "@/components/dashboard/background-tasks";
import { useIsDemo } from "@/components/demo/demo-context";

export function CapitalDashboard({
  walletAssets,
  walletDetails,
  walletTokens,
  walletChains,
  spamTokens,
  sections = { topMovers: true, allocation: true, networkAllocation: true },
}: {
  walletAssets: React.ReactNode;
  /** Wallet movers and the wallet list for the "Wallets" tab. */
  walletDetails?: React.ReactNode;
  /** Wallet tokens for the combined wallets + exchanges list in "All". */
  walletTokens?: AggregatedToken[];
  /** Wallet value per network, for the allocation bars. */
  walletChains?: ChainAllocation[];
  spamTokens?: AggregatedToken[];
  /** Overview blocks the user chose to show; every tab honours them. */
  sections?: { topMovers: boolean; allocation: boolean; networkAllocation: boolean };
}) {
  const demo = useIsDemo();
  const tooltip = useTouchTooltip();
  const t = useTranslations("Exchanges"),
    tm = useTranslations("TopMovers"),
    tn = useTranslations("NetworkAllocationChart"),
    tr = useTranslations("RecentTransactions"),
    locale = useLocale();
  const [scope, setScope] = useState<"all" | "wallets" | "exchanges">("all"),
    [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const wallets = useWalletSync();
  const [historyOpen, setHistoryOpen] = useDisplayPreference(
    "exchange-capital-history-open",
    "true",
  );
  const data = useExchangeData<{ overview: CapitalOverview }>(
    "/api/portfolio/capital?view=overview",
  );
  // Snapshots use five-minute buckets; polling faster only re-reads them.
  const chartData = useExchangeData<{
    history: Awaited<ReturnType<typeof getCapitalHistory>>;
  }>(`/api/portfolio/capital?view=history&days=${days}`, 300_000);
  const overview = data.data?.overview,
    history = chartData.data?.history;
  // The header pill shows the same capital as this page, without a request of its own.
  useEffect(() => {
    if (overview) publishCapitalSummary(summarizeOverview(overview));
  }, [overview]);
  /** The refresh button follows the selected tab: everything, wallets only or exchanges only. */
  function refreshScope() {
    if (scope !== "exchanges") wallets.runSync();
    if (scope !== "wallets") runInBackground("exchange-sync", refresh);
  }
  const refreshing = useBackgroundTask("exchange-sync") || wallets.isPending;
  const refreshLabel = t(
    scope === "all"
      ? "refreshAll"
      : scope === "wallets"
        ? "refreshWallets"
        : "refreshExchanges",
  );
  async function refresh() {
    setError(null);
    const ids = [
      ...new Set(
        overview?.accounts
          .filter((a) =>
            ["ACTIVE", "PARTIAL", "ERROR", "PENDING"].includes(a.status),
          )
          .map((a) => a.connectionId),
      ),
    ];
    const results = await Promise.allSettled(
      ids.map((id) => exchangeAction(`/api/exchanges/${id}/sync`, "POST")),
    );
    if (results.some((r) => r.status === "rejected"))
      setError("REFRESH_PARTIAL");
    data.refresh();
  }
  const chart = capitalChartData(history?.points ?? []).map((point) => ({
    ...point,
    total:
      point.wallets === null || point.exchanges === null
        ? null
        : point.wallets + point.exchanges,
  }));
  const shortHistory =
    chart.length > 0 &&
    chart[chart.length - 1]!.timestamp - chart[0]!.timestamp < 86400_000;
  const value =
    scope === "wallets"
      ? overview?.walletsUsd
      : scope === "exchanges"
        ? overview?.exchangesUsd
        : overview?.totalUsd;
  const sources = overview ? (
    <section data-jump={t("sources")} className="scroll-mt-20 space-y-3">
      <h2 className="text-lg font-semibold">{t("sources")}</h2>
      <div className="divide-y divide-border rounded-xl border border-border">
        {scope !== "exchanges" &&
          overview.walletSources.map((w) => (
            <div
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <Link
                  href={`/wallets/${w.id}`}
                  className="text-sm hover:text-primary"
                >
                  {w.label}
                </Link>
                <p>
                  <Updated value={w.updatedAt} />
                </p>
              </div>
              <div className="text-right">
                <Money value={w.valueUsd} />
                {Number(value) > 0 && (
                  <p className="text-xs text-text-muted">
                    {((Number(w.valueUsd) / Number(value)) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          ))}
        {scope !== "wallets" &&
          overview.accounts.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <Link
                  className="text-sm hover:text-primary"
                  href={`/exchanges/${a.connectionId}`}
                >
                  {a.label} · {t(`kinds.${a.kind}`)}
                </Link>
                <p>
                  <Updated value={a.balancesAt} />
                  {a.stale && (
                    <span className="ml-2 text-xs text-warning">
                      {t("stale")}
                    </span>
                  )}
                  {!a.included && (
                    <span className="ml-2 text-xs text-warning">
                      {t("migrationPending")}
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <Money value={a.equityUsd} />
                {a.included && a.equityUsd !== null && Number(value) > 0 && (
                  <p className="text-xs text-text-muted">
                    {((Number(a.equityUsd) / Number(value)) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          ))}
        {overview.connectionCount === 0 && scope !== "wallets" && !demo && (
          <Link href="/exchanges" className="block p-4 text-sm text-primary">
            {t("connectExchange")} →
          </Link>
        )}
      </div>
    </section>
  ) : null;
  const exchangeRows = useMemo(
    () =>
      overview
        ? exchangeBalanceRows(
            overview.accounts.filter((a) => a.included),
          ).filter((b) => Number(b.total) !== 0)
        : [],
    [overview],
  );
  // Priced coins of included accounts; unpriced ones are not part of totals.
  const exchangeHoldings: ExchangeHolding[] = useMemo(
    () =>
      overview
        ? exchangeRows
            .filter((b) => b.usdValue !== null)
            .map((b) => ({
              key: `${b.account.id}:${b.assetId}`,
              symbol: b.symbol,
              label: b.account.label,
              exchange: b.account.exchange,
              kind: b.account.kind,
              amount: Number(b.total),
              usdValue: Number(b.usdValue),
              priceUsd: b.priceUsd === null ? null : Number(b.priceUsd),
              note: b.showsEquity ? ("equity" as const) : undefined,
            }))
        : [],
    [overview, exchangeRows],
  );
  const unpricedRows = exchangeRows.filter((b) => b.usdValue === null);
  // "All": gainers and losers across wallets and exchanges; exchange-only coins take the 24h change
  // of the public exchange ticker.
  const unified = useMemo(
    () => mergeExchangeHoldings(walletTokens ?? [], exchangeHoldings),
    [walletTokens, exchangeHoldings],
  );
  const exchangeTokens = useMemo(
    () => mergeExchangeHoldings([], exchangeHoldings),
    [exchangeHoldings],
  );
  // Every exchange ticker: covers the exchange-only rows of "All" as well.
  const tickerChanges = useTickerChanges(exchangeTokens);
  const movers = useMemo(() => {
    const withChange = (rows: UnifiedToken[]) =>
      rows.map((tok) => ({
        ...tok,
        priceChange24h: tokenChange(tok, tickerChanges) ?? 0,
      }));
    return { all: withChange(unified), exchanges: withChange(exchangeTokens) };
  }, [unified, exchangeTokens, tickerChanges]);
  // Allocation donut and bars for the selected tab.
  const allocationTokens = useMemo(() => {
    const rows =
      scope === "wallets"
        ? (walletTokens ?? [])
        : scope === "exchanges"
          ? exchangeTokens
          : unified;
    return [...rows].sort((a, b) => b.totalUsd - a.totalUsd);
  }, [scope, walletTokens, exchangeTokens, unified]);
  const allocationBars = useMemo(() => {
    const byExchange = exchangeAllocation(exchangeHoldings, EXCHANGE_NAMES);
    if (scope === "wallets") return walletChains ?? [];
    if (scope === "exchanges") return byExchange;
    return combineAllocations(walletChains ?? [], byExchange);
  }, [scope, walletChains, exchangeHoldings]);
  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      <ExchangeErrorNotice code={error ?? data.error ?? chartData.error} />
      {!overview && !data.error && <Skeleton className="h-64 w-full" />}
      {overview && (
        <>
          <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 sm:flex-wrap sm:gap-3">
              <div
                className="flex gap-1"
                role="group"
                aria-label={t("sources")}
              >
                {(["all", "wallets", "exchanges"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={scope === s ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
                    aria-pressed={scope === s}
                    onClick={() => setScope(s)}
                  >
                    {t(s)}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"
                disabled={refreshing || demo}
                aria-label={refreshLabel}
                title={refreshLabel}
                onClick={refreshScope}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">{refreshLabel}</span>
              </Button>
            </div>
            <div className="mt-2.5 grid gap-2.5 sm:mt-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-end">
              <div className="min-w-0">
                <p className="text-xs text-text-muted sm:text-sm">{t("totalCapital")}</p>
                <p className="text-2xl font-semibold tracking-tight sm:mt-1 sm:text-3xl">
                  <Money value={value} />
                </p>
                <p className="text-[11px] text-text-muted sm:mt-1 sm:text-xs">
                  {t("counts", {
                    wallets: overview.walletCount,
                    exchanges: overview.exchangeCount,
                    accounts: overview.connectionCount,
                  })}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2.5 sm:grid-cols-4 sm:gap-3 sm:pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 [&>div]:min-w-0 [&_dd]:break-words [&_dd]:text-sm sm:[&_dd]:mt-1 sm:[&_dd]:text-base [&_dt]:truncate [&_dt]:text-[11px] sm:[&_dt]:whitespace-normal sm:[&_dt]:text-xs">
                <div>
                  <dt className="text-text-muted">
                    {t("walletCapital")}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    <Money value={overview.walletsUsd} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {t("exchangeCapital")}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    <Money value={overview.exchangesUsd} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {t("unrealizedPnl")}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    <Money value={overview.unrealizedPnlUsd} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">
                    {t("openPositions")}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    <Quantity value={String(overview.positionCount)} maximumFractionDigits={0} />
                  </dd>
                </div>
              </dl>
            </div>
            {!overview.complete && (
              <p className="mt-2 text-sm text-warning">{t("partialCapital")}</p>
            )}
            {overview.stale && (
              <p className="mt-2 text-sm text-warning">{t("staleCapital")}</p>
            )}
            {!overview.workerOnline && overview.connectionCount > 0 && (
              <div className="mt-3">
                <ExchangeErrorNotice code="WORKER_OFFLINE" />
              </div>
            )}
            <details
              className="mt-3 border-t border-border pt-2"
              open={historyOpen === "true"}
              onToggle={(e) => setHistoryOpen(String(e.currentTarget.open))}
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-medium sm:text-base">
                <span className="inline-flex items-center gap-2">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${historyOpen === "true" ? "" : "-rotate-90"}`}
                  />
                  {t("capitalHistory")}
                </span>
                {/* Period buttons sit on the toggle row; clicks must not fold it. */}
                <div className="flex gap-1">
                  {[1, 7, 30].map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      className="h-7 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                      variant={d === days ? "secondary" : "ghost"}
                      onClick={(e) => {
                        e.preventDefault();
                        setDays(d);
                      }}
                      aria-pressed={days === d}
                    >
                      {d}
                      {t("daysShort")}
                    </Button>
                  ))}
                </div>
              </summary>
              {chart.length > 0 ? (
                <div className="mt-2 h-36 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none min-w-0 overflow-hidden sm:h-44"
                  {...tooltip.handlers}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart}>
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(v) =>
                          shortHistory
                            ? new Date(v).toLocaleTimeString(locale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : new Date(v).toLocaleDateString(locale, {
                                day: "numeric",
                                month: "short",
                              })
                        }
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        minTickGap={45}
                      />
                      <YAxis
                        width={44}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat(locale, {
                            notation: "compact",
                          }).format(v)
                        }
                      />
                      <Tooltip
                        active={tooltip.active}
                        labelFormatter={(v) =>
                          new Date(Number(v)).toLocaleString(locale)
                        }
                        formatter={(v: number, name: string) => [
                          new Intl.NumberFormat(locale, {
                            style: "currency",
                            currency: "USD",
                          }).format(v),
                          name,
                        ]}
                        contentStyle={{
                          background: "var(--surface, #151c2c)",
                          border: "1px solid #334155",
                          borderRadius: 8,
                        }}
                      />
                      <Area
                        name={t(scope === "all" ? "totalCapital" : scope)}
                        type="monotone"
                        dataKey={scope === "all" ? "total" : scope}
                        stroke="#a78bfa"
                        fill="#a78bfa"
                        fillOpacity={0.12}
                        strokeWidth={2}
                        isAnimationActive={false}
                        connectNulls={false}
                        dot={(props: {
                          cx?: number;
                          cy?: number;
                          index?: number;
                        }) => {
                          const index = props.index ?? -1;
                          const isolated =
                            chart[index]?.total != null &&
                            chart[index - 1]?.total == null &&
                            chart[index + 1]?.total == null;
                          // Only an isolated observation needs a marker; do not hide a new account's first value.
                          return (
                            <circle
                              key={index}
                              cx={props.cx}
                              cy={props.cy}
                              r={isolated ? 3 : 0}
                              fill="#a78bfa"
                            />
                          );
                        }}
                        activeDot={{ r: 4 }}
                      />
                      {scope === "all" && (
                        <Area
                          name={t("wallets")}
                          type="monotone"
                          dataKey="wallets"
                          stroke="#60a5fa"
                          fill="transparent"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                      {scope === "all" && (
                        <Area
                          name={t("exchanges")}
                          type="monotone"
                          dataKey="exchanges"
                          stroke="#34d399"
                          fill="transparent"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                      {scope === "all" && (
                        <Legend
                          iconSize={10}
                          wrapperStyle={{ fontSize: 11, paddingTop: 2 }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-8 text-sm text-text-muted">
                  {t("historyEmpty")}
                </p>
              )}
              <p className="mt-1 hidden text-xs text-text-muted sm:block">
                {t("historyNote")}
              </p>
              {scope === "all" &&
                history?.changeUsd !== null &&
                history?.changeUsd !== undefined && (
                  <p className="mt-1 text-xs sm:mt-2 sm:text-sm">
                    {t("valueChange")}: <Money value={history.changeUsd} />
                  </p>
                )}
              {history && history.events.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-text-muted">
                    {t("sourceChanges")}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {history.events.map((e, i) => (
                      <li key={i}>
                        <Updated value={e.createdAt} /> · {e.label} ·{" "}
                        {t.has(`events.${e.kind}`)
                          ? t(`events.${e.kind}`)
                          : e.kind}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </details>
          </div>
          <section
            id="assets"
            data-jump={t("assets")}
            className="scroll-mt-20 space-y-3 sm:space-y-4"
          >
            {/* Phones go straight to the token card, which carries its own title. */}
            <h2 className="hidden text-lg font-semibold sm:block">{t("assets")}</h2>
            {scope === "all" && walletTokens && (
              <TokenTable
                tokens={walletTokens}
                spamTokens={spamTokens ?? []}
                exchangeHoldings={exchangeHoldings}
              />
            )}
            {scope === "all" && !walletTokens && (
              <>
                {walletAssets}
                <BalanceTable accounts={overview.accounts} />
              </>
            )}
            {scope === "wallets" && walletAssets}
            {scope === "exchanges" && (
              <>
                <TokenTable
                  tokens={[]}
                  spamTokens={[]}
                  exchangeHoldings={exchangeHoldings}
                  variant="exchanges"
                />
                {unpricedRows.length > 0 && (
                  <details className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                    <summary className="cursor-pointer text-text-muted">
                      {t("unpricedCoins", { count: unpricedRows.length })}
                    </summary>
                    <ul className="mt-2 divide-y divide-border">
                      {unpricedRows.map((b) => (
                        <li
                          key={`${b.account.id}:${b.assetId}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                        >
                          <span className="font-medium">{b.symbol}</span>
                          <span className="text-text-muted">
                            {b.account.label}
                          </span>
                          <span className="font-mono text-xs">
                            <Quantity value={b.total} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
          {scope === "wallets" && walletDetails}
          {scope !== "wallets" && sections.topMovers && (
            <div data-jump={tm("gainersTitle")} className="scroll-mt-20">
              <TopMovers
                key={scope}
                tokens={scope === "all" ? movers.all : movers.exchanges}
              />
            </div>
          )}
          {scope !== "wallets" && (
            <div data-jump={t("positions")} className="scroll-mt-20">
              <PositionsPage compact />
            </div>
          )}
          {/* Same layout on every tab: transactions on the left; charts and capital sources on the right. */}
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
            <div data-jump={tr("title")} className="min-w-0 scroll-mt-20">
              {scope === "all" ? (
                <RecentTransactions key="all" withExchanges />
              ) : scope === "exchanges" ? (
                <RecentTransactions key="exchanges" exchangesOnly />
              ) : (
                <RecentTransactions key="wallets" />
              )}
            </div>
            <div className="min-w-0 space-y-4">
              {sections.allocation && (
                <AllocationChart key={scope} tokens={allocationTokens} />
              )}
              {sections.networkAllocation && (
                <NetworkAllocationChart
                  chains={allocationBars}
                  title={
                    scope === "exchanges"
                      ? tn("exchangesTitle")
                      : scope === "all"
                        ? tn("combinedTitle")
                        : undefined
                  }
                />
              )}
              {sources}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
