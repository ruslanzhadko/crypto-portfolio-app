/**
 * Public trading page of a coin on the exchange that holds it (USDT pair). Spot and unified accounts
 * open the spot market; futures-only venues (Hyperliquid, Aster) their perpetual. Null for the quote
 * coin itself and for unknown exchanges.
 */
const QUOTE = "USDT";

const PAGES: Record<string, (base: string) => string> = {
  binance: (b) => `https://www.binance.com/en/trade/${b}_${QUOTE}?type=spot`,
  bybit: (b) => `https://www.bybit.com/en/trade/spot/${b}/${QUOTE}`,
  okx: (b) => `https://www.okx.com/trade-spot/${b.toLowerCase()}-${QUOTE.toLowerCase()}`,
  gate: (b) => `https://www.gate.com/trade/${b}_${QUOTE}`,
  bitget: (b) => `https://www.bitget.com/spot/${b}${QUOTE}`,
  bingx: (b) => `https://bingx.com/en/spot/${b}${QUOTE}/`,
  hyperliquid: (b) => `https://app.hyperliquid.xyz/trade/${b}`,
  aster: (b) => `https://www.asterdex.com/en/futures/v1/${b}${QUOTE}`,
};

export function exchangeTradeUrl(exchange: string, symbol: string): string | null {
  const base = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(base) || base === QUOTE) return null;
  return PAGES[exchange.toLowerCase()]?.(base) ?? null;
}
