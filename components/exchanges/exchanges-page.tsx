"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CapitalOverview } from "@/lib/exchanges/portfolio";
import { useExchangeData } from "./use-exchange-data";
import { ConnectionForm } from "./connection-form";
import {
  ConnectionStatus,
  ExchangeErrorNotice,
  Money,
  Updated,
} from "./shared";

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
    [adding, setAdding] = useState(false);
  const connections = useExchangeData<{
    connections: ConnectionDto[];
    workerIp: string | null;
  }>("/api/exchanges");
  const capital = useExchangeData<{ overview: CapitalOverview }>(
    "/api/portfolio/capital?view=overview",
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="mr-2 h-4 w-4" />
          {t("connectExchange")}
        </Button>
      </div>
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
      <div className="grid gap-4 lg:grid-cols-2">
        {connections.data?.connections.map((connection) => {
          const accounts =
            capital.data?.overview.accounts.filter(
              (a) => a.connectionId === connection.id,
            ) ?? [];
          return (
            <div
              key={connection.id}
              className="rounded-xl border border-border bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    className="flex items-center gap-2 font-semibold hover:text-primary"
                    href={`/exchanges/${connection.id}`}
                  >
                    <span className="truncate">{connection.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                  <p className="mt-1 text-sm capitalize text-text-muted">
                    {connection.exchange}{" "}
                    {connection.keyMask && (
                      <span className="ml-2 font-mono">
                        {connection.keyMask}
                      </span>
                    )}
                  </p>
                </div>
                <ConnectionStatus status={connection.status} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {accounts.map((a) => (
                  <div key={a.id}>
                    <p className="text-xs text-text-muted">
                      {t(`kinds.${a.kind}`)}
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                      <Money value={a.equityUsd} />
                    </p>
                    <Updated value={a.balancesAt} />
                    {a.stale && (
                      <p className="text-xs text-warning">{t("stale")}</p>
                    )}
                  </div>
                ))}
                {!accounts.length && (
                  <p className="text-sm text-text-muted">
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
      <p className="text-xs text-text-muted">
        {t("supported")} {t("hyperAuto")}
      </p>
    </div>
  );
}
