import { positionBreakEven } from "@/lib/exchanges/funding";
import type {
  AccountBalance,
  AssetBalance,
  ExchangeAdapter,
  OpenPosition,
  SyncResult,
} from "@/lib/exchanges/types";

/**
 * Demo exchange accounts: a fixed set of balances and positions valued at live public prices
 * (Binance USDⓈ-M premium index). Entry prices drift slowly around the mark, so PnL moves both
 * ways over a few days and never runs away. Used by the worker instead of a real API for the
 * demo account; nothing here talks to an account.
 */
type DemoPosition = {
  symbol: string;
  base: string;
  side: "long" | "short";
  size: number;
  leverage: number;
  /** Phase of the slow entry drift, so positions do not move in step. */
  phase: number;
};
type DemoAccount = {
  accountKey: string;
  kind: AccountBalance["kind"];
  mode: string;
  /** Coin → amount; USDT is valued at the USDT rate, the rest at their USDT mark. */
  holdings: Record<string, number>;
  positions: DemoPosition[];
};

export const DEMO_EXCHANGES: Record<
  string,
  { label: string; accounts: DemoAccount[] }
> = {
  binance: {
    label: "Binance Demo",
    accounts: [
      {
        accountKey: "spot",
        kind: "spot",
        mode: "spot",
        holdings: { BTC: 0.15, ETH: 1.2, BNB: 3, USDT: 1500 },
        positions: [],
      },
      {
        accountKey: "futures",
        kind: "futures",
        mode: "classic",
        holdings: { USDT: 3200 },
        positions: [
          {
            symbol: "BTCUSDT",
            base: "BTC",
            side: "long",
            size: 0.04,
            leverage: 10,
            phase: 0,
          },
          {
            symbol: "SOLUSDT",
            base: "SOL",
            side: "short",
            size: 30,
            leverage: 5,
            phase: 2.1,
          },
        ],
      },
    ],
  },
  bybit: {
    label: "Bybit Demo",
    accounts: [
      {
        accountKey: "unified",
        kind: "unified",
        mode: "cross",
        holdings: { USDT: 2400, ETH: 0.5 },
        positions: [
          {
            symbol: "ETHUSDT",
            base: "ETH",
            side: "long",
            size: 1.5,
            leverage: 8,
            phase: 1.2,
          },
          {
            symbol: "DOGEUSDT",
            base: "DOGE",
            side: "long",
            size: 6000,
            leverage: 5,
            phase: 3.4,
          },
        ],
      },
    ],
  },
  okx: {
    label: "OKX Demo",
    accounts: [
      {
        accountKey: "trading",
        kind: "unified",
        mode: "cross",
        holdings: { USDT: 1800, SOL: 10 },
        positions: [
          {
            symbol: "XRPUSDT",
            base: "XRP",
            side: "short",
            size: 900,
            leverage: 10,
            phase: 4.2,
          },
          {
            symbol: "AVAXUSDT",
            base: "AVAX",
            side: "long",
            size: 40,
            leverage: 6,
            phase: 5.3,
          },
        ],
      },
    ],
  },
};

const PREMIUM_INDEX = "https://fapi.binance.com/fapi/v1/premiumIndex";
const MARKS_TTL_MS = 15_000;
const DRIFT = 0.035;
const DRIFT_PERIOD_MS = 3 * 86400_000;
const DAY = 86400_000;

type Market = { mark: number; rate: string | null; next: number | null };
let marks: { at: number; data: Map<string, Market> } | undefined;

/** Live USDT marks and funding of every perpetual, one public request at most every 15 s. */
async function liveMarkets(
  fetchImpl: typeof fetch,
): Promise<Map<string, Market>> {
  if (marks && Date.now() - marks.at < MARKS_TTL_MS) return marks.data;
  const response = await fetchImpl(PREMIUM_INDEX, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`premiumIndex HTTP ${response.status}`);
  const rows = (await response.json()) as {
    symbol: string;
    markPrice: string;
    lastFundingRate?: string;
    nextFundingTime?: number;
  }[];
  const data = new Map<string, Market>();
  for (const row of rows) {
    const mark = Number(row.markPrice);
    if (Number.isFinite(mark) && mark > 0)
      data.set(row.symbol, {
        mark,
        rate: row.lastFundingRate ?? null,
        next: Number(row.nextFundingTime) || null,
      });
  }
  marks = { at: Date.now(), data };
  return data;
}

const text = (n: number, digits = 8) => String(Number(n.toFixed(digits)));

export class DemoExchangeAdapter implements ExchangeAdapter {
  constructor(
    private exchange: string,
    private prices: () => Promise<Map<string, string>>,
    private fetchImpl: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  async verify() {
    if (!DEMO_EXCHANGES[this.exchange])
      throw new Error("No demo data for this exchange");
    return { externalAccountId: `demo-${this.exchange}` };
  }

  async fetch(): Promise<SyncResult> {
    const demo = DEMO_EXCHANGES[this.exchange];
    if (!demo) return { accounts: [], failedAccounts: [] };
    const now = this.now();
    const [markets, rates] = await Promise.all([
      liveMarkets(this.fetchImpl),
      this.prices().catch(() => new Map<string, string>()),
    ]);
    const usdt = Number(rates.get("USDT") ?? "1") || 1;
    const usd = (coin: string) =>
      coin === "USDT" || coin === "USDC"
        ? usdt
        : (markets.get(`${coin}USDT`)?.mark ?? NaN) * usdt;
    // The cycle "opened" at the start of the day before yesterday, so durations and funding look real.
    const since = Math.floor(now / DAY) * DAY - 2 * DAY;

    const accounts = demo.accounts.map((account): AccountBalance => {
      const balances: AssetBalance[] = Object.entries(account.holdings).map(
        ([symbol, amount]) => {
          const price = usd(symbol);
          return {
            assetId: `demo:${symbol}`,
            symbol,
            total: text(amount),
            free: text(amount),
            locked: null,
            debt: null,
            priceUsd: Number.isFinite(price) ? text(price) : null,
            usdValue: Number.isFinite(price) ? text(amount * price, 2) : null,
          };
        },
      );
      const positions = account.positions.flatMap((p): OpenPosition[] => {
        const market = markets.get(p.symbol);
        if (!market) return [];
        const drift =
          DRIFT * Math.sin((2 * Math.PI * now) / DRIFT_PERIOD_MS + p.phase);
        const entry = market.mark / (1 + (p.side === "long" ? drift : -drift));
        const direction = p.side === "long" ? 1 : -1;
        const pnl = (market.mark - entry) * p.size * direction;
        const notional = p.size * market.mark;
        const position: OpenPosition = {
          positionKey: `${p.symbol}:${p.side === "long" ? "LONG" : "SHORT"}`,
          symbol: p.symbol,
          base: p.base,
          settle: "USDT",
          side: p.side,
          contracts: text(p.size),
          contractSize: "1",
          baseSize: text(p.size),
          notionalUsd: text(notional * usdt, 2),
          entryPrice: text(entry, 6),
          markPrice: text(market.mark, 6),
          liquidationPrice: text(
            entry * (1 - (direction * 0.9) / p.leverage),
            6,
          ),
          leverage: String(p.leverage),
          marginMode: "cross",
          margin: text((p.size * entry) / p.leverage, 2),
          unrealizedPnl: text(pnl, 4),
          unrealizedPnlUsd: text(pnl * usdt, 4),
          funding: {
            amount: text(-notional * 0.0001 * 6 * direction, 4),
            realizedPnl: "0",
            tradingFees: text(notional * 0.0005, 4),
            since,
            updatedAt: now,
            status: "complete",
            nextRate: market.rate,
            nextTime: market.next,
            nextRateUpdatedAt: now,
          },
        };
        position.funding = {
          ...position.funding!,
          breakEvenPrice: positionBreakEven(position),
        };
        return [position];
      });
      const pnl = positions.reduce(
        (total, p) => total + Number(p.unrealizedPnlUsd),
        0,
      );
      const held = balances.reduce(
        (total, b) => total + Number(b.usdValue ?? 0),
        0,
      );
      const complete = balances.every((b) => b.usdValue !== null);
      return {
        accountKey: account.accountKey,
        kind: account.kind,
        mode: account.mode,
        equityUsd: text(held + pnl, 2),
        availableUsd: text(held * 0.6, 2),
        unrealizedPnlUsd: positions.length ? text(pnl, 4) : null,
        complete,
        errorCode: complete ? null : "UNPRICED_ASSETS",
        balances,
        positions,
      };
    });
    return { accounts, failedAccounts: [] };
  }

  async close() {}
}

/** Test hook. */
export function resetDemoMarkets() {
  marks = undefined;
}
