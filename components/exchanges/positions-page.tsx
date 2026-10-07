"use client";
import { ExchangeTokenLogo } from "./token-logo";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExchangeData } from "./use-exchange-data";
import { ExchangeErrorNotice, Money, Quantity, Updated } from "./shared";
import type { ConnectionDto } from "./exchanges-page";
import type { OpenPosition } from "@/lib/exchanges/types";

export interface PositionDto extends OpenPosition {
  id: string;
  updatedAt: string;
  stale: boolean;
  errorCode: string | null;
  connection: { id: string; label: string; exchange: string; status: string };
}
export function PositionsPage({
  connectionId,
  compact = false,
}: {
  connectionId?: string;
  compact?: boolean;
}) {
  const t = useTranslations("Exchanges");
  const [exchange, setExchange] = useState(""),
    [account, setAccount] = useState(connectionId ?? ""),
    [coin, setCoin] = useState("");
  const [side, setSide] = useState(""),
    [sort, setSort] = useState("size"),
    [page, setPage] = useState(1);
  const qs = new URLSearchParams({
    page: String(page),
    limit: compact ? "5" : "25",
    sort,
  });
  if (exchange) qs.set("exchange", exchange);
  if (account) qs.set("connectionId", account);
  if (coin) qs.set("coin", coin);
  if (side) qs.set("side", side);
  const result = useExchangeData<{
    positions: PositionDto[];
    total: number;
    limit: number;
    workerOnline: boolean;
    connectionCount: number;
    incomplete: boolean;
  }>(`/api/positions?${qs}`);
  const options = useExchangeData<{ connections: ConnectionDto[] }>(
    "/api/exchanges",
    60_000,
  );
  function filter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }
  const selectClass =
    "h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm";
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        {compact || connectionId ? (
          <h2 className="text-lg font-semibold">{t("positions")}</h2>
        ) : (
          <div>
            <h1 className="text-2xl font-bold">{t("positions")}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {t("positionsSubtitle")}
            </p>
          </div>
        )}
        {compact && (
          <Link href="/positions" className="text-sm text-primary">
            {t("viewAll")}
          </Link>
        )}
      </div>
      {!compact && (
        <div
          className={`grid gap-2 sm:grid-cols-2 ${connectionId ? "lg:grid-cols-3" : "lg:grid-cols-5"}`}
        >
          {!connectionId && (
            <>
              <select
                aria-label={t("exchange")}
                value={exchange}
                onChange={(e) => filter(setExchange, e.target.value)}
                className={selectClass}
              >
                <option value="">{t("allExchanges")}</option>
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
                <option value="hyperliquid">Hyperliquid</option>
              </select>
              <select
                aria-label={t("account")}
                value={account}
                disabled={!!connectionId}
                onChange={(e) => filter(setAccount, e.target.value)}
                className={selectClass}
              >
                <option value="">{t("allAccounts")}</option>
                {options.data?.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <Input
            aria-label={t("coin")}
            value={coin}
            onChange={(e) => filter(setCoin, e.target.value)}
            placeholder={t("coin")}
            maxLength={40}
          />
          <select
            aria-label={t("side")}
            value={side}
            onChange={(e) => filter(setSide, e.target.value)}
            className={selectClass}
          >
            <option value="">{t("bothSides")}</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          <select
            aria-label={t("sort")}
            value={sort}
            onChange={(e) => filter(setSort, e.target.value)}
            className={selectClass}
          >
            <option value="size">{t("sortSize")}</option>
            <option value="pnl">{t("sortPnl")}</option>
            <option value="symbol">{t("coin")}</option>
          </select>
        </div>
      )}
      <ExchangeErrorNotice code={result.error} />
      {result.data &&
        result.data.connectionCount > 0 &&
        !result.data.workerOnline && (
          <ExchangeErrorNotice code="WORKER_OFFLINE" />
        )}
      {result.data?.incomplete && (
        <p className="text-sm text-warning">{t("positionsIncomplete")}</p>
      )}
      {!result.data && !result.error && <Skeleton className="h-40 w-full" />}
      {result.data?.positions.length === 0 && (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-text-muted">
          {t("noPositions")}
        </p>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {result.data?.positions.map((p) => (
          <details key={p.id} className="group">
            <summary className="grid cursor-pointer list-none grid-cols-2 items-center gap-3 p-4 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:grid-cols-[minmax(8rem,1fr)_minmax(7rem,1fr)_1fr_1fr_1fr]">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <ExchangeTokenLogo symbol={p.base} />
                  {p.symbol}
                </p>
                <span
                  className={`text-xs ${p.side === "long" ? "text-success" : "text-danger"}`}
                >
                  {p.side === "long" ? "Long" : "Short"}
                </span>
                <span className="ml-2 text-xs text-text-muted">
                  {t("details")}
                </span>
              </div>
              <div className="text-right md:text-left">
                <p className="truncate text-sm">{p.connection.label}</p>
                <p className="text-xs capitalize text-text-muted">
                  {p.connection.exchange}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">{t("size")}</p>
                <p className="text-sm">
                  <Quantity value={p.baseSize} /> {p.base}
                </p>
                <p className="text-xs text-text-muted">
                  <Money value={p.notionalUsd} />
                </p>
              </div>
              <div className="hidden md:block">
                <p className="text-xs text-text-muted">{t("entryMark")}</p>
                <p className="text-sm">
                  <Quantity value={p.entryPrice} /> /{" "}
                  <Quantity value={p.markPrice} />
                </p>
                <p className="text-xs text-text-muted">{p.settle}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted">{t("unrealizedPnl")}</p>
                <p
                  className={`font-medium ${Number(p.unrealizedPnlUsd ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                >
                  <Money value={p.unrealizedPnlUsd} />
                </p>
                {p.stale && (
                  <p className="text-xs text-warning">{t("stale")}</p>
                )}
              </div>
            </summary>
            <div className="border-t border-border bg-background/40 p-4">
              <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                <div>
                  <dt className="text-text-muted">{t("entryMark")}</dt>
                  <dd>
                    <Quantity value={p.entryPrice} /> /{" "}
                    <Quantity value={p.markPrice} /> {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("liquidation")}</dt>
                  <dd>
                    <Quantity value={p.liquidationPrice} /> {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("leverage")}</dt>
                  <dd>
                    <Quantity value={p.leverage} />
                    {p.leverage ? "×" : ""} · {p.marginMode ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("margin")}</dt>
                  <dd>
                    <Quantity value={p.margin} /> {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("unrealizedPnl")}</dt>
                  <dd>
                    <Quantity value={p.unrealizedPnl} /> {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("returnOnMargin")}</dt>
                  <dd>
                    {p.margin &&
                    Number(p.margin) > 0 &&
                    p.unrealizedPnl !== null
                      ? `${((Number(p.unrealizedPnl) / Number(p.margin)) * 100).toFixed(2)}%`
                      : "—"}
                  </dd>
                  <p className="text-xs text-text-muted">
                    {t("returnFormula")}
                  </p>
                </div>
                <div>
                  <dt className="text-text-muted">{t("updated")}</dt>
                  <dd>
                    <Updated value={p.updatedAt} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("account")}</dt>
                  <dd>
                    <Link
                      className="text-primary"
                      href={`/exchanges/${p.connection.id}`}
                    >
                      {p.connection.label}
                    </Link>
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <ExchangeErrorNotice code={p.errorCode} />
              </div>
            </div>
          </details>
        ))}
      </div>
      {!compact && result.data && result.data.total > result.data.limit && (
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-sm">
            {page} / {Math.ceil(result.data.total / result.data.limit)}
          </span>
          <Button
            variant="outline"
            disabled={page * result.data.limit >= result.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </section>
  );
}
