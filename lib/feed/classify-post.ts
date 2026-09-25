type FeedPostType =
  | "NEWS"
  | "LISTING"
  | "ARBITRAGE"
  | "PRICE_ANOMALY"
  | "LIQUIDATION"
  | "TRADE_IDEA"
  | "AIRDROP"
  | "ANALYSIS"
  | "OTHER";

export interface ClassifiedPost {
  type: FeedPostType;
  title: string | null;
  symbol: string | null;
  direction: string | null;
  exchange: string | null;
  changePercent: number | null;
  intervalSeconds: number | null;
  amountUsd: number | null;
  priceUsd: number | null;
  limitUsd: number | null;
}

const EXCHANGES = [
  "Binance",
  "Bybit",
  "HyperLiquid",
  "MEXC",
  "OKX",
  "Coinbase",
  "Bitget",
  "Bithumb",
  "Upbit",
  "KuCoin",
];

function money(value: string, suffix?: string): number {
  const amount = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(amount)) return 0;
  if (suffix?.toUpperCase() === "K") return amount * 1_000;
  if (suffix?.toUpperCase() === "M") return amount * 1_000_000;
  if (suffix?.toUpperCase() === "B") return amount * 1_000_000_000;
  return amount;
}

function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 160) ?? ""
  );
}

function findExchange(text: string): string | null {
  return (
    EXCHANGES.find((exchange) => new RegExp(exchange, "i").test(text)) ?? null
  );
}

function findSymbol(text: string): string | null {
  const dollar = text.match(/\$([A-Z][A-Z0-9]{1,11})\b/);
  if (dollar?.[1]) return dollar[1];
  const hashtag = text.match(/#([A-Z][A-Z0-9]{1,11})\b/);
  if (hashtag?.[1]) return hashtag[1];
  const pair = text.match(/\b([A-Z][A-Z0-9]{1,11})(?:USDT|USD|PERP)\b/);
  if (pair?.[1]) return pair[1];
  const parenthesized = text.match(/\(([A-Z][A-Z0-9]{1,11})\)/);
  return parenthesized?.[1] ?? null;
}

export function classifyFeedPost(text: string): ClassifiedPost {
  const compact = text.replaceAll("\u00a0", " ").trim();
  const title = firstLine(compact) || null;
  const base = {
    title,
    symbol: findSymbol(compact),
    direction: null,
    exchange: findExchange(compact),
    changePercent: null,
    intervalSeconds: null,
    amountUsd: null,
    priceUsd: null,
    limitUsd: null,
  } satisfies Omit<ClassifiedPost, "type">;

  const liquidation = compact.match(
    /#?([A-Z][A-Z0-9]{1,11})\s+Liquidated\s+(Long|Short):\s*\$([\d.,]+)([KMB])?\s+at\s+\$([\d.,]+).*?\[([^\]]+)\]/i,
  );
  if (
    liquidation?.[1] &&
    liquidation[2] &&
    liquidation[3] &&
    liquidation[5] &&
    liquidation[6]
  ) {
    return {
      ...base,
      type: "LIQUIDATION",
      symbol: liquidation[1].toUpperCase(),
      direction: liquidation[2].toUpperCase(),
      amountUsd: money(liquidation[3], liquidation[4]),
      priceUsd: money(liquidation[5]),
      exchange: liquidation[6],
    };
  }

  const anomaly = compact.match(
    /^([A-Z0-9]{1,12})\s+([+-]\d+(?:\.\d+)?)%\s+in\s+(\d+)\s+secs?!/i,
  );
  if (anomaly?.[1] && anomaly[2] && anomaly[3]) {
    const limit = compact.match(/Limit\s*~?\s*`?\$([\d.,]+)([KMB])?/i);
    return {
      ...base,
      type: "PRICE_ANOMALY",
      symbol: anomaly[1].toUpperCase(),
      direction: Number(anomaly[2]) >= 0 ? "UP" : "DOWN",
      changePercent: Number(anomaly[2]),
      intervalSeconds: Number(anomaly[3]),
      limitUsd: limit?.[1] ? money(limit[1], limit[2]) : null,
    };
  }

  if (
    /\b(listing|listed|launchpool|launchpad|листинг|лістинг|добавлен рынок)\b/i.test(
      compact,
    )
  ) {
    return { ...base, type: "LISTING" };
  }
  if (/\b(airdrop|дроп|ейрдроп|клейм|claim|alpha point)\b/i.test(compact)) {
    return { ...base, type: "AIRDROP" };
  }
  if (/\b(arbitrage|арбітраж|арбитраж|spread|спред|p2p)\b/i.test(compact)) {
    return { ...base, type: "ARBITRAGE" };
  }
  if (
    /\b(long|short|entry|take profit|stop loss|вход|цели|стоп)\b/i.test(compact)
  ) {
    return {
      ...base,
      type: "TRADE_IDEA",
      direction: /\bshort\b/i.test(compact)
        ? "SHORT"
        : /\blong\b/i.test(compact)
          ? "LONG"
          : null,
    };
  }
  if (
    /\b(analysis|аналитик|огляд ринку|обзор рынка|теханаліз|теханализ)\b/i.test(
      compact,
    )
  ) {
    return { ...base, type: "ANALYSIS" };
  }
  if (
    /\b(news|новост|новин|announc|breaking|срочно|терміново)\b/i.test(compact)
  ) {
    return { ...base, type: "NEWS" };
  }

  return { ...base, type: "OTHER" };
}
