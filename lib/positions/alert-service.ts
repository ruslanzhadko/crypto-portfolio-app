import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { safeError, type SyncResult } from "@/lib/exchanges/types";
import { clientVersion, connectionClient } from "@/lib/exchanges/worker";
import {
  anyPositionAlert,
  readPositionAlertSettings,
  type PositionAlertSettings,
} from "./alert-settings";
import { deliverPositionEvents, type SourcedEvent } from "./delivery";
import { PositionWatch, type WatchedPosition } from "./watch";

/** Target poll interval per connection (POSITION_ALERTS.md §3: 15 s, never slower than 30 s). */
export const ALERT_POLL_MS = 15_000;
/** After a rate limit or a failed read the exchange or connection is polled this rarely. */
const SLOW_POLL_MS = 60_000;
const RATE_LIMIT_PAUSE_MS = 5 * 60_000;
/** A sync job that just read the positions counts as this poll. */
const FRESH_MS = 12_000;
const WINDOW_MS = 30 * 60_000;

type Connection = Prisma.ExchangeConnectionGetPayload<{ include: { wallet: true } }>;
type Watched = { row: Connection; nextAt: number; observedAt: number };

const WATCHED_STATUSES = ["PENDING", "ACTIVE", "PARTIAL", "ERROR"];

const text = (value: { toString(): string } | null) => (value === null ? null : value.toString());

/**
 * Background position polling for users with position alerts on. Runs inside the exchange worker
 * loop: positions are read from the exchanges and compared in memory; PostgreSQL is read when the
 * settings are (re)loaded and written only when an alert fires.
 */
export class PositionAlertService {
  private watch = new PositionWatch();
  private settings = new Map<string, PositionAlertSettings>();
  private connections = new Map<string, Watched>();
  private slowUntil = new Map<string, number>();
  private verified = new WeakSet<object>();
  private pending = new Map<string, SourcedEvent[]>();
  private loadedWindow = -1;
  private version: number | null = null;

  get size() {
    return this.connections.size;
  }

  /** Reloads settings once per window and when the site signals a change. */
  async maybeReload(version: number | null, now = Date.now()) {
    const window = Math.floor(now / WINDOW_MS);
    const changed = version !== null && this.version !== null && version !== this.version;
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
        .map((u) => [u.id, readPositionAlertSettings(u.positionAlerts)] as const)
        .filter(([id, s]) => anyPositionAlert(s) && exchangesEnabled(id)),
    );
    const rows = this.settings.size
      ? await prisma.exchangeConnection.findMany({
          where: { userId: { in: [...this.settings.keys()] }, status: { in: WATCHED_STATUSES } },
          include: { wallet: true },
        })
      : [];
    const wanted = rows.filter(
      (r) => !this.settings.get(r.userId)!.excludedConnections.includes(r.id),
    );
    const wantedIds = new Set(wanted.map((r) => r.id));
    for (const id of this.connections.keys())
      if (!wantedIds.has(id)) {
        this.connections.delete(id);
        this.watch.forget(id);
      }
    // Positions stored before a restart are the base, so they are not reported as just opened.
    const fresh = wanted.filter((r) => !this.watch.has(r.id));
    if (fresh.length) {
      const stored = await prisma.exchangePosition.findMany({
        where: { account: { connectionId: { in: fresh.map((r) => r.id) } } },
        include: { account: { select: { connectionId: true, accountKey: true } } },
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
        this.watch.baseline(r.id, positions, this.settings.get(r.userId)!.liquidationPercent);
      }
    }
    for (const row of wanted) {
      const known = this.connections.get(row.id);
      this.connections.set(row.id, {
        row,
        nextAt: known?.nextAt ?? now,
        observedAt: known?.observedAt ?? Number.NEGATIVE_INFINITY,
      });
    }
    console.log(
      `[position-alerts] ${this.settings.size} user(s), ${this.connections.size} connection(s) watched`,
    );
  }

  /** Called with every result the worker reads, from the sync jobs and from this poller. */
  observe(c: { id: string; userId: string }, result: SyncResult, at = Date.now()) {
    const watched = this.connections.get(c.id);
    const settings = this.settings.get(c.userId);
    if (!watched || !settings) return;
    watched.observedAt = at;
    const events = this.watch.observe(c.id, result.accounts, settings, at);
    if (!events.length) return;
    const source = { label: watched.row.label, exchange: watched.row.exchange };
    this.pending.set(c.userId, [
      ...(this.pending.get(c.userId) ?? []),
      ...events.map((e) => ({ ...e, source })),
    ]);
  }

  /** Reads positions of every connection that is due; one at a time, like the sync jobs. */
  async pollDue(now = Date.now()) {
    for (const watched of this.connections.values()) {
      if (now < watched.nextAt) continue;
      const exchange = watched.row.exchange;
      const slow = (this.slowUntil.get(exchange) ?? 0) > now;
      const interval = slow ? SLOW_POLL_MS : ALERT_POLL_MS;
      // The key was replaced since the last load: reload the row before using it.
      if ((clientVersion(watched.row.id) ?? 0) > watched.row.credentialVersion) {
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
        const limited = result.failedAccounts.some((a) => a.errorCode === "RATE_LIMIT");
        if (limited) this.rateLimited(exchange, now);
        watched.nextAt = Date.now() + (limited ? SLOW_POLL_MS : interval);
      } catch (error) {
        const code = safeError(error);
        if (code === "RATE_LIMIT") this.rateLimited(exchange, now);
        watched.nextAt = Date.now() + SLOW_POLL_MS;
      }
    }
  }

  private rateLimited(exchange: string, now: number) {
    if ((this.slowUntil.get(exchange) ?? 0) <= now)
      console.warn(`[position-alerts] ${exchange} rate limit; polling every 60 s for 5 minutes`);
    this.slowUntil.set(exchange, now + RATE_LIMIT_PAUSE_MS);
  }

  /** Sends what the last polls found; returns the users who got alerts. */
  async flush(): Promise<string[]> {
    const batches = [...this.pending];
    this.pending.clear();
    const delivered: string[] = [];
    for (const [userId, events] of batches) {
      try {
        const status = await deliverPositionEvents(userId, events);
        delivered.push(userId);
        console.log(`[position-alerts] ${events.map((e) => e.kind).join(",")} ${status}`);
      } catch {
        console.error("[position-alerts] delivery failed; events dropped");
      }
    }
    return delivered;
  }
}
