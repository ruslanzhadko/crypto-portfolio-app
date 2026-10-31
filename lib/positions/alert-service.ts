import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { positionsComplete, safeError, type SyncResult } from "@/lib/exchanges/types";
import type { ClosedInput } from "@/lib/exchanges/closed-result";
import { clientVersion, connectionClient } from "@/lib/exchanges/worker";
import {
  anyPositionAlert,
  DEFAULT_POSITION_ALERTS,
  readPositionAlertSettings,
  type PositionAlertSettings,
} from "./alert-settings";
import {
  HISTORY_EXCHANGES,
  reconcileEstimatedTrades,
  saveClosedTrades,
  syncClosedTrades,
} from "@/lib/exchanges/closed-trades";
import {
  deliverPositionEvents,
  reviseDeliveredEvent,
  type DeliveredMessage,
  type SourcedEvent,
} from "./delivery";
import { PositionWatch, type WatchedPosition } from "./watch";

/** Target poll interval per connection (POSITION_ALERTS.md §3: 15 s, never slower than 30 s). */
export const ALERT_POLL_MS = 15_000;
/** After a rate limit or a failed read the exchange or connection is polled this rarely. */
const SLOW_POLL_MS = 60_000;
const RATE_LIMIT_PAUSE_MS = 5 * 60_000;
/** A sync job that just read the positions counts as this poll. */
const FRESH_MS = 12_000;
const WINDOW_MS = 30 * 60_000;
/** The ledger is read this long after a close is seen, and again until the deadline. */
const EXACT_DELAY_MS = 20_000;
const EXACT_DEADLINE_MS = 2 * 60_000;
/** The closing trade needs a moment to show up in the exchange's position history. */
const IMPORT_DELAY_MS = 60_000;
/** A close that went out as an estimate is checked again this long after it was seen. */
const RECHECK_DELAYS_MS = [2 * 60_000, 10 * 60_000, 30 * 60_000];
/** Fills read before a position's opening, so its first fill is inside the range. */
const RECHECK_MARGIN_MS = 60 * 60_000;
/** A position whose opening is unknown (seen before a restart) is looked for this far back. */
const RECHECK_UNKNOWN_OPEN_MS = 7 * 86_400_000;
/** Exchange clocks may run a little apart from the polls around the close. */
const RECHECK_SKEW_MS = 5_000;
/** A close found right after a restart happened at most about this long ago (the worker's downtime). */
const RESTART_WINDOW_MS = 10 * 60_000;
const ENTRY_TOLERANCE = 0.005;

export type Connection = Prisma.ExchangeConnectionGetPayload<{
  include: { wallet: true };
}>;
type Watched = {
  row: Connection;
  nextAt: number;
  observedAt: number;
  /** The last read, for the bot's /positions; only a recent complete one is reused. */
  latest?: SyncResult;
  /** The user wants position alerts from this connection: it is polled every 15 s. */
  alerts: boolean;
  /** Closes are stored for trading statistics (exchanges without a position history). */
  record: boolean;
};

type ClosedEvent = Extract<SourcedEvent, { kind: "closed" }>;
/** A close still at its estimate. In memory: a restart leaves the estimate as it is. */
type Recheck = {
  userId: string;
  row: Connection;
  event: ClosedEvent;
  since: number | null;
  lastSeenAt: number;
  otherLeg: boolean;
  closedAt: number;
  record: boolean;
  step: number;
  dueAt: number;
  delivered?: { message: DeliveredMessage; batch: SourcedEvent[] };
};

const sameEntry = (a: unknown, b: unknown) => {
  const x = Number(a),
    y = Number(b);
  return !(x > 0 && y > 0) || Math.abs(x / y - 1) <= ENTRY_TOLERANCE;
};

/** The figure in USD at the rate of the position's own PnL (1:1 without one). */
function applyExact(event: ClosedEvent, exact: string) {
  const p = event.position;
  const usd = Number(p.unrealizedPnlUsd),
    native = Number(p.unrealizedPnl);
  const rate =
    Number.isFinite(usd) && Number.isFinite(native) && native !== 0
      ? usd / native
      : 1;
  event.pnlUsd = Number(exact) * rate;
  event.includesCosts = true;
  event.exact = true;
}

export const WATCHED_STATUSES = ["PENDING", "ACTIVE", "PARTIAL", "ERROR"];

const text = (value: { toString(): string } | null) =>
  value === null ? null : value.toString();

/**
 * Background position polling for users with position alerts on. Runs inside the exchange worker
 * loop: positions are read from the exchanges and compared in memory; PostgreSQL is read when the
 * settings are (re)loaded and written only when an alert fires or a position closes.
 *
 * Connections of exchanges without a position history are also watched for everyone, without
 * extra polling (only what the sync jobs read), so their closes reach the trading statistics.
 */
export class PositionAlertService {
  private watch = new PositionWatch();
  private settings = new Map<string, PositionAlertSettings>();
  private connections = new Map<string, Watched>();
  private slowUntil = new Map<string, number>();
  private verified = new WeakSet<object>();
  private pending = new Map<string, SourcedEvent[]>();
  /** Key version each connection's base was read with. */
  private versions = new Map<string, number>();
  private closing: {
    userId: string;
    event: SourcedEvent;
    row: Connection;
    input: ClosedInput;
    accountKey: string;
    closedAt: number;
    deliver: boolean;
    record: boolean;
    dueAt: number;
    deadline: number;
  }[] = [];
  /** Connections whose exchange history is read again soon after a close was seen there. */
  private imports = new Map<string, { row: Connection; dueAt: number }>();
  private rechecks: Recheck[] = [];
  private reconciled = false;
  /** Positions stored before a restart that turned out closed: the old worker may have handled them. */
  private restartCloses: {
    userId: string;
    row: Connection;
    event: ClosedEvent;
    otherLeg: boolean;
    closedAt: number;
    deliver: boolean;
    record: boolean;
  }[] = [];
  private loadedWindow = -1;
  private version: number | null = null;

  /** Connections polled for alerts; the record-only ones need no polling. */
  get size() {
    return [...this.connections.values()].filter((w) => w.alerts).length;
  }

  /** Reloads settings once per window and when the site signals a change. */
  async maybeReload(version: number | null, now = Date.now()) {
    const window = Math.floor(now / WINDOW_MS);
    const changed = version !== null && version !== this.version;
    if (version !== null) this.version = version;
    if (window === this.loadedWindow && !changed) return false;
    this.loadedWindow = window;
    await this.reload(now);
    return true;
  }

  async reload(now = Date.now()) {
    const users = await prisma.user.findMany({
      where: { isBlocked: false, positionAlerts: { not: Prisma.DbNull } },
      select: { id: true, positionAlerts: true },
    });
    this.settings = new Map(
      users
        .map(
          (u) => [u.id, readPositionAlertSettings(u.positionAlerts)] as const,
        )
        .filter(([id, s]) => anyPositionAlert(s) && exchangesEnabled(id)),
    );
    const rows = (
      await prisma.exchangeConnection.findMany({
        where: {
          status: { in: WATCHED_STATUSES },
          user: { isBlocked: false },
          OR: [
            { userId: { in: [...this.settings.keys()] } },
            { exchange: { notIn: [...HISTORY_EXCHANGES] } },
          ],
        },
        include: { wallet: true },
      })
    ).filter((r) => exchangesEnabled(r.userId));
    const alertsOn = (r: Connection) =>
      this.settings.has(r.userId) &&
      !this.settings.get(r.userId)!.excludedConnections.includes(r.id);
    const wanted = rows.filter(
      (r) => alertsOn(r) || !HISTORY_EXCHANGES.has(r.exchange),
    );
    const wantedIds = new Set(wanted.map((r) => r.id));
    for (const id of this.connections.keys())
      if (!wantedIds.has(id)) {
        this.connections.delete(id);
        this.watch.forget(id);
      }
    // Positions stored before a restart are the base, so they are not reported as just opened.
    // A connection never read successfully has no stored positions yet: its first read becomes the
    // base (watch.observe without a base), so positions it already had are not reported as opened.
    const fresh = wanted.filter(
      (r) => !this.watch.has(r.id) && r.lastSuccessAt !== null,
    );
    if (fresh.length) {
      const stored = await prisma.exchangePosition.findMany({
        where: { account: { connectionId: { in: fresh.map((r) => r.id) } } },
        include: {
          account: { select: { connectionId: true, accountKey: true } },
        },
      });
      for (const r of fresh) {
        const positions: WatchedPosition[] = stored
          .filter((p) => p.account.connectionId === r.id)
          .map((p) => ({
            accountKey: p.account.accountKey,
            positionKey: p.positionKey,
            symbol: p.symbol,
            base: p.base,
            settle: p.settle,
            side: p.side === "short" ? "short" : "long",
            baseSize: p.baseSize.toString(),
            notionalUsd: text(p.notionalUsd),
            entryPrice: text(p.entryPrice),
            markPrice: text(p.markPrice),
            liquidationPrice: text(p.liquidationPrice),
            leverage: text(p.leverage),
            margin: text(p.margin),
            unrealizedPnlUsd: text(p.unrealizedPnlUsd),
          }));
        this.watch.baseline(
          r.id,
          positions,
          (this.settings.get(r.userId) ?? DEFAULT_POSITION_ALERTS)
            .liquidationPercent,
        );
      }
    }
    for (const row of wanted) {
      const known = this.connections.get(row.id);
      this.connections.set(row.id, {
        row,
        nextAt: known?.nextAt ?? now,
        observedAt: known?.observedAt ?? Number.NEGATIVE_INFINITY,
        latest: known?.latest,
        alerts: alertsOn(row),
        record: !HISTORY_EXCHANGES.has(row.exchange),
      });
    }
    console.log(
      `[position-alerts] ${this.settings.size} user(s), ${this.size} connection(s) polled, ${this.connections.size} watched`,
    );
  }

  /** Called with every result the worker reads, from the sync jobs and from this poller. */
  observe(
    c: { id: string; userId: string; credentialVersion?: number },
    result: SyncResult,
    at = Date.now(),
  ) {
    const watched = this.connections.get(c.id);
    if (!watched) return;
    const userSettings = watched.alerts
      ? (this.settings.get(c.userId) ?? DEFAULT_POSITION_ALERTS)
      : DEFAULT_POSITION_ALERTS;
    // Closes are always tracked where they are recorded; whether they are sent is decided below.
    // Closes are always tracked: they feed the statistics even when no alert is sent for them.
    const settings = { ...userSettings, closed: true };
    // A replaced key can read the same positions under other IDs (Aster: wallet RPC → API):
    // start a fresh base instead of reporting every position closed and opened again.
    if (c.credentialVersion !== undefined) {
      const known = this.versions.get(c.id);
      this.versions.set(c.id, c.credentialVersion);
      if (known !== undefined && known !== c.credentialVersion)
        this.watch.forget(c.id);
    }
    const lastSeenAt = watched.observedAt;
    watched.observedAt = at;
    watched.latest = result;
    const events = this.watch.observe(c.id, result.accounts, settings, at);
    if (!events.length) return;
    const source = { label: watched.row.label, exchange: watched.row.exchange };
    const openSymbols = new Set(
      result.accounts.flatMap((a) => (a.positions ?? []).map((p) => p.symbol)),
    );
    const now: SourcedEvent[] = [];
    for (const event of events) {
      const since = event.position.funding?.since;
      const deliver = event.kind !== "closed" || userSettings.closed;
      const record = event.kind === "closed" && watched.record;
      // Exchanges with a position history: read it a minute after the close, not at the next sync.
      if (event.kind === "closed" && !watched.record)
        this.imports.set(c.id, { row: watched.row, dueAt: at + IMPORT_DELAY_MS });
      if (!deliver && !record) continue;
      // A close with a known cycle start waits for the exchange's own final figure.
      if (
        event.kind === "closed" &&
        typeof since === "number" &&
        since > 0 &&
        lastSeenAt > 0
      )
        this.closing.push({
          userId: c.userId,
          event: { ...event, source },
          row: watched.row,
          input: {
            symbol: event.position.symbol,
            base: event.position.base,
            settle: event.position.settle,
            positionKey: event.position.positionKey,
            since,
            lastSeenAt,
            otherLeg: openSymbols.has(event.position.symbol),
          },
          accountKey: event.position.accountKey,
          closedAt: at,
          deliver,
          record,
          dueAt: at + EXACT_DELAY_MS,
          deadline: at + EXACT_DEADLINE_MS,
        });
      else if (event.kind === "closed" && lastSeenAt <= 0)
        this.restartCloses.push({
          userId: c.userId,
          row: watched.row,
          event: { ...event, source },
          otherLeg: openSymbols.has(event.position.symbol),
          closedAt: at,
          deliver,
          record,
        });
      else {
        const sourced = { ...event, source };
        if (record)
          void this.record(watched.row, sourced as ClosedEvent, null, at);
        if (deliver) now.push(sourced);
        // Too short for a known cycle start, so nothing waited for the exchange's figure.
        if (event.kind === "closed")
          this.scheduleRecheck({
            userId: c.userId,
            row: watched.row,
            event: sourced as ClosedEvent,
            since: null,
            lastSeenAt,
            otherLeg: openSymbols.has(event.position.symbol),
            closedAt: at,
            record,
          });
      }
    }
    if (now.length)
      this.pending.set(c.userId, [
        ...(this.pending.get(c.userId) ?? []),
        ...now,
      ]);
  }

  /**
   * Closed positions waiting for the exact result from the exchange ledger. Exchanges without a
   * reader, an unattributable close or no answer by the deadline keep the estimate.
   */
  /** Reads the position history of connections where a close was seen a minute ago. */
  async importClosed(now = Date.now()) {
    for (const [id, item] of [...this.imports]) {
      if (now < item.dueAt) continue;
      this.imports.delete(id);
      try {
        const client = await connectionClient(item.row);
        await syncClosedTrades(item.row, client.adapter, now, true);
      } catch {
        // The regular sync reads the history again within 30 minutes.
      }
    }
  }

  /**
   * A close already stored by the worker before the restart is not a new one: no second trade and no
   * second alert. Otherwise it goes out as an estimate (the position's stored figures) and is rechecked.
   */
  private async handleRestartCloses() {
    const found = this.restartCloses;
    this.restartCloses = [];
    for (const item of found) {
      const p = item.event.position;
      if (item.record) {
        const stored = await prisma.closedTrade.findMany({
          where: {
            connectionId: item.row.id,
            base: p.base,
            settle: p.settle,
            side: p.side,
            closedAt: {
              gte: new Date(item.closedAt - RESTART_WINDOW_MS),
              lte: new Date(item.closedAt),
            },
          },
          select: { entryPrice: true },
        });
        if (stored.some((t) => sameEntry(t.entryPrice, p.entryPrice))) continue;
        await this.record(item.row, item.event, null, item.closedAt);
      }
      if (item.deliver)
        this.pending.set(item.userId, [
          ...(this.pending.get(item.userId) ?? []),
          item.event,
        ]);
      this.scheduleRecheck({
        userId: item.userId,
        row: item.row,
        event: item.event,
        since: null,
        lastSeenAt: item.closedAt - RESTART_WINDOW_MS,
        otherLeg: item.otherLeg,
        closedAt: item.closedAt,
        record: item.record,
      });
    }
  }

  async resolveClosed(now = Date.now()) {
    await this.handleRestartCloses();
    const waiting = this.closing;
    this.closing = [];
    for (const item of waiting) {
      if (now < item.dueAt) {
        this.closing.push(item);
        continue;
      }
      let exact: string | null = null;
      let supported = true;
      try {
        const client = await connectionClient(item.row);
        if (client.adapter.closedResult)
          exact = await client.adapter.closedResult(item.input);
        else supported = false;
      } catch {
        // Treated as "not yet": retried until the deadline.
      }
      if (exact === null && supported && now < item.deadline) {
        item.dueAt = now + EXACT_DELAY_MS;
        this.closing.push(item);
        continue;
      }
      const event = item.event;
      if (exact !== null && event.kind === "closed") applyExact(event, exact);
      if (item.record && event.kind === "closed")
        await this.record(item.row, event, exact, item.closedAt);
      if (item.deliver)
        this.pending.set(item.userId, [
          ...(this.pending.get(item.userId) ?? []),
          event,
        ]);
      if (exact === null && event.kind === "closed")
        this.scheduleRecheck({
          userId: item.userId,
          row: item.row,
          event,
          since: item.input.since,
          lastSeenAt: item.input.lastSeenAt,
          otherLeg: item.input.otherLeg,
          closedAt: item.closedAt,
          record: item.record,
        });
    }
  }

  private scheduleRecheck(item: Omit<Recheck, "step" | "dueAt">) {
    this.rechecks.push({
      ...item,
      step: 0,
      dueAt: item.closedAt + RECHECK_DELAYS_MS[0]!,
    });
  }

  /**
   * Estimates get the exchange's own figure later: the ledger where the cycle start is known, else
   * the trade rebuilt from fills. The alert, its log row and the statistics are corrected in place.
   * Reads the exchange a few times per close; writes to the database only when a figure arrives.
   */
  async recheckClosed(now = Date.now()): Promise<boolean> {
    const waiting = this.rechecks;
    this.rechecks = [];
    let changed = false;
    for (const item of waiting) {
      if (now < item.dueAt) {
        this.rechecks.push(item);
        continue;
      }
      const final = await this.finalResult(item, now).catch(() => null);
      if (final === null) {
        item.step += 1;
        const delay = RECHECK_DELAYS_MS[item.step];
        if (delay !== undefined) {
          item.dueAt = item.closedAt + delay;
          this.rechecks.push(item);
        }
        continue;
      }
      const before = item.event.pnlUsd;
      applyExact(item.event, final.pnl);
      item.event.withoutFunding = final.withoutFunding;
      console.log(
        `[position-alerts] final result ${item.row.exchange}: estimate ${before?.toFixed(2)}, exchange ${item.event.pnlUsd?.toFixed(2)}`,
      );
      if (item.record)
        await this.record(item.row, item.event, final.pnl, item.closedAt);
      if (item.delivered)
        await reviseDeliveredEvent(
          item.userId,
          item.event,
          item.delivered.batch,
          item.delivered.message,
        ).catch(() => {
          console.error("[position-alerts] final result: log not updated");
        });
      changed = true;
    }
    return changed;
  }

  /** Once per worker start, when the connections are loaded: see reconcileEstimatedTrades. */
  async reconcileEstimates(now = Date.now()): Promise<boolean> {
    if (this.reconciled || !this.connections.size) return false;
    this.reconciled = true;
    await reconcileEstimatedTrades(
      [...this.connections.values()].map((w) => w.row),
      async (id) => this.verifiedAdapter(this.connections.get(id)!.row),
      now,
    );
    return true;
  }

  /** A new client must be verified first: some adapters refuse to read otherwise. */
  private async verifiedAdapter(row: Connection) {
    const { adapter } = await connectionClient(row);
    if (!this.verified.has(adapter)) {
      await adapter.verify();
      this.verified.add(adapter);
    }
    return adapter;
  }

  private async finalResult(item: Recheck, now: number) {
    const adapter = await this.verifiedAdapter(item.row);
    const p = item.event.position;
    if (item.since !== null && adapter.closedResult) {
      const pnl = await adapter.closedResult({
        symbol: p.symbol,
        base: p.base,
        settle: p.settle,
        positionKey: p.positionKey,
        since: item.since,
        lastSeenAt: item.lastSeenAt,
        otherLeg: item.otherLeg,
      });
      if (pnl !== null) return { pnl, withoutFunding: false };
    }
    if (!adapter.closedTrades) return null;
    const duration = item.event.durationMs;
    const from =
      duration === null
        ? item.closedAt - RECHECK_UNKNOWN_OPEN_MS
        : item.closedAt - duration - RECHECK_MARGIN_MS;
    const matches = (await adapter.closedTrades(from, now)).filter(
      (t) =>
        t.base === p.base &&
        t.settle === p.settle &&
        t.side === p.side &&
        t.closedAt >= item.lastSeenAt - RECHECK_SKEW_MS &&
        t.closedAt <= item.closedAt + RECHECK_SKEW_MS &&
        sameEntry(t.entryPrice, p.entryPrice),
    );
    // Two trades between the same two polls cannot be told apart: the estimate stays.
    return matches.length === 1
      ? { pnl: matches[0]!.pnl, withoutFunding: true }
      : null;
  }

  /** Stores a close the worker saw; the exchange's figure when it came, else the estimate. */
  private async record(
    row: Connection,
    event: ClosedEvent,
    exact: string | null,
    closedAt: number,
  ) {
    const p = event.position;
    const pnl = exact ?? (event.pnlUsd === null ? null : String(event.pnlUsd));
    if (pnl === null || event.pnlUsd === null) return;
    const pnlUsd = event.pnlUsd;
    await saveClosedTrades(
      row,
      [
        {
          externalId: `watch:${p.accountKey}:${p.positionKey}:${closedAt}`,
          symbol: p.symbol,
          base: p.base,
          settle: p.settle,
          side: p.side,
          size: p.baseSize,
          entryPrice: p.entryPrice,
          exitPrice: p.markPrice,
          openedAt:
            event.durationMs === null ? null : closedAt - event.durationMs,
          closedAt,
          pnl,
        },
      ],
      "watch",
      exact !== null,
      () => pnlUsd,
    ).catch(() => {
      console.error("[position-alerts] closed trade not saved");
    });
  }

  /** Reads positions of every connection that is due; one at a time, like the sync jobs. */
  async pollDue(now = Date.now()) {
    for (const watched of this.connections.values()) {
      if (!watched.alerts || now < watched.nextAt) continue;
      const exchange = watched.row.exchange;
      const slow = (this.slowUntil.get(exchange) ?? 0) > now;
      const interval = slow ? SLOW_POLL_MS : ALERT_POLL_MS;
      // The key was replaced since the last load: reload the row before using it.
      if (
        (clientVersion(watched.row.id) ?? 0) > watched.row.credentialVersion
      ) {
        this.loadedWindow = -1;
        continue;
      }
      if (now - watched.observedAt < FRESH_MS) {
        watched.nextAt = watched.observedAt + interval;
        continue;
      }
      try {
        const client = await connectionClient(watched.row);
        client.touched = Date.now();
        // A new client must be verified first: some adapters learn the account mode there.
        if (!this.verified.has(client.adapter)) {
          await client.adapter.verify();
          this.verified.add(client.adapter);
        }
        const result = await client.adapter.fetch(false);
        this.observe(watched.row, result);
        const limited = result.failedAccounts.some(
          (a) => a.errorCode === "RATE_LIMIT",
        );
        if (limited) this.rateLimited(exchange, now);
        watched.nextAt = Date.now() + (limited ? SLOW_POLL_MS : interval);
      } catch (error) {
        const code = safeError(error);
        if (code === "RATE_LIMIT") this.rateLimited(exchange, now);
        watched.nextAt = Date.now() + SLOW_POLL_MS;
      }
    }
  }

  /**
   * Positions for the bot's /positions: the last poll when it is recent, otherwise one read of the
   * exchange (which also counts as this connection's alert poll). Null while the exchange is rate
   * limited or the read failed; the caller then shows the stored positions.
   */
  async readForView(row: Connection, now = Date.now()) {
    const watched = this.connections.get(row.id);
    if (
      watched?.latest &&
      now - watched.observedAt < ALERT_POLL_MS &&
      positionsComplete(watched.latest)
    )
      return { result: watched.latest, at: watched.observedAt };
    if ((this.slowUntil.get(row.exchange) ?? 0) > now) return null;
    try {
      const client = await connectionClient(row);
      client.touched = Date.now();
      if (!this.verified.has(client.adapter)) {
        await client.adapter.verify();
        this.verified.add(client.adapter);
      }
      const result = await client.adapter.fetch(false);
      const at = Date.now();
      this.observe(row, result, at);
      if (result.failedAccounts.some((a) => a.errorCode === "RATE_LIMIT"))
        this.rateLimited(row.exchange, now);
      return { result, at };
    } catch (error) {
      if (safeError(error) === "RATE_LIMIT") this.rateLimited(row.exchange, now);
      return null;
    }
  }

  private rateLimited(exchange: string, now: number) {
    if ((this.slowUntil.get(exchange) ?? 0) <= now)
      console.warn(
        `[position-alerts] ${exchange} rate limit; polling every 60 s for 5 minutes`,
      );
    this.slowUntil.set(exchange, now + RATE_LIMIT_PAUSE_MS);
  }

  /** Sends what the last polls found; returns the users who got alerts. */
  async flush(): Promise<string[]> {
    const batches = [...this.pending];
    this.pending.clear();
    const delivered: string[] = [];
    for (const [userId, events] of batches) {
      try {
        const message = await deliverPositionEvents(userId, events);
        delivered.push(userId);
        for (const item of this.rechecks)
          if (events.includes(item.event))
            item.delivered = { message, batch: events };
        console.log(
          `[position-alerts] ${events.map((e) => e.kind).join(",")} ${message.status}`,
        );
      } catch {
        console.error("[position-alerts] delivery failed; events dropped");
      }
    }
    return delivered;
  }
}
