"use client";
import { useState } from "react";
import { ExchangeLogo, exchangeName } from "./exchange-logo";
import { useLocale, useTranslations } from "next-intl";
import { Plus, ArrowRight } from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CapitalOverview } from "@/lib/exchanges/portfolio";
import { useExchangeData } from "./use-exchange-data";
import { ConnectionForm } from "./connection-form";
import { ConnectionStatus, ExchangeErrorNotice, Money } from "./shared";

/** Time only for today, otherwise a short date: the full timestamp is in the tooltip. */
function shortTime(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  const today = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    today
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short" },
  ).format(date);
}

export interface ConnectionDto {
  id: string;
  exchange: string;
  label: string;
  status: string;
  errorCode: string | null;
  keyMask: string | null;
  balancesAt: string | null;
  positionsAt: string | null;
  lastSuccessAt: string | null;
  walletId: string | null;
}
export function ExchangesPage() {
  const t = useTranslations("Exchanges"),
    locale = useLocale(),
    [adding, setAdding] = useState(false);
  const connections = useExchangeData<{
    connections: ConnectionDto[];
    workerIp: string | null;
  }>("/api/exchanges");
  const capital = useExchangeData<{ overview: CapitalOverview }>(
    "/api/portfolio/capital?view=overview",
  );
  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-5">
      <PageTitle
        title={t("title")}
        info={t("subtitle")}
        details={`${t("supported")} ${t("hyperAuto")}`}
      >
        <Button
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs sm:h-9 sm:text-sm"
          onClick={() => setAdding(true)}
          disabled={adding}
          aria-label={t("connectExchange")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="sm:hidden">{t("connectShort")}</span>
          <span className="hidden sm:inline">{t("connectExchange")}</span>
        </Button>
      </PageTitle>
      <ExchangeErrorNotice code={connections.error ?? capital.error} />
      {capital.data && !capital.data.overview.workerOnline && (
        <ExchangeErrorNotice code="WORKER_OFFLINE" />
      )}
      {adding && (
        <ConnectionForm
          workerIp={connections.data?.workerIp ?? null}
          onSaved={() => {
            setAdding(false);
            connections.refresh();
            capital.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {!connections.data && !connections.error && (
        <Skeleton className="h-48 w-full" />
      )}
      {connections.data?.connections.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <h2 className="font-semibold">{t("emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-text-muted">
            {t("emptyDescription")}
          </p>
        </div>
      )}
      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2 lg:gap-4">
        {connections.data?.connections.map((connection) => {
          const accounts =
            capital.data?.overview.accounts.filter(
              (a) => a.connectionId === connection.id,
            ) ?? [];
          return (
            <div
              key={connection.id}
              className="rounded-xl border border-border bg-surface p-3 sm:p-4 lg:p-5"
            >
              <div className="flex items-center gap-2 lg:gap-3">
                <ExchangeLogo
                  exchange={connection.exchange}
                  size={28}
                  className="lg:!h-9 lg:!w-9"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary lg:text-lg"
                    href={`/exchanges/${connection.id}`}
                  >
                    <span className="truncate">{connection.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
                  </Link>
                  <p className="truncate text-[11px] text-text-muted lg:mt-0.5 lg:text-sm">
                    {exchangeName(connection.exchange)}
                    {connection.keyMask && (
                      <span className="ml-1.5 font-mono">
                        {connection.keyMask}
                      </span>
                    )}
                  </p>
                </div>
                <ConnectionStatus
                  status={connection.status}
                  errorCode={connection.errorCode}
                />
              </div>
              {/* One line per account: kind and freshness on the left, equity on the right. */}
              <div className="mt-2 divide-y divide-border/60 lg:mt-3">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-baseline justify-between gap-3 py-1.5 last:pb-0 lg:py-2.5"
                  >
                    <p className="min-w-0 truncate text-xs text-text-muted lg:text-sm">
                      {t(`kinds.${a.kind}`)}
                      <span
                        className={a.stale ? "text-warning" : undefined}
                        title={
                          a.balancesAt
                            ? new Date(a.balancesAt).toLocaleString(locale)
                            : t("neverUpdated")
                        }
                        suppressHydrationWarning
                      >
                        {" · "}
                        {a.stale ? t("stale") : shortTime(a.balancesAt, locale)}
                      </span>
                    </p>
                    <p className="shrink-0 text-base font-semibold tabular-nums sm:text-lg lg:text-2xl">
                      <Money value={a.equityUsd} />
                    </p>
                  </div>
                ))}
                {!accounts.length && (
                  <p className="py-1.5 text-xs text-text-muted">
                    {t("waitingForWorker")}
                  </p>
                )}
              </div>
              {connection.errorCode && (
                <div className="mt-3">
                  <ExchangeErrorNotice code={connection.errorCode} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
