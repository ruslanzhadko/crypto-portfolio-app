"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { CapitalOverview } from "@/lib/exchanges/portfolio";
import { useExchangeData, exchangeAction } from "./use-exchange-data";
import {
  ConnectionStatus,
  ExchangeErrorNotice,
  Money,
  Updated,
} from "./shared";
import { ConnectionForm } from "./connection-form";
import { BalanceTable } from "./balance-table";
import { PositionsPage } from "./positions-page";
import type { ConnectionDto } from "./exchanges-page";

type Detail = ConnectionDto & {
  runs: {
    id: string;
    status: string;
    errorCode: string | null;
    createdAt: string;
  }[];
};
export function ConnectionDetail({ id }: { id: string }) {
  const t = useTranslations("Exchanges");
  const detail = useExchangeData<{ connection: Detail }>(
    `/api/exchanges/${id}`,
  );
  const capital = useExchangeData<{ overview: CapitalOverview }>(
    "/api/portfolio/capital?view=overview",
  );
  const config = useExchangeData<{ workerIp: string | null }>(
    "/api/exchanges",
    60_000,
  );
  const [replacing, setReplacing] = useState(false),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [queued, setQueued] = useState(false);
  const c = detail.data?.connection;
  async function action(method: string, suffix = "", body?: unknown) {
    setBusy(true);
    setError(null);
    setQueued(false);
    try {
      await exchangeAction(`/api/exchanges/${id}${suffix}`, method, body);
      setConfirming(false);
      setQueued(suffix === "/sync");
      detail.refresh();
      capital.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }
  const accounts =
    capital.data?.overview.accounts.filter((a) => a.connectionId === id) ?? [];
  return (
    <div className="space-y-5">
      <Link href="/exchanges" className="text-sm text-primary">
        ← {t("title")}
      </Link>
      <ExchangeErrorNotice code={error ?? detail.error ?? capital.error} />
      {c && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{c.label}</h1>
              <p className="mt-1 capitalize text-text-muted">
                {c.exchange} {c.keyMask}
              </p>
            </div>
            <ConnectionStatus status={c.status} />
          </div>
          <ExchangeErrorNotice code={c.errorCode} />
          {c.status !== "DISCONNECTED" && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={
                  busy ||
                  ["PAUSED", "INVALID_KEY", "UNSUPPORTED"].includes(c.status)
                }
                onClick={() => void action("POST", "/sync")}
              >
                {t("refresh")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action("PATCH", "", { paused: c.status !== "PAUSED" })
                }
              >
                {t(c.status === "PAUSED" ? "resume" : "pause")}
              </Button>
              {c.exchange !== "hyperliquid" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReplacing((v) => !v)}
                >
                  {t("replaceKey")}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t("disconnect")}
              </Button>
            </div>
          )}
          {queued && (
            <p role="status" className="text-sm text-text-muted">
              {t("queued")}
            </p>
          )}
          {confirming && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm">{t("disconnectConfirm")}</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void action("DELETE")}
                >
                  {t("disconnect")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}
          {replacing && (
            <ConnectionForm
              connectionId={id}
              workerIp={config.data?.workerIp ?? null}
              onSaved={() => {
                setReplacing(false);
                detail.refresh();
                capital.refresh();
              }}
              onCancel={() => setReplacing(false)}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-4">
                <p className="text-sm text-text-muted">
                  {t(`kinds.${a.kind}`)} · {a.mode}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  <Money value={a.equityUsd} />
                </p>
                <p className="mt-2 text-sm">
                  {t("available")}: <Money value={a.availableUsd} />
                </p>
                <p className="text-sm">
                  {t("unrealizedPnl")}: <Money value={a.unrealizedPnlUsd} />
                </p>
                <Updated value={a.balancesAt} />
                <div className="mt-2">
                  <ExchangeErrorNotice code={a.errorCode} />
                </div>
              </div>
            ))}
          </div>
          <BalanceTable accounts={accounts} />
          <PositionsPage connectionId={id} />
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer font-medium">
              {t("syncHistory")}
            </summary>
            <ul className="mt-3 divide-y divide-border">
              {c.runs.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                >
                  <Updated value={run.createdAt} />
                  <span>
                    {run.status === "SUCCESS"
                      ? t("syncSuccess")
                      : run.errorCode && t.has(`errors.${run.errorCode}`)
                        ? t(`errors.${run.errorCode}`)
                        : t("statuses.PARTIAL")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
