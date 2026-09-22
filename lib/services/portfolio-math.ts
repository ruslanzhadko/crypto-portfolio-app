// ─────────────────────────────────────────────────────────────────────────────
// Чиста синхронна портфельна математика — без I/O.
// Винесено з portfolio.ts (extract, не rewrite) щоб формули можна було
// юніт-тестувати ізольовано. Тіла функцій — байт-у-байт ті самі вирази, що були
// inline у getPortfolioOverview / getPortfolioPnL, тому поведінка ідентична.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Сукупна вартість портфеля V = Σ (вартість активу).
 * Кожен доданок — usdValue активу, тобто balance × price (ціна вже застосована
 * на етапі enrich). Порядок додавання збережено з оригіналу (важливо для
 * побітової ідентичності float-результату).
 */
export function computePortfolioValue(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/**
 * Частка активу у відсотках: part / total × 100.
 * При total <= 0 повертає 0 (захист від ділення на нуль / порожнього портфеля).
 */
export function computeShare(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/** Estimate 24h portfolio change from current asset values and their price changes. */
export function computePortfolio24hChange(assets: Array<{ usdValue: number; priceChange24h: number }>): {
  absolute: number;
  percent: number;
} {
  let current = 0;
  let previous = 0;
  for (const asset of assets) {
    if (!Number.isFinite(asset.usdValue) || asset.usdValue < 0) continue;
    const change = Number.isFinite(asset.priceChange24h)
      ? Math.max(-99.9, asset.priceChange24h) : 0;
    current += asset.usdValue;
    previous += asset.usdValue / (1 + change / 100);
  }
  const absolute = current - previous;
  return { absolute, percent: previous > 0 ? absolute / previous * 100 : 0 };
}

export interface PnL {
  absolute: number;
  percent: number;
}

/**
 * PnL = V_current − V_initial.
 * percent рахується відносно initial; при initial <= 0 → 0 (захист від ділення на нуль).
 */
export function computePnL(current: number, initial: number): PnL {
  const absolute = current - initial;
  const percent = initial > 0 ? (absolute / initial) * 100 : 0;
  return { absolute, percent };
}
