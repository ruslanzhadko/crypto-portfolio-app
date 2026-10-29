/**
 * Public trading page of a coin on the exchange that holds it (USDT pair). Coins on a futures account
 * open the USDT perpetual, spot and unified accounts the spot market; Hyperliquid and Aster trade only
 * perpetuals. Null for the quote coin itself and for unknown exchanges.
 */
const QUOTE = "USDT";

const SPOT: Record<string, (base: string) => string> = {
  binance: (b) => `https://www.binance.com/en/trade/${b}_${QUOTE}?type=spot`,
  bybit: (b) => `https://www.bybit.com/en/trade/spot/${b}/${QUOTE}`,
  okx: (b) => `https://www.okx.com/trade-spot/${b.toLowerCase()}-usdt`,
  gate: (b) => `https://www.gate.com/trade/${b}_${QUOTE}`,
  bitget: (b) => `https://www.bitget.com/spot/${b}${QUOTE}`,
  kucoin: (b) => `https://www.kucoin.com/trade/${b}-${QUOTE}`,
  bingx: (b) => `https://bingx.com/en/spot/${b}${QUOTE}/`,
};

const FUTURES: Record<string, (base: string) => string> = {
  binance: (b) => `https://www.binance.com/en/futures/${b}${QUOTE}`,
  bybit: (b) => `https://www.bybit.com/trade/usdt/${b}${QUOTE}`,
  okx: (b) => `https://www.okx.com/trade-swap/${b.toLowerCase()}-usdt-swap`,
  gate: (b) => `https://www.gate.com/futures/${QUOTE}/${b}_${QUOTE}`,
  bitget: (b) => `https://www.bitget.com/futures/usdt/${b}${QUOTE}`,
  kucoin: (b) => `https://www.kucoin.com/trade/futures/${b === "BTC" ? "XBT" : b}${QUOTE}M`,
  bingx: (b) => `https://bingx.com/en/perpetual/${b}-${QUOTE}/`,
  hyperliquid: (b) => `https://app.hyperliquid.xyz/trade/${b}`,
  aster: (b) => `https://www.asterdex.com/en/futures/v1/${b}${QUOTE}`,
};

export function exchangeTradeUrl(exchange: string, symbol: string, kind?: string): string | null {
  const base = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(base) || base === QUOTE) return null;
  const venue = exchange.toLowerCase();
  const page = kind === "futures" ? (FUTURES[venue] ?? SPOT[venue]) : (SPOT[venue] ?? FUTURES[venue]);
  return page?.(base) ?? null;
}

