import { TriggerDirection, TriggerType } from "@prisma/client";

/** A price alert as the VM keeps it in memory between database windows. */
export interface EngineTrigger {
  id: string;
  userId: string;
  tokenId: string;
  tokenSymbol: string;
  tokenName: string;
  triggerType: TriggerType;
  threshold: number;
  targetPrice: number | null;
  direction: TriggerDirection;
  /** Minutes the percent change is measured over. */
  interval: number;
  lastPrice: number | null;
}

export type Firing =
  | { kind: "percent"; trigger: EngineTrigger; price: number; delta: number }
  | { kind: "target"; trigger: EngineTrigger; price: number };

type Sample = { at: number; price: number };

/** Recent prices per token, long enough for the longest percent interval. */
export class PriceHistory {
  private readonly samples = new Map<string, Sample[]>();

  add(tokenId: string, at: number, price: number) {
    if (!(price > 0)) return;
    const list = this.samples.get(tokenId) ?? [];
    const last = list.at(-1);
    if (last && last.at >= at) return;
    list.push({ at, price });
    this.samples.set(tokenId, list);
  }

  /** The oldest sample at or after `since`, which is the start of the measured window. */
  firstSince(tokenId: string, since: number): Sample | undefined {
    return this.samples.get(tokenId)?.find((sample) => sample.at >= since);
  }

  latest(tokenId: string): Sample | undefined {
    return this.samples.get(tokenId)?.at(-1);
  }

  prune(before: number) {
    for (const [tokenId, list] of this.samples) {
      const kept = list.filter((sample) => sample.at >= before);
      if (kept.length) this.samples.set(tokenId, kept);
      else this.samples.delete(tokenId);
    }
  }
}

function directionMatches(direction: TriggerDirection, delta: number) {
  if (direction === TriggerDirection.UP) return delta > 0;
  if (direction === TriggerDirection.DOWN) return delta < 0;
  return delta !== 0;
}

/**
 * Checks every trigger against the newest prices. A percent trigger fires as soon as the price
 * moved by its threshold within its interval (sliding window, not fixed checkpoints) and then
 * measures again from the moment it fired. A price target fires once when the price crosses it.
 */
export class TriggerEngine {
  private triggers: EngineTrigger[] = [];
  /** Percent triggers: when they last fired, so one move is reported once. */
  private readonly firedAt = new Map<string, number>();
  /** Price targets: the price seen on the previous check. */
  private readonly previous = new Map<string, number>();

  constructor(private readonly history = new PriceHistory()) {}

  get size() {
    return this.triggers.length;
  }

  tokenIds(): string[] {
    return [...new Set(this.triggers.map((trigger) => trigger.tokenId))];
  }

  symbolOf(tokenId: string): string | undefined {
    return this.triggers.find((trigger) => trigger.tokenId === tokenId)?.tokenSymbol;
  }

  /** Replaces the rules; state of triggers that still exist is kept. */
  load(triggers: EngineTrigger[]) {
    const ids = new Set(triggers.map((trigger) => trigger.id));
    for (const id of [...this.firedAt.keys()]) if (!ids.has(id)) this.firedAt.delete(id);
    for (const id of [...this.previous.keys()]) if (!ids.has(id)) this.previous.delete(id);
    for (const trigger of triggers)
      if (
        trigger.triggerType === TriggerType.PRICE_TARGET &&
        !this.previous.has(trigger.id) &&
        trigger.lastPrice !== null
      )
        this.previous.set(trigger.id, trigger.lastPrice);
    this.triggers = triggers;
  }

  /** Records prices taken at `now` and returns the triggers that fire. */
  check(prices: Map<string, number>, now: number): Firing[] {
    for (const [tokenId, price] of prices) this.history.add(tokenId, now, price);
    const longest = Math.max(15, ...this.triggers.map((trigger) => trigger.interval));
    this.history.prune(now - longest * 60_000);

    const firings: Firing[] = [];
    for (const trigger of this.triggers) {
      const price = prices.get(trigger.tokenId);
      if (!(price !== undefined && price > 0)) continue;

      if (trigger.triggerType === TriggerType.PRICE_TARGET) {
        const before = this.previous.get(trigger.id);
        this.previous.set(trigger.id, price);
        const target = trigger.targetPrice;
        if (before === undefined || target === null) continue;
        const up =
          trigger.direction !== TriggerDirection.DOWN && before < target && price >= target;
        const down =
          trigger.direction !== TriggerDirection.UP && before > target && price <= target;
        if (up || down) firings.push({ kind: "target", trigger, price });
        continue;
      }

      const windowStart = Math.max(
        now - trigger.interval * 60_000,
        this.firedAt.get(trigger.id) ?? 0,
      );
      const baseline = this.history.firstSince(trigger.tokenId, windowStart);
      if (!baseline || baseline.at >= now) continue;
      const delta = ((price - baseline.price) / baseline.price) * 100;
      if (Math.abs(delta) >= trigger.threshold && directionMatches(trigger.direction, delta)) {
        this.firedAt.set(trigger.id, now);
        firings.push({ kind: "percent", trigger, price, delta });
      }
    }
    // A reached target is one-shot: it leaves the active set at once.
    const reached = new Set(
      firings.filter((firing) => firing.kind === "target").map((firing) => firing.trigger.id),
    );
    if (reached.size) this.triggers = this.triggers.filter((trigger) => !reached.has(trigger.id));
    return firings;
  }

  /** Newest known price per trigger, written to the database once per window for the UI. */
  latestPrices(): Map<string, number> {
    const result = new Map<string, number>();
    for (const trigger of this.triggers) {
      const latest = this.history.latest(trigger.tokenId);
      if (latest) result.set(trigger.id, latest.price);
    }
    return result;
  }
}
