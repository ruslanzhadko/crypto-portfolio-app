/**
 * Venues name a fill's direction in English ("Open Long", "Close Short", "Long > Short", "Buy").
 * Known ones map to a `TradeDirection` message key; anything new is shown as the venue wrote it.
 */
const KEYS = {
  'open long': 'openLong',
  'close long': 'closeLong',
  'open short': 'openShort',
  'close short': 'closeShort',
  'long > short': 'longToShort',
  'short > long': 'shortToLong',
  buy: 'buy',
  sell: 'sell',
} as const;

export type TradeDirectionKey = (typeof KEYS)[keyof typeof KEYS];

export function tradeDirectionKey(direction: string): TradeDirectionKey | null {
  return KEYS[direction.trim().toLowerCase() as keyof typeof KEYS] ?? null;
}

export function tradeDirectionLabel(direction: string, translate: (key: TradeDirectionKey) => string): string {
  const key = tradeDirectionKey(direction);
  return key ? translate(key) : direction;
}
