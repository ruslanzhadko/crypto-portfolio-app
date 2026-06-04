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
