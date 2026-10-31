import type { OpenPosition } from "@/lib/exchanges/types";
import type { PositionAlertSettings } from "./alert-settings";

/**
 * Position events from consecutive polls of one connection, kept in memory (POSITION_ALERTS.md §3).
 * Opening and closing come from comparing position sets; liquidation distance and the PnL sign
 * re-arm only after moving back past the threshold with a margin, so a value hovering at the line
 * does not send a message every poll.
 */
export type WatchedPosition = Pick<
  OpenPosition,
  | "positionKey"
  | "symbol"
  | "base"
  | "settle"
  | "side"
  | "baseSize"
  | "notionalUsd"
  | "entryPrice"
  | "markPrice"
  | "liquidationPrice"
  | "leverage"
  | "margin"
  | "unrealizedPnlUsd"
> & {
  accountKey: string;
  /** Settle-currency PnL and cycle accounting, when the poll has them (not stored rows). */
  unrealizedPnl?: string | null;
  funding?: OpenPosition["funding"];
};

export type PositionEvent =
  | { kind: "opened"; position: WatchedPosition }
  /**
   * `pnlUsd`: the last observed unrealized PnL plus what the cycle already realized (partial closes,
   * funding, fees) when the exchange history is complete (`includesCosts`). Only the last seconds
   * before the close and its own fee are missing. `durationMs` is null when the opening is unknown.
   */
  | {
      kind: "closed";
      position: WatchedPosition;
      pnlUsd: number | null;
      includesCosts: boolean;
      durationMs: number | null;
      /** The figure came from the exchange's ledger after the close, not from the last poll. */
      exact?: boolean;
      /** The final figure came from fills: fees are in it, funding is not. */
      withoutFunding?: boolean;
      /**
       * Prices, size and times are the exchange's own trade. Until then `markPrice` is only the last
       * polled mark and the times are when the worker saw the close.
       */
      fromTrade?: boolean;
      /** The exchange's moment of the close, when `fromTrade`. */
      closedAt?: number;
    }
  | { kind: "liquidation"; position: WatchedPosition; distancePercent: number }
  | {
      kind: "pnlSign";
      position: WatchedPosition;
      positive: boolean;
      pnlUsd: number;
    };

/** A liquidation alert fires again only after the distance grows this much past the threshold. */
export const LIQUIDATION_REARM_PERCENT = 3;
/**
 * The PnL sign changes only after moving this share of the margin away from zero (about a 0.5%
 * price move at 10x), so cents of noise on a small position do not flip it back and forth.
 */
export const PNL_SIGN_BAND = 0.05;
/** Without a known margin: this share of the position size. */
export const PNL_SIGN_NOTIONAL_BAND = 0.005;
/** One rule fires at most once per this interval for the same position. */
export const MIN_REPEAT_MS = 5 * 60_000;

type Tracked = {
  position: WatchedPosition;
  liquidationArmed: boolean;
  sign: -1 | 0 | 1;
  firedAt: Partial<Record<PositionEvent["kind"], number>>;
  /** When the position opened: the exchange's cycle start, else the poll that first saw it. */
  openedAt: number | null;
};

/** Cycle start reported by the exchange history, when known. */
const cycleStart = (p: WatchedPosition) =>
  typeof p.funding?.since === "number" && p.funding.since > 0
    ? p.funding.since
    : null;

/**
 * Closed result in USD: unrealized PnL plus the cycle's realized PnL, funding and fees when the
 * history is complete. Settle-currency amounts use the position's own PnL rate (else 1:1).
 */
export function closedResult(p: WatchedPosition): {
  pnlUsd: number | null;
  includesCosts: boolean;
} {
  const unrealized = num(p.unrealizedPnlUsd);
  if (unrealized === null) return { pnlUsd: null, includesCosts: false };
  const f = p.funding;
  const realized = num(f?.realizedPnl),
    funding = num(f?.amount),
    fees = num(f?.tradingFees);
  if (
    f?.status !== "complete" ||
    realized === null ||
    funding === null ||
    fees === null
  )
    return { pnlUsd: unrealized, includesCosts: false };
  const native = num(p.unrealizedPnl);
  const rate = native !== null && native !== 0 ? unrealized / native : 1;
  return {
    pnlUsd: unrealized + (realized + funding - fees) * rate,
    includesCosts: true,
  };
}

const num = (value: string | null | undefined) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Distance from mark to liquidation price, as a percentage of the mark price. */
export function liquidationDistance(p: WatchedPosition): number | null {
  const mark = num(p.markPrice),
    liquidation = num(p.liquidationPrice);
  if (mark === null || liquidation === null || mark <= 0 || liquidation <= 0)
    return null;
  return (Math.abs(mark - liquidation) / mark) * 100;
}

/** Confirmed PnL sign: zero while inside the band around zero. */
export function pnlSign(p: WatchedPosition): -1 | 0 | 1 {
  const pnl = num(p.unrealizedPnlUsd);
  if (pnl === null) return 0;
  const margin = num(p.margin),
    notional = num(p.notionalUsd);
  const band =
    margin !== null && margin > 0
      ? margin * PNL_SIGN_BAND
      : notional !== null
        ? Math.abs(notional) * PNL_SIGN_NOTIONAL_BAND
        : 0;
  return pnl > band ? 1 : pnl < -band ? -1 : 0;
}

/** Same position key but the other side (one-way mode flip): a close and a new open. */
const identity = (p: WatchedPosition) =>
  `${p.accountKey}:${p.positionKey}:${p.side}`;

export class PositionWatch {
  private connections = new Map<string, Map<string, Tracked>>();

  /** Whether this connection already has a base to compare with. */
  has(connectionId: string) {
    return this.connections.has(connectionId);
  }

  /**
   * Sets the base without events: positions stored before a restart, or the first poll. A position
   * already near liquidation at this point does not alert until it moves away and back.
   */
  baseline(
    connectionId: string,
    positions: WatchedPosition[],
    liquidationPercent: number,
  ) {
    const tracked = new Map<string, Tracked>();
    for (const position of positions) {
      const distance = liquidationDistance(position);
      tracked.set(identity(position), {
        position,
        liquidationArmed: distance === null || distance >= liquidationPercent,
        sign: pnlSign(position),
        firedAt: {},
        openedAt: cycleStart(position),
      });
    }
    this.connections.set(connectionId, tracked);
  }

  forget(connectionId: string) {
    this.connections.delete(connectionId);
  }

  /**
   * Compares a poll with the previous state. Only accounts whose positions were actually read are
   * compared: a failed or skipped account never turns into "closed" events.
   */
  observe(
    connectionId: string,
    accounts: { accountKey: string; positions?: OpenPosition[] }[],
    settings: PositionAlertSettings,
    now = Date.now(),
  ): PositionEvent[] {
    const read = accounts.filter((a) => a.positions !== undefined);
    const current = read.flatMap((a) =>
      a.positions!.map(
        (p): WatchedPosition => ({ ...p, accountKey: a.accountKey }),
      ),
    );
    const previous = this.connections.get(connectionId);
    if (!previous) {
      this.baseline(connectionId, current, settings.liquidationPercent);
      return [];
    }
    const events: PositionEvent[] = [];
    const readAccounts = new Set(read.map((a) => a.accountKey));
    const next = new Map<string, Tracked>();
    // Accounts that were not read this time keep their previous positions untouched.
    for (const [key, tracked] of previous)
      if (!readAccounts.has(tracked.position.accountKey))
        next.set(key, tracked);

    for (const position of current) {
      const key = identity(position);
      const before = previous.get(key);
      const distance = liquidationDistance(position);
      const sign = pnlSign(position);
      if (!before) {
        if (settings.opened) events.push({ kind: "opened", position });
        next.set(key, {
          position,
          liquidationArmed: true,
          sign,
          firedAt: {},
          openedAt: cycleStart(position) ?? now,
        });
        // A position opened already inside the liquidation threshold is worth a message too.
        if (distance === null) continue;
      }
      const tracked = before ?? next.get(key)!;
      tracked.position = position;
      tracked.openedAt ??= cycleStart(position);
      next.set(key, tracked);
      const allowed = (kind: PositionEvent["kind"]) =>
        now - (tracked.firedAt[kind] ?? -Infinity) >= MIN_REPEAT_MS;

      if (distance !== null) {
        if (
          distance < settings.liquidationPercent &&
          tracked.liquidationArmed
        ) {
          if (settings.liquidation && allowed("liquidation")) {
            events.push({
              kind: "liquidation",
              position,
              distancePercent: distance,
            });
            tracked.firedAt.liquidation = now;
          }
          tracked.liquidationArmed = false;
        } else if (
          distance >=
          settings.liquidationPercent + LIQUIDATION_REARM_PERCENT
        )
          tracked.liquidationArmed = true;
      }

      if (sign !== 0 && sign !== tracked.sign) {
        if (
          before &&
          tracked.sign !== 0 &&
          settings.pnlSign &&
          allowed("pnlSign")
        ) {
          events.push({
            kind: "pnlSign",
            position,
            positive: sign > 0,
            pnlUsd: num(position.unrealizedPnlUsd) ?? 0,
          });
          tracked.firedAt.pnlSign = now;
        }
        tracked.sign = sign;
      }
    }

    for (const [key, tracked] of previous)
      if (
        readAccounts.has(tracked.position.accountKey) &&
        !next.has(key) &&
        settings.closed
      )
        events.push({
          kind: "closed",
          position: tracked.position,
          ...closedResult(tracked.position),
          durationMs:
            tracked.openedAt === null
              ? null
              : Math.max(0, now - tracked.openedAt),
        });

    this.connections.set(connectionId, next);
    return events;
  }
}
