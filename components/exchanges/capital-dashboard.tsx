"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
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
import { Money, Updated, ExchangeErrorNotice } from "./shared";
import { BalanceTable } from "./balance-table";
import { PositionsPage } from "./positions-page";
import { capitalChartData } from "./capital-chart-data";
import { useDisplayPreference, warningPreference } from "./display-preferences";

export function CapitalDashboard({
  walletAssets,
}: {
  walletAssets: React.ReactNode;
}) {
  const t = useTranslations("Exchanges"),
    locale = useLocale();
  const [scope, setScope] = useState<"all" | "wallets" | "exchanges">("all"),
    [days, setDays] = useState(30),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useDisplayPreference(
    "exchange-capital-history-open",
    "true",
  );
  const [hideWarnings] = useDisplayPreference(warningPreference, "false");
  const data = useExchangeData<{ overview: CapitalOverview }>(
    "/api/portfolio/capital?view=overview",
  );
  const chartData = useExchangeData<{
    history: Awaited<ReturnType<typeof getCapitalHistory>>;
  }>(`/api/portfolio/capital?view=history&days=${days}`, 60_000);
  const overview = data.data?.overview,
    history = chartData.data?.history;
  async function refresh() {
    setBusy(true);
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
    setBusy(false);
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
  return (
    <div className="min-w-0 space-y-5">
      <ExchangeErrorNotice code={error ?? data.error ?? chartData.error} />
      {!overview && !data.error && <Skeleton className="h-64 w-full" />}
      {overview && (
        <>
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                disabled={busy}
                onClick={() => void refresh()}
              >
                {t(busy ? "saving" : "refreshExchanges")}
              </Button>
            </div>
            <p className="mt-5 text-sm text-text-muted">{t("totalCapital")}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              <Money value={value} />
            </p>
            {!overview.complete && hideWarnings !== "true" && (
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
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-text-muted">
                  {t("walletCapital")}
                </dt>
                <dd className="mt-1 font-medium">
                  <Money value={overview.walletsUsd} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">
                  {t("exchangeCapital")}
                </dt>
                <dd className="mt-1 font-medium">
                  <Money value={overview.exchangesUsd} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">
                  {t("unrealizedPnl")}
                </dt>
                <dd className="mt-1 font-medium">
                  <Money value={overview.unrealizedPnlUsd} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">
                  {t("openPositions")}
                </dt>
                <dd className="mt-1 font-medium">{overview.positionCount}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-text-muted">
              {t("counts", {
                wallets: overview.walletCount,
                exchanges: overview.exchangeCount,
                accounts: overview.connectionCount,
              })}
            </p>
            <details
              className="mt-5"
              open={historyOpen === "true"}
              onToggle={(e) => setHistoryOpen(String(e.currentTarget.open))}
            >
              <summary className="inline-flex cursor-pointer items-center gap-2 font-medium">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${historyOpen === "true" ? "" : "-rotate-90"}`}
                />
                {t("capitalHistory")}
              </summary>
              <div className="mt-2 flex justify-end">
                <div className="flex gap-1">
                  {[1, 7, 30].map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={d === days ? "secondary" : "ghost"}
                      onClick={() => setDays(d)}
                      aria-pressed={days === d}
                    >
                      {d}
                      {t("daysShort")}
                    </Button>
                  ))}
                </div>
              </div>
              {chart.length > 0 ? (
                <div className="mt-4 h-60 min-w-0">
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
                        width={60}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat(locale, {
                            notation: "compact",
                          }).format(v)
                        }
                      />
                      <Tooltip
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
                        type="linear"
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
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-8 text-sm text-text-muted">
                  {t("historyEmpty")}
                </p>
              )}
              <p className="text-xs text-text-muted">{t("historyNote")}</p>
              {scope === "all" &&
                history?.changeUsd !== null &&
                history?.changeUsd !== undefined && (
                  <p className="mt-2 text-sm">
                    {t("valueChange")}: <Money value={history.changeUsd} />
                  </p>
                )}
              {history && history.events.length > 0 && (
                <details className="mt-3 text-sm">
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
            <Link
              className="mt-3 inline-block text-xs text-primary"
              href="/dashboard/history"
            >
              {t("legacyHistory")}
            </Link>
          </div>
          <section className="space-y-3">
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
                          {((Number(w.valueUsd) / Number(value)) * 100).toFixed(
                            1,
                          )}
                          %
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
                      {a.included &&
                        a.equityUsd !== null &&
                        Number(value) > 0 && (
                          <p className="text-xs text-text-muted">
                            {(
                              (Number(a.equityUsd) / Number(value)) *
                              100
                            ).toFixed(1)}
                            %
                          </p>
                        )}
                    </div>
                  </div>
                ))}
              {overview.connectionCount === 0 && scope !== "wallets" && (
                <Link
                  href="/exchanges"
                  className="block p-4 text-sm text-primary"
                >
                  {t("connectExchange")} →
                </Link>
              )}
            </div>
          </section>
          <section id="assets" className="scroll-mt-6 space-y-5">
            <h2 className="text-lg font-semibold">{t("assets")}</h2>
            {scope !== "exchanges" && walletAssets}
            {scope !== "wallets" && (
              <BalanceTable accounts={overview.accounts} />
            )}
          </section>
          {scope !== "wallets" && <PositionsPage compact />}
        </>
      )}
    </div>
  );
}
