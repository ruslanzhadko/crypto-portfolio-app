"use client";
import { ExchangeTokenLogo } from "./token-logo";
import { useState, type SelectHTMLAttributes } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExchangeData } from "./use-exchange-data";
import { ExchangeErrorNotice, Money, Quantity, Updated } from "./shared";
import type { ConnectionDto } from "./exchanges-page";
import type { OpenPosition } from "@/lib/exchanges/types";

function PositionSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-2 pl-3 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-text-muted"
      />
    </div>
  );
}

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
              <PositionSelect
                aria-label={t("exchange")}
                value={exchange}
                onChange={(e) => filter(setExchange, e.target.value)}
              >
                <option value="">{t("allExchanges")}</option>
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
                <option value="hyperliquid">Hyperliquid</option>
              </PositionSelect>
              <PositionSelect
                aria-label={t("account")}
                value={account}
                disabled={!!connectionId}
                onChange={(e) => filter(setAccount, e.target.value)}
              >
                <option value="">{t("allAccounts")}</option>
                {options.data?.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </PositionSelect>
            </>
          )}
          <Input
            aria-label={t("coin")}
            value={coin}
            onChange={(e) => filter(setCoin, e.target.value)}
            placeholder={t("coin")}
            maxLength={40}
          />
          <PositionSelect
            aria-label={t("side")}
            value={side}
            onChange={(e) => filter(setSide, e.target.value)}
          >
            <option value="">{t("bothSides")}</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </PositionSelect>
          <PositionSelect
            aria-label={t("sort")}
            value={sort}
            onChange={(e) => filter(setSort, e.target.value)}
          >
            <option value="size">{t("sortSize")}</option>
            <option value="pnl">{t("sortPnl")}</option>
            <option value="symbol">{t("coin")}</option>
          </PositionSelect>
        </div>
      )}
      <ExchangeErrorNotice code={result.error} />
      {result.data &&
        result.data.connectionCount > 0 &&
        !result.data.workerOnline && (
          <ExchangeErrorNotice code="WORKER_OFFLINE" />
        )}
      {result.data?.incomplete && (
        <p
          role="status"
          className="flex items-start gap-2 text-xs leading-relaxed text-text-muted"
        >
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("positionsIncomplete")}
        </p>
      )}
      {!result.data && !result.error && <Skeleton className="h-40 w-full" />}
      {result.data?.positions.length === 0 && (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-text-muted">
          {t("noPositions")}
        </p>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {result.data?.positions.map((p) => (
          <details
            key={`${p.connection.id}:${p.positionKey}`}
            className="group"
            open={expanded[`${p.connection.id}:${p.positionKey}`] ?? false}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              const key = `${p.connection.id}:${p.positionKey}`;
              setExpanded((previous) =>
                previous[key] === open
                  ? previous
                  : { ...previous, [key]: open },
              );
            }}
          >
            <summary className="grid cursor-pointer list-none grid-cols-2 items-center gap-3 p-4 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:grid-cols-[minmax(8rem,1fr)_minmax(7rem,1fr)_1fr_1fr_1fr]">
              <div>
                <p className="flex items-center gap-3 font-semibold">
                  <ExchangeTokenLogo symbol={p.base} />
                  {p.symbol}
                </p>
                <span
                  className={`text-sm font-medium ${p.side === "long" ? "text-success" : "text-danger"}`}
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
                  <Quantity value={p.baseSize} maximumFractionDigits={4} />{" "}
                  {p.base}
                </p>
                <p className="text-xs text-text-muted">
                  <Money value={p.notionalUsd} />
                </p>
              </div>
              <div className="hidden md:block">
                <p className="text-xs text-text-muted">{t("entryMark")}</p>
                <p className="text-sm">
                  <Quantity value={p.entryPrice} maximumFractionDigits={4} /> /{" "}
                  <Quantity value={p.markPrice} maximumFractionDigits={4} />
                </p>
                <p className="text-xs text-text-muted">{p.settle}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted">{t("unrealizedPnl")}</p>
                <p
                  className={`text-xl font-semibold ${Number(p.unrealizedPnlUsd ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                >
                  <Money value={p.unrealizedPnlUsd} />
                </p>
                {p.stale && (
                  <p className="text-xs text-warning">{t("stale")}</p>
                )}
              </div>
            </summary>
            <div className="border-t border-border bg-background/40 p-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[15px] lg:grid-cols-4 [&_dd]:mt-1 [&_dd]:font-medium [&_dd]:tabular-nums [&_dd>span]:text-inherit [&_dt]:text-sm">
                <div>
                  <dt className="text-text-muted">{t("entryMark")}</dt>
                  <dd>
                    <Quantity value={p.entryPrice} maximumFractionDigits={4} />{" "}
                    / <Quantity value={p.markPrice} maximumFractionDigits={4} />{" "}
                    {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("liquidation")}</dt>
                  <dd>
                    <Quantity
                      value={p.liquidationPrice}
                      maximumFractionDigits={4}
                    />{" "}
                    {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("leverage")}</dt>
                  <dd>
                    <Quantity value={p.leverage} maximumFractionDigits={4} />
                    {p.leverage ? "×" : ""} · {p.marginMode ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("margin")}</dt>
                  <dd>
                    <Quantity value={p.margin} maximumFractionDigits={4} />{" "}
                    {p.settle}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("unrealizedPnl")}</dt>
                  <dd>
                    <Quantity
                      value={p.unrealizedPnl}
                      maximumFractionDigits={4}
                    />{" "}
                    {p.settle}
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
                <div>
                  <dt className="text-text-muted">{t("updated")}</dt>
                  <dd>
                    <Updated value={p.updatedAt} />
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
