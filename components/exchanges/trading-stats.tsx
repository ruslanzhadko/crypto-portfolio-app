"use client";
import { useEffect, useState, type SelectHTMLAttributes } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { exchangeAction, useExchangeData } from "./use-exchange-data";
import { ExchangeLogo, exchangeName } from "./exchange-logo";
import { Money } from "./shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/components/alerts/notification-log";
import type { StatsGroup, StatsPeriod, StatsTrade, tradeStats } from "@/lib/positions/trade-stats";

type StatsResponse = ReturnType<typeof tradeStats> & {
  period: StatsPeriod;
  trades: StatsTrade[];
  totalTrades: number;
  excludedTrades: number;
  page: number;
  pageSize: number;
  truncated: boolean;
  options: {
    exchanges: string[];
    accounts: { id: string; label: string; exchange: string }[];
    coins: string[];
  };
};

const PERIODS: StatsPeriod[] = ["today", "7d", "30d", "all"];
const tone = (value: number) => (value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-text-muted");
const usd = (value: number | null | undefined) => (value == null ? null : String(value));

function Card({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-2.5 py-2 sm:rounded-xl sm:p-4">
      <p className="truncate text-[11px] text-text-muted sm:text-sm">{label}</p>
      <div className="truncate text-[15px] font-semibold leading-snug tabular-nums sm:mt-1 sm:text-xl">{children}</div>
      {hint && <p className="truncate text-[11px] text-text-muted sm:mt-0.5 sm:text-xs">{hint}</p>}
    </div>
  );
}

/** The same compact select as the open positions filters. */
function StatsSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-surface-2 pl-3 pr-8 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto sm:text-sm"
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-text-muted" />
    </div>
  );
}

/** A filter with several values: "All …", one name, or "Name +2". Long lists get a search field. */
function MultiFilter({
  label,
  all,
  options,
  selected,
  onChange,
}: {
  label: string;
  all: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("TradingStats");
  const [search, setSearch] = useState("");
  const chosen = new Set(selected);
  const first = options.find((o) => o.value === selected[0])?.label ?? selected[0];
  const text = !selected.length ? all : selected.length === 1 ? first : `${first} +${selected.length - 1}`;
  const query = search.trim().toLowerCase();
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
  const toggle = (value: string) =>
    onChange(chosen.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <DropdownMenu onOpenChange={(open) => !open && setSearch("")}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-surface-2 pl-3 pr-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto sm:min-w-36 sm:text-sm ${selected.length ? "border-primary/60" : "border-border"}`}
        >
          <span className="truncate">{text}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        {options.length > 8 && (
          <div className="p-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              // Typing must reach the field, not the menu's own letter navigation.
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-8 text-sm"
            />
          </div>
        )}
        <DropdownMenuCheckboxItem
          checked={!selected.length}
          onCheckedChange={() => onChange([])}
          onSelect={(event) => event.preventDefault()}
        >
          {all}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {shown.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={chosen.has(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(event) => event.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GroupSort = "size" | "profit" | "loss" | "newest" | "oldest" | "count";
const GROUP_SORTS: GroupSort[] = ["size", "profit", "loss", "newest", "oldest", "count"];

function sortGroups(groups: StatsGroup[], sort: GroupSort): StatsGroup[] {
  const by: Record<GroupSort, (a: StatsGroup, b: StatsGroup) => number> = {
    size: (a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd),
    profit: (a, b) => b.pnlUsd - a.pnlUsd,
    loss: (a, b) => a.pnlUsd - b.pnlUsd,
    newest: (a, b) => b.lastAt - a.lastAt,
    oldest: (a, b) => a.lastAt - b.lastAt,
    count: (a, b) => b.count - a.count || Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd),
  };
  return [...groups].sort(by[sort]);
}

/** Name with "N of M in profit" under it, and the result on the right. */
function GroupRow({ group: g, logo, name, note }: { group: StatsGroup; logo?: string; name: string; note?: string }) {
  const t = useTranslations("TradingStats");
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {logo && <ExchangeLogo exchange={logo} size={16} />}
        {/* Name on top, trade count and winners under it, so a long name never hides the count. */}
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          <span className="block truncate text-xs text-text-muted">
            {t("winsOf", { wins: g.wins, count: g.count })}
            {note ? ` · ${note}` : ""}
          </span>
        </span>
      </span>
      <span className={`shrink-0 font-medium ${tone(g.pnlUsd)}`}>
        <Money value={usd(g.pnlUsd)} signed />
      </span>
    </>
  );
}

/**
 * Exchanges with their accounts inside: one account is the exchange row itself, several open
 * under it. Avoids a second block that repeats the exchanges for most users.
 */
function ExchangeBreakdown({ exchanges, accounts }: { exchanges: StatsGroup[]; accounts: StatsGroup[] }) {
  const t = useTranslations("TradingStats");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!exchanges.length) return null;
  return (
    <section className="h-full min-w-0 rounded-xl border border-border bg-surface p-2.5 sm:p-4">
      <h3 className="mb-1 text-sm font-semibold sm:mb-2 sm:text-base">{t("byExchange")}</h3>
      <ul>
        {exchanges.map((g) => {
          const own = accounts.filter((a) => a.exchange === g.key);
          const several = own.length > 1;
          const expanded = several && open[g.key] === true;
          const name = several ? exchangeName(g.key) : (own[0]?.label ?? exchangeName(g.key));
          return (
            <li key={g.key} className="border-b border-border last:border-b-0">
              {several ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen((state) => ({ ...state, [g.key]: !state[g.key] }))}
                  className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm"
                >
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <GroupRow group={g} logo={g.key} name={name} note={t("accountsCount", { count: own.length })} />
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <GroupRow group={g} logo={g.key} name={name} />
                </div>
              )}
              {expanded && (
                <ul className="mb-1.5 ml-6 border-l border-border pl-3">
                  {own.map((a) => (
                    <li key={a.key} className="flex items-center justify-between gap-3 py-1 text-sm">
                      <GroupRow group={a} name={a.label} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const BREAKDOWN_ROWS = 12;

function Breakdown({
  title,
  groups,
  exchangeLogos,
  columns = false,
  rows = BREAKDOWN_ROWS,
  sortable = false,
}: {
  title: string;
  groups: StatsGroup[];
  exchangeLogos?: boolean;
  /** Two columns on wide screens when the list is longer than `rows`. */
  columns?: boolean;
  /** Rows that fit next to the neighbouring blocks; the rest opens with "show all". */
  rows?: number;
  /** A sort choice in the block header (the coin list). */
  sortable?: boolean;
}) {
  const t = useTranslations("TradingStats");
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<GroupSort>("size");
  if (!groups.length) return null;
  if (sortable) groups = sortGroups(groups, sort);
  const twoColumns = columns && groups.length > rows;
  const limit = twoColumns ? rows * 2 : rows;
  const shown = all ? groups : groups.slice(0, limit);
  return (
    <section className="h-full min-w-0 rounded-xl border border-border bg-surface p-2.5 sm:p-4">
      <div className="mb-1 flex items-center justify-between gap-2 sm:mb-2">
        <h3 className="text-sm font-semibold sm:text-base">{title}</h3>
        {sortable && (
          <div className="relative">
            <select
              aria-label={t("sortBy")}
              value={sort}
              onChange={(e) => setSort(e.target.value as GroupSort)}
              className="h-8 appearance-none rounded-md border border-border bg-surface-2 pl-2.5 pr-7 text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
            >
              {GROUP_SORTS.map((value) => (
                <option key={value} value={value}>{t(`sorts.${value}`)}</option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-text-muted" />
          </div>
        )}
      </div>
      <ul className={twoColumns ? "grid sm:grid-cols-2 sm:gap-x-6" : ""}>
        {shown.map((g) => (
          <li key={g.key} className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-sm last:border-b-0">
            <GroupRow
              group={g}
              logo={exchangeLogos ? (g.exchange ?? g.key) : undefined}
              name={exchangeLogos && !g.exchange ? exchangeName(g.key) : g.label}
            />
          </li>
        ))}
      </ul>
      {groups.length > limit && (
        <button
          type="button"
          onClick={() => setAll((open) => !open)}
          className="mt-2 text-xs text-primary hover:underline sm:text-sm"
        >
          {all ? t("showLess") : t("showAll", { count: groups.length })}
        </button>
      )}
    </section>
  );
}

/** Previous / page numbers / next under the trades table. */
function Pages({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const t = useTranslations("TradingStats");
  if (pages <= 1) return null;
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => from + i);
  const button = "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition-colors disabled:opacity-40";
  return (
    <nav aria-label={t("pages")} className="flex items-center justify-center gap-1 border-t border-border px-3 py-2">
      <button type="button" className={`${button} hover:bg-surface-2`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("prevPage")}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      {numbers[0]! > 1 && <span className="px-1 text-text-muted">…</span>}
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? "page" : undefined}
          onClick={() => onPage(n)}
          className={`${button} tabular-nums ${n === page ? "bg-primary text-white" : "text-text-muted hover:bg-surface-2 hover:text-text"}`}
        >
          {n}
        </button>
      ))}
      {numbers.at(-1)! < pages && <span className="px-1 text-text-muted">…</span>}
      <button type="button" className={`${button} hover:bg-surface-2`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("nextPage")}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

/** Trading statistics tab of the Positions page (docs/TRADING_STATS.md). */
export function TradingStats() {
  const t = useTranslations("TradingStats");
  const tp = useTranslations("PositionAlerts.log");
  const locale = useLocale();
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [coins, setCoins] = useState<string[]>([]);
  const [side, setSide] = useState("");
  const [page, setPage] = useState(1);
  const filterKey = [exchanges.join(), accounts.join(), coins.join(), side].join("|");
  // Another period or filter starts from the newest trades again.
  useEffect(() => setPage(1), [period, filterKey]);
  const query = new URLSearchParams({
    period,
    exchange: exchanges.join(","),
    connectionId: accounts.join(","),
    coin: coins.join(","),
    side,
    page: String(page),
  });
  const { data, loading, refresh } = useExchangeData<StatsResponse>(`/api/positions/stats?${query}`, 60_000, true);
  // A trade being marked or unmarked: its button waits for the answer.
  const [marking, setMarking] = useState<string | null>(null);
  const toggleExcluded = async (trade: StatsTrade) => {
    setMarking(trade.id);
    try {
      await exchangeAction(`/api/positions/stats/trades/${trade.id}`, "PATCH", { excluded: !trade.excluded });
      refresh();
    } catch {
      // The row keeps its old state; the next poll shows the truth.
    } finally {
      setMarking(null);
    }
  };
  const s = data?.summary;
  const day = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const price = (value: number | null) =>
    value == null ? "—" : new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(value);
  // On phones the filters open from a button, like on the open positions tab.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [exchanges.length, accounts.length, coins.length, side ? 1 : 0].filter(Boolean).length;
  const resetFilters = () => {
    setExchanges([]);
    setAccounts([]);
    setCoins([]);
    setSide("");
  };
  const accountOptions = (data?.options.accounts ?? []).filter(
    (a) => !exchanges.length || exchanges.includes(a.exchange),
  );
  // Accounts of exchanges that are no longer chosen drop out of the selection.
  const chooseExchanges = (next: string[]) => {
    setExchanges(next);
    setAccounts((current) =>
      current.filter((id) => {
        const owner = data?.options.accounts.find((a) => a.id === id)?.exchange;
        return !next.length || (owner !== undefined && next.includes(owner));
      }),
    );
  };

  return (
    <div className="min-w-0 space-y-2.5 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-2">
        <div
          role="group"
          aria-label={t("period")}
          className="flex h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface p-0.5 text-[13px] sm:flex-none sm:text-sm"
        >
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`flex-1 whitespace-nowrap rounded-md px-2 transition-colors sm:flex-none sm:px-3 ${period === value ? "bg-primary text-white" : "text-text-muted hover:text-text"}`}
            >
              {t(`periods.${value}`)}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="relative h-9 w-9 px-0 sm:hidden"
          aria-expanded={filtersOpen}
          aria-label={t("filters")}
          title={t("filters")}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[11px] leading-4 text-white">
              {activeFilters}
            </span>
          )}
        </Button>
        {/* Reset sits next to the filters button on phones and after the last filter on wider screens. */}
        {activeFilters > 0 && (
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
          className={`${filtersOpen ? "grid animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none" : "hidden"} w-full grid-cols-2 gap-2 sm:contents`}
        >
          <MultiFilter
            label={t("exchange")}
            all={t("allExchanges")}
            options={(data?.options.exchanges ?? []).map((e) => ({ value: e, label: exchangeName(e) }))}
            selected={exchanges}
            onChange={chooseExchanges}
          />
          <MultiFilter
            label={t("account")}
            all={t("allAccounts")}
            options={accountOptions.map((a) => ({ value: a.id, label: `${exchangeName(a.exchange)} · ${a.label}` }))}
            selected={accounts}
            onChange={setAccounts}
          />
          <MultiFilter
            label={t("coin")}
            all={t("allCoins")}
            options={(data?.options.coins ?? []).map((c) => ({ value: c, label: c }))}
            selected={coins}
            onChange={setCoins}
          />
          <StatsSelect aria-label={t("side")} value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="">{t("allSides")}</option>
            <option value="long">{t("long")}</option>
            <option value="short">{t("short")}</option>
          </StatsSelect>
        </div>
        {activeFilters > 0 && (
          <Button
            type="button"
            variant="outline"
            className="hidden h-9 gap-1.5 px-3 text-sm sm:inline-flex"
            title={t("resetFilters")}
            onClick={resetFilters}
          >
            <X aria-hidden="true" className="h-4 w-4" />
            {t("resetFilters")}
          </Button>
        )}
      </div>

      {!data && loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 sm:h-24" />)}
        </div>
      ) : !s || s.count === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3 ${loading ? "opacity-60" : ""}`}>
            <Card label={t("total")} hint={s.approximate ? t("approximate", { count: s.approximate }) : undefined}>
              <span className={tone(s.totalUsd)}><Money value={usd(s.totalUsd)} signed /></span>
            </Card>
            <Card label={t("trades")} hint={t("winsLosses", { wins: s.wins, losses: s.losses })}>{s.count}</Card>
            <Card label={t("winRate")}>{s.winRate == null ? "—" : `${Math.round(s.winRate * 100)}%`}</Card>
            <Card label={t("avgDuration")}>{s.avgDurationMs == null ? "—" : formatDuration(s.avgDurationMs, tp)}</Card>
            <Card label={t("avgWin")}><span className="text-success"><Money value={usd(s.avgWinUsd)} signed /></span></Card>
            <Card label={t("avgLoss")}><span className="text-danger"><Money value={usd(s.avgLossUsd)} signed /></span></Card>
            <Card label={t("best")} hint={s.best ? `${s.best.base} · ${t(s.best.side)} · ${exchangeName(s.best.exchange)}` : undefined}>
              <span className="text-success"><Money value={usd(s.best?.pnlUsd)} signed /></span>
            </Card>
            <Card label={t("worst")} hint={s.worst ? `${s.worst.base} · ${t(s.worst.side)} · ${exchangeName(s.worst.exchange)}` : undefined}>
              <span className="text-danger"><Money value={usd(s.worst?.pnlUsd)} signed /></span>
            </Card>
          </div>

          {data.days.length > 1 && (
            <section className="min-w-0 rounded-xl border border-border bg-surface p-2.5 sm:p-4">
              <h3 className="mb-2 text-sm font-semibold sm:text-base">{t("byDay")}</h3>
              <div className="h-36 min-w-0 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.days}>
                    <XAxis dataKey="day" tickFormatter={day} tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={24} />
                    <YAxis width={44} tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickFormatter={(v) => new Intl.NumberFormat(locale, { notation: "compact" }).format(v)} />
                    <ReferenceLine y={0} stroke="#334155" />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.08)" }}
                      labelFormatter={(v) => day(String(v))}
                      formatter={(v: number, _name, item) => [
                        `${new Intl.NumberFormat(locale, { style: "currency", currency: "USD", signDisplay: "exceptZero" }).format(v)} · ${t("tradesCount", { count: (item.payload as { count: number }).count })}`,
                        t("result"),
                      ]}
                      contentStyle={{ background: "var(--surface, #151c2c)", border: "1px solid #334155", borderRadius: 8 }}
                      labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                      itemStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="pnlUsd" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                      {data.days.map((d) => <Cell key={d.day} fill={d.pnlUsd >= 0 ? "#22c55e" : "#ef4444"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Exchanges (with their accounts) are a short list: one column next to the coins. */}
          <div className="grid gap-2 sm:gap-3 lg:grid-cols-3">
            <div className="min-w-0">
              <ExchangeBreakdown exchanges={data.byExchange} accounts={data.byAccount} />
            </div>
            <div className="min-w-0 lg:col-span-2">
              {/* About as tall as the exchange block, so the two end together. */}
              <Breakdown
                title={t("byCoin")}
                groups={data.byCoin}
                columns
                sortable
                rows={Math.max(6, data.byExchange.length)}
              />
            </div>
          </div>

          <section className="min-w-0 rounded-xl border border-border bg-surface">
            <h3 className="px-3 pt-3 text-sm font-semibold sm:px-4 sm:pt-4 sm:text-base">
              {t("tradesTitle")} <span className="font-normal text-text-muted">({data.totalTrades})</span>
              {data.excludedTrades > 0 && (
                <span className="ml-2 text-xs font-normal text-text-muted">
                  {t("excludedCount", { count: data.excludedTrades })}
                </span>
              )}
            </h3>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium sm:px-4">{t("coin")}</th>
                    <th className="px-2 py-2 font-medium">{t("account")}</th>
                    <th className="px-2 py-2 font-medium">{t("entryExit")}</th>
                    <th className="px-2 py-2 font-medium">{t("duration")}</th>
                    <th className="px-2 py-2 font-medium">{t("closed")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("result")}</th>
                    <th className="w-10 pr-2 sm:pr-3">
                      <span className="sr-only">{t("exclude")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.trades.map((trade) => (
                    <tr key={trade.id} className={trade.excluded ? "text-text-muted [&>td]:opacity-60" : undefined}>
                      <td className="px-3 py-2 sm:px-4">
                        <span className="font-medium">{trade.base}</span>{" "}
                        <span className={trade.side === "long" ? "text-success" : "text-danger"}>{t(trade.side)}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-1.5">
                          <ExchangeLogo exchange={trade.exchange} size={14} />
                          <span className="truncate">{trade.label}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{price(trade.entryPrice)} → {price(trade.exitPrice)}</td>
                      <td className="px-2 py-2 text-text-muted">
                        {trade.openedAt == null ? "—" : formatDuration(trade.closedAt - trade.openedAt, tp)}
                      </td>
                      <td className="px-2 py-2 text-text-muted">
                        {new Date(trade.closedAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-medium ${trade.excluded ? "line-through" : tone(trade.pnlUsd)}`}
                        title={trade.excluded ? t("excludedHint") : undefined}
                      >
                        {!trade.exact && <span className="mr-0.5 text-text-muted" title={t("approximateHint")}>≈</span>}
                        <Money value={usd(trade.pnlUsd)} signed />
                      </td>
                      <td className="py-1 pr-2 text-right sm:pr-3">
                        {/* One leg of a hedge is not a result: the owner can leave it out of the figures. */}
                        <button
                          type="button"
                          disabled={marking === trade.id}
                          aria-pressed={trade.excluded === true}
                          aria-label={trade.excluded ? t("include") : t("exclude")}
                          title={trade.excluded ? t("include") : t("exclude")}
                          onClick={() => void toggleExcluded(trade)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
                        >
                          {trade.excluded ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pages page={data.page} pages={Math.ceil(data.totalTrades / data.pageSize)} onPage={setPage} />
          </section>
        </>
      )}
      <p className="text-xs text-text-muted">{t("sourceNote")}</p>
    </div>
  );
}
