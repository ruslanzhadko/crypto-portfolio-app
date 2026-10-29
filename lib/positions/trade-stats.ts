/**
 * Trading statistics over closed trades (docs/TRADING_STATS.md). Days are Kyiv calendar days, the
 * same days as the daily summary in Telegram.
 */
export const STATS_TIME_ZONE = "Europe/Kyiv";
const DAY_MS = 86_400_000;

export interface StatsTrade {
  id: string;
  connectionId: string;
  exchange: string;
  label: string;
  symbol: string;
  base: string;
  side: "long" | "short";
  size: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  openedAt: number | null;
  closedAt: number;
  pnlUsd: number;
  exact: boolean;
}

export interface StatsGroup {
  key: string;
  label: string;
  exchange?: string;
  pnlUsd: number;
  count: number;
  wins: number;
  /** Close time of the group's latest trade. */
  lastAt: number;
}

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: STATS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-29" for a moment, as a Kyiv calendar day. */
export function kyivDay(at: number): string {
  return dayFormat.format(new Date(at));
}

/** The moment a Kyiv calendar day starts (DST-safe: the offset is read for that very day). */
export function kyivDayStart(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Kyiv is UTC+2 or +3; the local midnight is the instant whose Kyiv day is `day` at 00:00.
  for (const offsetHours of [3, 2]) {
    const at = utcMidnight - offsetHours * 3_600_000;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: STATS_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(at));
    if (kyivDay(at) === day && Number(parts) === 0) return at;
  }
  return utcMidnight - 2 * 3_600_000;
}

export type StatsPeriod = "today" | "7d" | "30d" | "all";

/** Start of a period counted in Kyiv days (today = since midnight; 7d = today and 6 days before). */
export function periodStart(period: StatsPeriod, now = Date.now()): number | null {
  if (period === "all") return null;
  const days = period === "today" ? 0 : period === "7d" ? 6 : 29;
  return kyivDayStart(kyivDay(now - days * DAY_MS));
}

function group(
  trades: StatsTrade[],
  key: (t: StatsTrade) => string,
  label: (t: StatsTrade) => string,
  exchange?: (t: StatsTrade) => string,
): StatsGroup[] {
  const groups = new Map<string, StatsGroup>();
  for (const t of trades) {
    const k = key(t);
    const g = groups.get(k) ?? {
      key: k,
      label: label(t),
      ...(exchange ? { exchange: exchange(t) } : {}),
      pnlUsd: 0,
      count: 0,
      wins: 0,
      lastAt: 0,
    };
    g.lastAt = Math.max(g.lastAt, t.closedAt);
    g.pnlUsd += t.pnlUsd;
    g.count += 1;
    if (t.pnlUsd > 0) g.wins += 1;
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd));
}

export function tradeStats(trades: StatsTrade[], from: number | null, now = Date.now()) {
  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd < 0);
  const sum = (list: StatsTrade[]) => list.reduce((total, t) => total + t.pnlUsd, 0);
  const durations = trades
    .filter((t) => t.openedAt !== null && t.closedAt > t.openedAt)
    .map((t) => t.closedAt - t.openedAt!);
  const sorted = [...trades].sort((a, b) => b.pnlUsd - a.pnlUsd);

  // Every day of the range gets a bar, empty days included; "all" starts at the first trade.
  const first = from ?? (trades.length ? Math.min(...trades.map((t) => t.closedAt)) : now);
  const byDay = new Map<string, { day: string; pnlUsd: number; count: number }>();
  for (let at = first; kyivDay(at) <= kyivDay(now) && byDay.size < 400; at += DAY_MS) {
    const day = kyivDay(at);
    if (!byDay.has(day)) byDay.set(day, { day, pnlUsd: 0, count: 0 });
  }
  for (const t of trades) {
    const day = kyivDay(t.closedAt);
    const bucket = byDay.get(day) ?? { day, pnlUsd: 0, count: 0 };
    bucket.pnlUsd += t.pnlUsd;
    bucket.count += 1;
    byDay.set(day, bucket);
  }
  let running = 0;
  const days = [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ ...d, cumulativeUsd: (running += d.pnlUsd) }));

  return {
    summary: {
      totalUsd: sum(trades),
      count: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? wins.length / trades.length : null,
      avgWinUsd: wins.length ? sum(wins) / wins.length : null,
      avgLossUsd: losses.length ? sum(losses) / losses.length : null,
      best: sorted[0] && sorted[0].pnlUsd > 0 ? sorted[0] : null,
      worst: sorted.at(-1) && sorted.at(-1)!.pnlUsd < 0 ? sorted.at(-1)! : null,
      avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      approximate: trades.filter((t) => !t.exact).length,
    },
    days,
    byExchange: group(trades, (t) => t.exchange, (t) => t.exchange),
    byAccount: group(trades, (t) => t.connectionId, (t) => t.label, (t) => t.exchange),
    byCoin: group(trades, (t) => t.base, (t) => t.base),
  };
}
