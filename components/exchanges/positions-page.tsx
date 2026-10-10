"use client";
import { ExchangeTokenLogo } from "./token-logo";
import { useEffect, useState, type SelectHTMLAttributes } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
      volume: { value: string | null; known: number };
      realized: {
        value: string | null;
        known: number;
        excludedFeeAssets?: string[];
      };
      unrealized: { value: string | null; known: number };
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
      <div
        className={
          !compact
            ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
            : "contents"
        }
      >
        {!compact && result.data?.summary && (
          <div
            className="w-full rounded-xl border border-border bg-surface px-5 py-4"
            aria-label={t("positionsSummary")}
            aria-busy={result.loading || coin.trim() !== searchCoin}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {t("positionsSummary")} · {result.data.summary.count}
              </span>
              <span className="text-xs text-text-muted tabular-nums">
                Long {result.data.summary.long} · Short{" "}
                {result.data.summary.short}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-3 sm:gap-4">
              {(
                [
                  ["positionVolume", "volume"],
                  ["realizedPnl", "realized"],
                  ["unrealizedPnl", "unrealized"],
                ] as const
              ).map(([label, key]) => {
                const metric = result.data!.summary![key];
                const excludedFees =
                  key === "realized"
                    ? result.data!.summary!.realized.excludedFeeAssets
                    : undefined;
                return (
                  <div key={key} className="min-w-0">
                    <dt className="mb-1.5 min-h-8 text-xs text-text-muted sm:min-h-0">
                      {excludedFees?.length
                        ? t("pnlBeforeForeignFees", {
                            assets: excludedFees.join(", "),
                          })
                        : t(label)}
                    </dt>
                    <dd
                      className={`break-words text-sm sm:text-lg font-medium tabular-nums ${key !== "volume" && Number(metric.value) !== 0 ? (Number(metric.value) > 0 ? "text-success" : "text-danger") : ""}`}
                    >
                      <Money value={metric.value} />
                    </dd>
                    {metric.known < result.data!.summary!.count && (
                      <p className="mt-1 text-xs text-text-muted">
                        {t("summaryCoverage", {
                          known: metric.known,
                          total: result.data!.summary!.count,
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
          <div
            className={`grid gap-2 sm:grid-cols-2 ${connectionId ? "xl:grid-cols-3" : "xl:grid-cols-3"}`}
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
                  <option value="gate">Gate</option>
                  <option value="okx">OKX</option>
                  <option value="bitget">Bitget</option>
                  <option value="hyperliquid">Hyperliquid</option>
                  <option value="aster">Aster</option>
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
          </div>
        )}
      </div>
      <p
        role="status"
        className="h-4 text-xs text-text-muted"
        aria-live="polite"
      >
        {result.data && (result.loading || coin.trim() !== searchCoin)
          ? t("updatingPositions")
          : null}
      </p>
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
        {result.data?.positions.map((p) => {
          const netRealized = realizedWithFunding(p);
          const foreignFees = Object.entries(
            p.funding?.tradingFeesByAsset ?? {},
          )
            .filter(
              ([asset, amount]) => asset !== p.settle && Number(amount) !== 0,
            )
            .map(([asset]) => asset);
          const beforeForeignFees =
            netRealized == null &&
            foreignFees.length > 0 &&
            p.funding?.status === "complete" &&
            p.funding.realizedPnl != null &&
            p.funding.amount != null
              ? String(
                  Number(p.funding.realizedPnl) +
                    Number(p.funding.amount) -
                    Number(p.funding.tradingFeesByAsset?.[p.settle] ?? 0),
                )
              : null;
          const displayedRealized = netRealized ?? beforeForeignFees;
          const closedAfterFees =
            p.funding?.realizedPnl != null && p.funding.tradingFees != null
              ? String(
                  Number(p.funding.realizedPnl) - Number(p.funding.tradingFees),
                )
              : null;
          const distance = liquidationDistance(p);
          const displayedClosed =
            closedAfterFees ?? p.funding?.realizedPnl ?? null;
          return (
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
                    <Quantity value={p.entryPrice} maximumFractionDigits={4} />{" "}
                    / <Quantity value={p.markPrice} maximumFractionDigits={4} />
                  </p>
                  <p className="text-xs text-text-muted">{p.settle}</p>
                </div>
                <div className="text-right lg:text-left">
                  <p
                    className="text-xs text-text-muted"
                    title={t("realizedPnlDescription")}
                  >
                    {beforeForeignFees == null
                      ? t("realizedPnl")
                      : t("pnlBeforeForeignFees", {
                          assets: foreignFees.join(", "),
                        })}
                  </p>
                  <p
                    className={`text-[15px] font-medium tabular-nums ${displayedRealized == null ? "text-text-muted" : Number(displayedRealized) > 0 ? "text-success" : Number(displayedRealized) < 0 ? "text-danger" : ""}`}
                  >
                    {displayedRealized != null && Number(displayedRealized) > 0
                      ? "+"
                      : ""}
                    <Quantity
                      value={displayedRealized}
                      maximumFractionDigits={4}
                    />{" "}
                    {p.settle}
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
                        gate: "Gate",
                        okx: "OKX",
                        bitget: "Bitget",
                        hyperliquid: "Hyperliquid",
                        aster: "Aster",
                      } as Record<string, string>
                    )[p.connection.exchange] ?? p.connection.exchange}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-muted">
                    {t("unrealizedPnl")}
                  </p>
                  <p
                    className={`text-xl font-semibold ${Number(p.unrealizedPnlUsd ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                  >
                    <Money value={p.unrealizedPnlUsd} signed />
                  </p>
                  <p
                    className="text-sm text-text-muted"
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
                    <p className="mt-1 text-xs font-normal text-text-muted">
                      {t("updated")} <PositionUpdated value={p.updatedAt} />
                    </p>
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
                    <p
                      className="mt-1 text-xs text-text-muted"
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
                        <div className="mt-2 text-xs text-text-muted">
                          <p>{t("tradingFees")}</p>
                          {Object.entries(p.funding.tradingFeesByAsset).map(
                            ([asset, fee]) => (
                              <p key={asset}>
                                <Quantity
                                  value={fee}
                                  maximumFractionDigits={8}
                                />{" "}
                                {asset}
                              </p>
                            ),
                          )}
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
