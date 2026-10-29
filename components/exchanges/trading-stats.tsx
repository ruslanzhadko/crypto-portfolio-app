"use client";
import { useState } from "react";
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
import { useExchangeData } from "./use-exchange-data";
import { ExchangeLogo, exchangeName } from "./exchange-logo";
import { Money } from "./shared";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/components/alerts/notification-log";
import type { StatsGroup, StatsPeriod, StatsTrade, tradeStats } from "@/lib/positions/trade-stats";

type StatsResponse = ReturnType<typeof tradeStats> & {
  period: StatsPeriod;
  trades: StatsTrade[];
  totalTrades: number;
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
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <p className="text-xs text-text-muted sm:text-sm">{label}</p>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl">{children}</div>
      {hint && <p className="mt-0.5 truncate text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Breakdown({ title, groups, exchangeLogos }: { title: string; groups: StatsGroup[]; exchangeLogos?: boolean }) {
  const t = useTranslations("TradingStats");
  if (!groups.length) return null;
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <h3 className="mb-2 text-sm font-semibold sm:text-base">{title}</h3>
      <ul className="divide-y divide-border">
        {groups.slice(0, 12).map((g) => (
          <li key={g.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {exchangeLogos && <ExchangeLogo exchange={g.exchange ?? g.key} size={16} />}
              <span className="truncate">{exchangeLogos && !g.exchange ? exchangeName(g.key) : g.label}</span>
              <span className="shrink-0 text-xs text-text-muted">
                {t("winsOf", { wins: g.wins, count: g.count })}
              </span>
            </span>
            <span className={`shrink-0 font-medium ${tone(g.pnlUsd)}`}>
              <Money value={usd(g.pnlUsd)} signed />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Trading statistics tab of the Positions page (docs/TRADING_STATS.md). */
export function TradingStats() {
  const t = useTranslations("TradingStats");
  const tp = useTranslations("PositionAlerts.log");
  const locale = useLocale();
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [exchange, setExchange] = useState("");
  const [account, setAccount] = useState("");
  const [coin, setCoin] = useState("");
  const [side, setSide] = useState("");
  const query = new URLSearchParams({ period, exchange, connectionId: account, coin, side });
  const { data, loading } = useExchangeData<StatsResponse>(`/api/positions/stats?${query}`, 60_000, true);
  const s = data?.summary;
  const day = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const price = (value: number | null) =>
    value == null ? "—" : new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(value);
  const select = "h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text";

  return (
    <div className="min-w-0 space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("period")} className="flex rounded-lg border border-border bg-surface p-0.5 text-xs sm:text-sm">
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`rounded-md px-2.5 py-1 transition-colors sm:px-3 ${period === value ? "bg-primary text-white" : "text-text-muted hover:text-text"}`}
            >
              {t(`periods.${value}`)}
            </button>
          ))}
        </div>
        <select aria-label={t("exchange")} className={select} value={exchange} onChange={(e) => { setExchange(e.target.value); setAccount(""); }}>
          <option value="">{t("allExchanges")}</option>
          {data?.options.exchanges.map((e) => <option key={e} value={e}>{exchangeName(e)}</option>)}
        </select>
        <select aria-label={t("account")} className={select} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">{t("allAccounts")}</option>
          {data?.options.accounts
            .filter((a) => !exchange || a.exchange === exchange)
            .map((a) => <option key={a.id} value={a.id}>{`${exchangeName(a.exchange)} · ${a.label}`}</option>)}
        </select>
        <select aria-label={t("coin")} className={select} value={coin} onChange={(e) => setCoin(e.target.value)}>
          <option value="">{t("allCoins")}</option>
          {data?.options.coins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label={t("side")} className={select} value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">{t("allSides")}</option>
          <option value="long">{t("long")}</option>
          <option value="short">{t("short")}</option>
        </select>
      </div>

      {!data && loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !s || s.count === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 ${loading ? "opacity-60" : ""}`}>
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
            <section className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4">
              <h3 className="mb-2 text-sm font-semibold sm:text-base">{t("byDay")}</h3>
              <div className="h-44 min-w-0 sm:h-56">
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
                    />
                    <Bar dataKey="pnlUsd" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                      {data.days.map((d) => <Cell key={d.day} fill={d.pnlUsd >= 0 ? "#22c55e" : "#ef4444"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <div className="grid gap-2 sm:gap-3 lg:grid-cols-3">
            <Breakdown title={t("byExchange")} groups={data.byExchange} exchangeLogos />
            <Breakdown title={t("byAccount")} groups={data.byAccount} exchangeLogos />
            <Breakdown title={t("byCoin")} groups={data.byCoin} />
          </div>

          <section className="min-w-0 rounded-xl border border-border bg-surface">
            <h3 className="px-3 pt-3 text-sm font-semibold sm:px-4 sm:pt-4 sm:text-base">
              {t("tradesTitle")} <span className="font-normal text-text-muted">({data.totalTrades})</span>
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
                    <th className="px-3 py-2 text-right font-medium sm:px-4">{t("result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.trades.map((trade) => (
                    <tr key={trade.id}>
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
                      <td className={`px-3 py-2 text-right font-medium sm:px-4 ${tone(trade.pnlUsd)}`}>
                        {!trade.exact && <span className="mr-0.5 text-text-muted" title={t("approximateHint")}>≈</span>}
                        <Money value={usd(trade.pnlUsd)} signed />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <p className="text-xs text-text-muted">{t("sourceNote")}</p>
    </div>
  );
}
