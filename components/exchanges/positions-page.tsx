"use client";
import { ExchangeTokenLogo } from "./token-logo";
import { ExchangeLogo, exchangeName } from "./exchange-logo";
import { useEffect, useState, type SelectHTMLAttributes } from "react";
import { ChevronDown, Info, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExchangeData } from "./use-exchange-data";
import { ExchangeErrorNotice, Money, Quantity } from "./shared";
import type { ConnectionDto } from "./exchanges-page";
import type { OpenPosition } from "@/lib/exchanges/types";
import { displaySymbol } from "@/lib/exchanges/display-symbol";

// Position details: three tight columns on phones (the third right-aligned), six roomy ones from lg.
const DETAILS_GRID =
  "grid grid-cols-3 gap-x-3 gap-y-3 text-[13px] [&>div]:min-w-0 [&>div:nth-child(3n)]:text-right [&_dd]:mt-0.5 [&_dd]:font-medium [&_dd]:tabular-nums [&_dd>span]:text-inherit [&_dt]:text-[11px] [&_dt]:leading-tight lg:grid-cols-6 lg:gap-x-6 lg:gap-y-3 lg:text-sm lg:[&>div:nth-child(3n):not(:last-child)]:text-left lg:[&_dd]:mt-1 lg:[&_dt]:text-xs lg:[&_dt]:leading-normal";

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

function liquidationDistance(p: PositionDto): number | null {
  const mark = Number(p.markPrice),
    liquidation = Number(p.liquidationPrice);
  if (
    !Number.isFinite(mark) ||
    !Number.isFinite(liquidation) ||
    mark <= 0 ||
    liquidation <= 0
  )
    return null;
  return Math.max(
    0,
    (p.side === "short" ? liquidation - mark : mark - liquidation) / mark,
  );
}

function marginReturn(p: PositionDto) {
  return p.margin && Number(p.margin) > 0 && p.unrealizedPnl != null
    ? `${Number(p.unrealizedPnl) > 0 ? "+" : ""}${((Number(p.unrealizedPnl) / Number(p.margin)) * 100).toFixed(2)}%`
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
      <p className="mt-0.5 text-[11px] text-text-muted lg:text-xs">
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

function PositionSelect({
  lead = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { lead?: boolean }) {
  return (
    // On wider screens the coin search sits after the exchange and account filters (`lead`).
    <div className={`relative min-w-0 ${lead ? "sm:order-1" : "sm:order-3"}`}>
      <select
        {...props}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-surface-2 pl-3 pr-8 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-10 sm:pr-10 sm:text-sm"
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-text-muted sm:right-3 sm:top-3"
      />
    </div>
  );
}

// Positions on one coin across accounts are shown together; the server order of first appearance is kept.
function groupByBase(
  positions: PositionDto[],
): [PositionDto, ...PositionDto[]][] {
  const groups = new Map<string, [PositionDto, ...PositionDto[]]>();
  for (const p of positions) {
    const group = groups.get(p.base);
    if (group) group.push(p);
    else groups.set(p.base, [p]);
  }
  return [...groups.values()];
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
  const locale = useLocale();
  const [exchange, setExchange] = useState(""),
    [account, setAccount] = useState(connectionId ?? ""),
    [coin, setCoin] = useState("");
  const [side, setSide] = useState(""),
    [pnlResult, setPnlResult] = useState(""),
    [sort, setSort] = useState("size"),
    [page, setPage] = useState(1);
  const [searchCoin, setSearchCoin] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchCoin(coin.trim()), 250);
    return () => clearTimeout(timer);
  }, [coin]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [
    exchange,
    connectionId ? "" : account,
    side,
    pnlResult,
    sort === "size" ? "" : sort,
  ].filter(Boolean).length;
  const qs = new URLSearchParams({
    page: String(page),
    limit: compact ? "5" : "25",
    sort,
  });
  if (exchange) qs.set("exchange", exchange);
  if (account) qs.set("connectionId", account);
  if (searchCoin) qs.set("coin", searchCoin);
  if (side) qs.set("side", side);
  if (pnlResult) qs.set("result", pnlResult);
  const result = useExchangeData<{
    positions: PositionDto[];
    total: number;
    limit: number;
    workerOnline: boolean;
    connectionCount: number;
    incomplete: boolean;
    summary?: {
      count: number;
      long: number;
      short: number;
      volume: { value: string | null; known: number; total?: number };
      realized: {
        total?: number;
        value: string | null;
        known: number;
        excludedFeeAssets?: string[];
      };
      unrealized: { value: string | null; known: number; total?: number };
    };
  }>(`/api/positions?${qs}`, 15_000, true);
  const options = useExchangeData<{ connections: ConnectionDto[] }>(
    "/api/exchanges",
    60_000,
  );
  function filter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }
  // Only accounts of the chosen exchange are offered; a selected account of another exchange is cleared.
  const accountOptions = (options.data?.connections ?? []).filter(
    (c) => !exchange || c.exchange === exchange,
  );
  function chooseExchange(value: string) {
    filter(setExchange, value);
    if (
      value &&
      account &&
      options.data?.connections.find((c) => c.id === account)?.exchange !==
        value
    )
      setAccount("");
  }
  const filtered = activeFilters > 0 || coin.trim() !== "";
  function resetFilters() {
    setExchange("");
    if (!connectionId) setAccount("");
    setCoin("");
    setSide("");
    setPnlResult("");
    setSort("size");
    setPage(1);
  }
  const updating = !!result.data && (result.loading || coin.trim() !== searchCoin);
  return (
    <section className="min-w-0 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-3">
        {compact || connectionId ? (
          <h2 className="text-lg font-semibold">{t("positions")}</h2>
        ) : (
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{t("positions")}</h1>
          </div>
        )}
        {compact && (
          <Link href="/positions" className="text-sm text-primary">
            {t("viewAll")}
          </Link>
        )}
      </div>
      <div
        className={
          !compact
            ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]"
            : "contents"
        }
      >
        {!compact && result.data?.summary && (
          <div
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3"
            aria-label={t("positionsSummary")}
            aria-busy={result.loading || coin.trim() !== searchCoin}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="font-medium">
                {t("positionsSummary")} · {result.data.summary.count}
                {/* Shown here so the list does not jump while a filter loads. */}
                <span
                  role="status"
                  aria-live="polite"
                  className="ml-2 font-normal text-text-muted"
                >
                  {updating ? t("updatingPositions") : null}
                </span>
              </span>
              <span className="text-xs text-text-muted tabular-nums">
                Long {result.data.summary.long} · Short{" "}
                {result.data.summary.short}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 sm:gap-4">
              {(
                [
                  ["positionVolume", "positionVolumeShort", "volume"],
                  ["realizedPnl", "realizedPnlShort", "realized"],
                  ["unrealizedPnl", "unrealizedPnlShort", "unrealized"],
                ] as const
              ).map(([label, shortLabel, key]) => {
                const metric = result.data!.summary![key];
                return (
                  <div
                    key={key}
                    className="min-w-0 [&:last-child]:text-right sm:[&:last-child]:text-left"
                  >
                    <dt className="mb-0.5 truncate text-[11px] text-text-muted sm:mb-1.5 sm:whitespace-normal sm:text-xs">
                      <span className="sm:hidden">{t(shortLabel)}</span>
                      <span className="hidden sm:inline">{t(label)}</span>
                    </dt>
                    <dd
                      className={`break-words text-sm sm:text-base font-medium tabular-nums ${key !== "volume" && Number(metric.value) !== 0 ? (Number(metric.value) > 0 ? "text-success" : "text-danger") : ""}`}
                    >
                      <Money value={metric.value} />
                    </dd>
                    {metric.known <
                      (metric.total ?? result.data!.summary!.count) && (
                      <p className="mt-1 hidden text-xs text-text-muted sm:block">
                        {t("summaryCoverage", {
                          known: metric.known,
                          total: metric.total ?? result.data!.summary!.count,
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
            </dl>
          </div>
        )}
        {!compact && (
          // On phones only the coin search stays in view; the other filters open from a button.
          <div
            className={`grid gap-2 sm:grid-cols-2 xl:grid-cols-3 ${filtered && !filtersOpen ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
          >
            <Input
              aria-label={t("coin")}
              value={coin}
              onChange={(e) => filter(setCoin, e.target.value)}
              placeholder={t("coin")}
              maxLength={40}
              className="h-9 text-[13px] sm:order-2 sm:h-10 sm:text-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 px-3 text-[13px] sm:hidden"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              {t("positionFilters")}
              {activeFilters > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-white">
                  {activeFilters}
                </span>
              )}
            </Button>
            {filtered && !filtersOpen && (
              <Button
                type="button"
                variant="outline"
                className="h-9 w-9 px-0 sm:hidden"
                aria-label={t("resetFilters")}
                title={t("resetFilters")}
                onClick={resetFilters}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
            <div
              className={`${filtersOpen ? "grid" : "hidden"} col-span-full grid-cols-2 gap-2 sm:contents`}
            >
            {!connectionId && (
              <>
                <PositionSelect
                  lead
                  aria-label={t("exchange")}
                  value={exchange}
                  onChange={(e) => chooseExchange(e.target.value)}
                >
                  <option value="">{t("allExchanges")}</option>
                  <option value="binance">Binance</option>
                  <option value="bybit">Bybit</option>
                  <option value="gate">Gate</option>
                  <option value="okx">OKX</option>
                  <option value="bitget">Bitget</option>
                  <option value="hyperliquid">Hyperliquid</option>
                  <option value="aster">Aster</option>
                </PositionSelect>
                <PositionSelect
                  lead
                  aria-label={t("account")}
                  value={account}
                  disabled={!!connectionId}
                  onChange={(e) => filter(setAccount, e.target.value)}
                >
                  <option value="">{t("allAccounts")}</option>
                  {accountOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </PositionSelect>
              </>
            )}
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
              <option value="pnlAsc">{t("sortPnlAsc")}</option>
              <option value="roe">{t("sortRoe")}</option>
              <option value="roeAsc">{t("sortRoeAsc")}</option>
              <option value="symbol">{t("coin")}</option>
            </PositionSelect>
            <PositionSelect
              aria-label={t("resultFilter")}
              value={pnlResult}
              onChange={(e) => filter(setPnlResult, e.target.value)}
            >
              <option value="">{t("allResults")}</option>
              <option value="profit">{t("profitablePositions")}</option>
              <option value="loss">{t("losingPositions")}</option>
            </PositionSelect>
            {filtered && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-[13px] text-text-muted sm:order-4 sm:col-span-full sm:h-7 sm:justify-self-end sm:px-2 sm:text-xs"
                onClick={resetFilters}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                {t("resetFilters")}
              </Button>
            )}
            </div>
          </div>
        )}
      </div>
      {(compact || !result.data?.summary) && (
        <p role="status" className="sr-only" aria-live="polite">
          {updating ? t("updatingPositions") : null}
        </p>
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
      <div className="space-y-3">
        {groupByBase(result.data?.positions ?? []).map((group) => {
          const rows = group.map((p) => {
            const netRealized = realizedWithFunding(p);
            const displayedRealized = netRealized;
            const breakEven = p.funding?.breakEvenPrice ?? null;
            const closedAfterFees =
              p.funding?.realizedPnl != null && p.funding.tradingFees != null
                ? String(
                    Number(p.funding.realizedPnl) -
                      Number(p.funding.tradingFees),
                  )
                : null;
            const distance = liquidationDistance(p);
            const displayedClosed =
              closedAfterFees ?? p.funding?.realizedPnl ?? null;
            const shield = p.funding?.shield;
            const key = `${p.connection.id}:${p.positionKey}`;
            return {
              key,
              node: (
                <details
                  key={key}
                  className="group"
                  open={
                    expanded[`${p.connection.id}:${p.positionKey}`] ?? false
                  }
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
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3 py-3 [&>div>p+p]:mt-0.5 sm:px-4 lg:grid-cols-6 lg:items-center lg:gap-x-6 lg:gap-y-2 lg:px-5 lg:py-3 lg:[&>div>p+p]:mt-1 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&>div]:min-w-0">
                    {/* Phones: coin and account on the left with PnL beside them, then size, prices and realized PnL in one row. */}
                    <div className="order-1 col-span-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 lg:order-none lg:col-span-1 lg:block">
                      {/* A div: the logo fallback is a div, which a paragraph may not contain (hydration error). */}
                      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold lg:gap-3 lg:text-base">
                        <ExchangeTokenLogo symbol={p.base} size={24} />
                        <span className="truncate">{displaySymbol(p.symbol)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:mt-1">
                        <span
                          className={`text-xs font-medium lg:text-sm ${p.side === "long" ? "text-success" : "text-danger"}`}
                        >
                          {p.side === "long" ? "Long" : "Short"}
                        </span>
                        <span
                          className="text-xs text-text-muted lg:text-sm"
                          title={t("leverage")}
                        >
                          <Quantity
                            value={p.leverage}
                            maximumFractionDigits={4}
                          />
                          {p.leverage ? "×" : ""} · {p.marginMode ?? "—"}
                        </span>
                        {shield && (
                          <span
                            className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary lg:px-2 lg:text-xs"
                            title={t("shieldDescription")}
                          >
                            Aster Shield
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="order-4 flex flex-col lg:order-none lg:block">
                      <p className="truncate text-[11px] text-text-muted lg:text-xs">{t("size")}</p>
                      <p className="order-2 break-words text-[11px] tabular-nums text-text-muted lg:text-sm lg:font-medium lg:text-text">
                        <Quantity
                          value={p.baseSize}
                          maximumFractionDigits={4}
                        />{" "}
                        {p.base}
                      </p>
                      <p className="order-1 text-[13px] font-medium lg:text-xs lg:font-normal lg:text-text-muted">
                        <Money value={p.notionalUsd} />
                      </p>
                    </div>
                    <div className="order-5 lg:order-none">
                      <p className="truncate text-[11px] text-text-muted lg:text-xs">
                        <span className="lg:hidden">{t("entryMarkShort")}</span>
                        <span className="hidden lg:inline">{t("entryMark")}</span>
                      </p>
                      <p className="break-words text-[13px] font-medium tabular-nums lg:text-sm">
                        <Quantity
                          value={p.entryPrice}
                          maximumFractionDigits={4}
                        />
                        <span className="hidden lg:inline"> / </span>
                        <span className="block text-[11px] font-normal text-text-muted lg:inline lg:text-sm lg:font-medium lg:text-text">
                          <Quantity
                            value={p.markPrice}
                            maximumFractionDigits={4}
                          />
                        </span>
                      </p>
                      <p className="hidden text-xs text-text-muted lg:block">{p.settle}</p>
                    </div>
                    {shield ? (
                      <div className="order-6 text-right lg:order-none lg:text-left">
                        <p className="truncate text-[11px] text-text-muted lg:text-xs">{t("margin")}</p>
                        <p className="break-words text-[13px] font-medium tabular-nums lg:text-sm">
                          <Quantity
                            value={p.margin}
                            maximumFractionDigits={4}
                          />{" "}
                          {p.settle}
                        </p>
                        <p className="text-[11px] text-text-muted tabular-nums lg:text-xs">
                          TP{" "}
                          <Quantity
                            value={shield.takeProfit}
                            maximumFractionDigits={4}
                          />{" "}
                          · SL{" "}
                          <Quantity
                            value={shield.stopLoss}
                            maximumFractionDigits={4}
                          />
                        </p>
                      </div>
                    ) : (
                      <div className="order-6 text-right lg:order-none lg:text-left">
                        <p
                          className="truncate text-[11px] text-text-muted lg:text-xs"
                          title={t("realizedPnlDescription")}
                        >
                          <span className="lg:hidden">{t("realizedPnlShort")}</span>
                          <span className="hidden lg:inline">{t("realizedPnl")}</span>
                        </p>
                        <p
                          className={`break-words text-[13px] font-medium tabular-nums lg:text-sm ${displayedRealized == null ? "text-text-muted" : Number(displayedRealized) > 0 ? "text-success" : Number(displayedRealized) < 0 ? "text-danger" : ""}`}
                        >
                          {displayedRealized != null &&
                          Number(displayedRealized) > 0
                            ? "+"
                            : ""}
                          <Quantity
                            value={displayedRealized}
                            maximumFractionDigits={4}
                          />{" "}
                          {p.settle}
                        </p>
                      </div>
                    )}
                    <div className="order-3 col-span-2 flex flex-wrap items-center gap-x-2 lg:order-none lg:col-span-1 lg:block">
                      <p className="break-words text-xs font-medium lg:text-sm">
                        {p.connection.label}
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-text-muted lg:text-xs">
                        <ExchangeLogo
                          exchange={p.connection.exchange}
                          size={14}
                        />
                        {exchangeName(p.connection.exchange)}
                      </p>
                    </div>
                    <div className="order-2 row-span-2 text-right lg:order-none lg:row-span-1">
                      <p className="truncate text-[11px] text-text-muted lg:text-xs">
                        <span className="lg:hidden">{t("unrealizedPnlShort")}</span>
                        <span className="hidden lg:inline">{t("unrealizedPnl")}</span>
                      </p>
                      <p
                        className={`text-base font-semibold lg:text-lg ${Number(p.unrealizedPnlUsd ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                      >
                        <Money value={p.unrealizedPnlUsd} signed />
                      </p>
                      <p
                        className="text-xs text-text-muted lg:text-sm"
                        title={t("returnOnMargin") + ": " + t("returnFormula")}
                      >
                        {marginReturn(p)}
                      </p>
                      {p.stale && (
                        <p className="text-[11px] text-warning lg:text-xs">{t("stale")}</p>
                      )}
                    </div>
                  </summary>
                  <div className="border-t border-border bg-background/40 px-3 py-3 sm:px-4 lg:px-5 lg:py-3">
                    {shield ? (
                      <dl className={DETAILS_GRID}>
                        <div>
                          <dt className="text-text-muted">
                            {t("liquidation")}
                          </dt>
                          <dd>
                            <Quantity
                              value={p.liquidationPrice}
                              maximumFractionDigits={4}
                            />{" "}
                            {p.settle}
                          </dd>
                          <p
                            className="mt-0.5 text-[11px] text-text-muted lg:mt-1 lg:text-xs"
                            title={t("liquidationDistanceDescription")}
                          >
                            {t("liquidationDistance")}:{" "}
                            {distance == null
                              ? "—"
                              : new Intl.NumberFormat(locale, {
                                  style: "percent",
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }).format(distance)}
                          </p>
                        </div>
                        <div>
                          <dt className="text-text-muted">TP / SL</dt>
                          <dd>
                            <Quantity
                              value={shield.takeProfit}
                              maximumFractionDigits={4}
                            />{" "}
                            /{" "}
                            <Quantity
                              value={shield.stopLoss}
                              maximumFractionDigits={4}
                            />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">
                            {t("shieldFeeMode")}
                          </dt>
                          <dd>
                            {shield.feeMode === "PROFIT"
                              ? t("shieldFeeFromProfit")
                              : (shield.feeMode ?? "—")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">
                            {t("shieldOpenedAt")}
                          </dt>
                          <dd>
                            {shield.openedAt
                              ? new Intl.DateTimeFormat(locale, {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                }).format(shield.openedAt)
                              : "—"}
                          </dd>
                          <p className="mt-0.5 text-[11px] font-normal text-text-muted lg:mt-1 lg:text-xs">
                            {t("updated")}{" "}
                            <PositionUpdated value={p.updatedAt} />
                          </p>
                        </div>
                        <div className="lg:col-start-6 lg:text-right">
                          <dt className="text-text-muted">
                            {t("nextFunding")}
                          </dt>
                          <NextFunding p={p} />
                        </div>
                      </dl>
                    ) : (
                      <dl className={DETAILS_GRID}>
                        <div>
                          <dt
                            className="text-text-muted"
                            title={t("breakEvenDescription")}
                          >
                            {t("breakEven")}
                          </dt>
                          <dd>
                            <Quantity
                              value={breakEven}
                              maximumFractionDigits={4}
                            />{" "}
                            {p.settle}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">{t("margin")}</dt>
                          <dd>
                            <Quantity
                              value={p.margin}
                              maximumFractionDigits={4}
                            />{" "}
                            {p.settle}
                          </dd>
                          <p className="mt-0.5 text-[11px] font-normal text-text-muted lg:mt-1 lg:text-xs">
                            {t("updated")}{" "}
                            <PositionUpdated value={p.updatedAt} />
                          </p>
                        </div>
                        <div>
                          <dt className="text-text-muted">
                            {t("liquidation")}
                          </dt>
                          <dd>
                            <Quantity
                              value={p.liquidationPrice}
                              maximumFractionDigits={4}
                            />{" "}
                            {p.settle}
                          </dd>
                          <p
                            className="mt-0.5 text-[11px] text-text-muted lg:mt-1 lg:text-xs"
                            title={t("liquidationDistanceDescription")}
                          >
                            {t("liquidationDistance")}:{" "}
                            {distance == null
                              ? "—"
                              : new Intl.NumberFormat(locale, {
                                  style: "percent",
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }).format(distance)}
                          </p>
                        </div>
                        <div>
                          <dt
                            className="text-text-muted"
                            title={
                              closedAfterFees == null
                                ? undefined
                                : t("closedAfterFeesDescription")
                            }
                          >
                            {t(
                              closedAfterFees == null
                                ? "closedPnl"
                                : "closedAfterFees",
                            )}
                          </dt>
                          <dd
                            className={
                              displayedClosed == null
                                ? "text-text-muted"
                                : Number(displayedClosed) > 0
                                  ? "text-success"
                                  : Number(displayedClosed) < 0
                                    ? "text-danger"
                                    : undefined
                            }
                          >
                            <Quantity
                              value={displayedClosed}
                              maximumFractionDigits={4}
                            />{" "}
                            {p.settle}
                          </dd>
                          {closedAfterFees == null &&
                            p.funding?.tradingFeesByAsset && (
                              <div className="mt-1 text-[11px] text-text-muted lg:mt-2 lg:text-xs">
                                <p>{t("tradingFees")}</p>
                                {Object.entries(
                                  p.funding.tradingFeesByAsset,
                                ).map(([asset, fee]) => (
                                  <p key={asset}>
                                    <Quantity
                                      value={fee}
                                      maximumFractionDigits={8}
                                    />{" "}
                                    {asset}
                                  </p>
                                ))}
                              </div>
                            )}
                        </div>
                        <div>
                          <dt className="text-text-muted">{t("funding")}</dt>
                          <dd
                            className={
                              p.funding?.amount == null
                                ? "text-text-muted"
                                : Number(p.funding.amount) > 0
                                  ? "text-success"
                                  : Number(p.funding.amount) < 0
                                    ? "text-danger"
                                    : undefined
                            }
                          >
                            <Quantity
                              value={
                                p.funding?.status === "complete"
                                  ? p.funding.amount
                                  : null
                              }
                              maximumFractionDigits={4}
                            />{" "}
                            {p.settle}
                          </dd>
                        </div>
                        <div className="lg:col-start-6 lg:text-right">
                          <dt className="text-text-muted">
                            {t("nextFunding")}
                          </dt>
                          <NextFunding p={p} />
                        </div>
                      </dl>
                    )}

                    {p.errorCode && (
                      <div className="mt-3">
                        <ExchangeErrorNotice code={p.errorCode} />
                      </div>
                    )}
                  </div>
                </details>
              ),
            };
          });
          const single = rows[0];
          if (group.length === 1 && single)
            return (
              <div
                key={single.key}
                className="overflow-hidden rounded-xl border border-border bg-surface"
              >
                {single.node}
              </div>
            );
          const notional = group.every((p) => p.notionalUsd != null)
            ? group.reduce((sum, p) => sum + Number(p.notionalUsd), 0)
            : null;
          const pnl = group.every((p) => p.unrealizedPnlUsd != null)
            ? group.reduce((sum, p) => sum + Number(p.unrealizedPnlUsd), 0)
            : null;
          return (
            <div
              key={`group:${group[0].base}`}
              className="overflow-hidden rounded-xl border border-primary/30 bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 border-b border-border bg-surface-2/60 px-3 py-2 text-xs sm:px-4 lg:gap-x-6 lg:px-5 lg:py-2 lg:text-sm">
                <span className="font-semibold">
                  {group[0].base} ·{" "}
                  {t("positionGroup", { count: group.length })}
                </span>
                <span className="flex gap-x-3 text-text-muted lg:gap-x-5">
                  <span>
                    <span className="lg:hidden">{t("positionVolumeShort")}</span>
                    <span className="hidden lg:inline">{t("size")}</span>:{" "}
                    <Money value={notional == null ? null : String(notional)} />
                  </span>
                  <span
                    className={
                      pnl == null || pnl === 0
                        ? ""
                        : pnl > 0
                          ? "text-success"
                          : "text-danger"
                    }
                  >
                    <span className="lg:hidden">{t("unrealizedPnlShort")}</span>
                    <span className="hidden lg:inline">{t("unrealizedPnl")}</span>:{" "}
                    <Money value={pnl == null ? null : String(pnl)} signed />
                  </span>
                </span>
              </div>
              <div className="divide-y divide-border">
                {rows.map((row) => (
                  <div key={row.key}>{row.node}</div>
                ))}
              </div>
            </div>
          );
        })}
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
