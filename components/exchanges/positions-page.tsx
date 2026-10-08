"use client";
import { ExchangeTokenLogo } from "./token-logo";
import { useEffect, useState, type SelectHTMLAttributes } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExchangeData } from "./use-exchange-data";
import { ExchangeErrorNotice, Money, Quantity } from "./shared";
import type { ConnectionDto } from "./exchanges-page";
import type { OpenPosition } from "@/lib/exchanges/types";

function realizedWithFunding(p: PositionDto): string | null {
  return p.funding?.status === "complete" &&
    p.funding.amount != null &&
    p.funding.realizedPnl != null &&
    p.funding.tradingFees != null
    ? String(
        Number(p.funding.realizedPnl) +
          Number(p.funding.amount) -
          Number(p.funding.tradingFees),
      )
    : null;
}

function PnlBreakdown({ p }: { p: PositionDto }) {
  const t = useTranslations("Exchanges");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && open) event.preventDefault();
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpen(true);
          }}
          className="mt-1 block min-h-6 text-xs font-normal text-text-muted underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-primary"
        >
          {t("pnlBreakdown")}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={mobile ? "bottom" : "right"}
        align="start"
        sideOffset={12}
        collisionPadding={16}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        className="w-72 max-w-[calc(100vw-2rem)] space-y-1 rounded-lg bg-surface p-3 text-sm"
        aria-label={t("pnlBreakdown")}
      >
        <p>
          {t("closedPnl")}:{" "}
          <Quantity
            value={p.funding?.realizedPnl ?? null}
            maximumFractionDigits={4}
          />{" "}
          {p.settle}
        </p>
        <p>
          Funding:{" "}
          <Quantity
            value={p.funding?.status === "complete" ? p.funding.amount : null}
            maximumFractionDigits={4}
          />{" "}
          {p.settle}
        </p>
        <p>
          {t("tradingFees")}:{" "}
          <Quantity
            value={p.funding?.tradingFees ?? null}
            maximumFractionDigits={4}
          />{" "}
          {p.settle}
        </p>
        <p className="border-t border-border pt-1 font-medium">
          {t("netRealizedPnl")}:{" "}
          <Quantity value={realizedWithFunding(p)} maximumFractionDigits={4} />{" "}
          {p.settle}
        </p>
        {p.funding?.tradingFees == null && (
          <p className="text-xs text-text-muted">{t("feesUnavailable")}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function marginReturn(p: PositionDto) {
  return p.margin && Number(p.margin) > 0 && p.unrealizedPnl != null
    ? `${((Number(p.unrealizedPnl) / Number(p.margin)) * 100).toFixed(2)}%`
    : "—";
}
function NextFunding({ p }: { p: PositionDto }) {
  const t = useTranslations("Exchanges"),
    locale = useLocale();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);
  const time = p.funding?.nextTime;
  const upcoming = time != null && time > now && now > 0;
  const minutes = upcoming ? Math.ceil((time! - now) / 60_000) : 0;
  return (
    <>
      <dd title={t("nextFundingDescription")}>
        {upcoming && p.funding?.nextRate != null
          ? `${(Number(p.funding.nextRate) * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`
          : "—"}
      </dd>
      <p className="mt-1 min-h-6 text-xs text-text-muted">
        {upcoming ? (
          <>
            {new Intl.DateTimeFormat(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(time!)}{" "}
            ·{" "}
            {t("fundingIn", {
              hours: Math.floor(minutes / 60),
              minutes: minutes % 60,
            })}
          </>
        ) : (
          t("fundingTimePending")
        )}
      </p>
    </>
  );
}

function PositionUpdated({ value }: { value: string }) {
  const locale = useLocale();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const timestamp = Date.parse(value);
  if (!now || !Number.isFinite(timestamp)) return <span>—</span>;
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const unit = seconds < 60 ? "second" : seconds < 3600 ? "minute" : "hour";
  const amount =
    unit === "second"
      ? seconds
      : Math.floor(seconds / (unit === "minute" ? 60 : 3600));
  return (
    <span>
      {new Intl.RelativeTimeFormat(locale, {
        numeric: "always",
        style: "short",
      }).format(-amount, unit)}
    </span>
  );
}

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
            <summary className="grid cursor-pointer list-none grid-cols-2 items-center gap-x-6 gap-y-4 [&>div>p+p]:mt-1.5 px-4 py-5 sm:px-6 lg:pr-8 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:grid-cols-6 [&>div]:min-w-0">
              <div>
                <p className="flex items-center gap-3 font-semibold">
                  <ExchangeTokenLogo symbol={p.base} />
                  {p.symbol}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`text-sm font-medium ${p.side === "long" ? "text-success" : "text-danger"}`}
                  >
                    {p.side === "long" ? "Long" : "Short"}
                  </span>
                  <span
                    className="text-sm text-text-muted"
                    title={t("leverage")}
                  >
                    <Quantity value={p.leverage} maximumFractionDigits={4} />
                    {p.leverage ? "×" : ""} · {p.marginMode ?? "—"}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-text-muted">{t("size")}</p>
                <p className="text-[15px] font-medium tabular-nums">
                  <Quantity value={p.baseSize} maximumFractionDigits={4} />{" "}
                  {p.base}
                </p>
                <p className="text-xs text-text-muted">
                  <Money value={p.notionalUsd} />
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">{t("entryMark")}</p>
                <p className="text-[15px] font-medium tabular-nums">
                  <Quantity value={p.entryPrice} maximumFractionDigits={4} /> /{" "}
                  <Quantity value={p.markPrice} maximumFractionDigits={4} />
                </p>
                <p className="text-xs text-text-muted">{p.settle}</p>
              </div>
              <div className="text-right lg:text-left">
                <p className="text-xs text-text-muted">{t("funding")}</p>
                <p
                  className={`text-[15px] font-medium tabular-nums ${p.funding?.amount == null ? "text-text-muted" : Number(p.funding.amount) >= 0 ? "text-success" : "text-danger"}`}
                  title={
                    p.funding?.status === "complete"
                      ? undefined
                      : t(
                          !p.funding || p.funding.status === "pending"
                            ? "fundingPending"
                            : "fundingUnavailable",
                        )
                  }
                >
                  {p.funding?.status === "complete" ? (
                    <>
                      {Number(p.funding.amount) > 0 ? "+" : ""}
                      <Quantity
                        value={p.funding.amount}
                        maximumFractionDigits={4}
                      />{" "}
                      {p.settle}
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-[15px] font-medium break-words">
                  {p.connection.label}
                </p>
                <p className="text-xs text-text-muted">
                  {(
                    {
                      binance: "Binance",
                      bybit: "Bybit",
                      hyperliquid: "Hyperliquid",
                    } as Record<string, string>
                  )[p.connection.exchange] ?? p.connection.exchange}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted">{t("unrealizedPnl")}</p>
                <p
                  className={`text-xl font-semibold ${Number(p.unrealizedPnlUsd ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                >
                  <Money value={p.unrealizedPnlUsd} />
                </p>
                <p
                  className="text-xs text-text-muted"
                  title={t("returnOnMargin") + ": " + t("returnFormula")}
                >
                  {marginReturn(p)}
                </p>
                {p.stale && (
                  <p className="text-xs text-warning">{t("stale")}</p>
                )}
              </div>
            </summary>
            <div className="border-t border-border bg-background/40 px-4 py-5 sm:px-6 lg:pr-8">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[15px] lg:grid-cols-6 [&>div]:min-w-0 [&_dd]:mt-2 [&_dd]:font-medium [&_dd]:tabular-nums [&_dd>span]:text-inherit [&_dt]:text-xs">
                <div>
                  <dt
                    className="text-text-muted"
                    title={t("breakEvenDescription")}
                  >
                    {t("breakEven")}
                  </dt>
                  <dd>
                    <Quantity
                      value={p.funding?.breakEvenPrice ?? null}
                      maximumFractionDigits={4}
                    />{" "}
                    {p.settle}
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
                  <dt
                    className="text-text-muted"
                    title={t("realizedPnlDescription")}
                  >
                    {t("realizedPnl")}
                  </dt>
                  <dd>
                    <Quantity
                      value={realizedWithFunding(p)}
                      maximumFractionDigits={4}
                    />{" "}
                    {p.settle}
                    <PnlBreakdown p={p} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t("updated")}</dt>
                  <dd>
                    <PositionUpdated value={p.updatedAt} />
                  </dd>
                </div>
                <div className="lg:col-start-6 lg:text-right">
                  <dt className="text-text-muted">{t("nextFunding")}</dt>
                  <NextFunding p={p} />
                </div>
              </dl>

              {p.errorCode && (
                <div className="mt-3">
                  <ExchangeErrorNotice code={p.errorCode} />
                </div>
              )}
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
