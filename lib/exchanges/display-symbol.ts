/** Exchanges spell contracts differently (LYN_USDT, BTC-USDT-SWAP); positions show one compact form. */
export function displaySymbol(symbol: string): string {
  return symbol
    .replace(/-SWAP$/i, "")
    .replace(/[-_/]/g, "")
    .toUpperCase();
}
