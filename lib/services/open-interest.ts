export interface ExchangeOI {
  exchange: string;
  color: string;
  openInterestUsd: number;
  change24hPct: number | null;
}

export interface OpenInterestData {
  exchanges: ExchangeOI[];
  totalUsd: number;
  totalChange24hPct: number | null;
}

function toFuturesSymbol(symbol: string) {
  return `${symbol.toUpperCase()}USDT`;
}

async function fetchBinanceOI(symbol: string): Promise<ExchangeOI | null> {
  const s = toFuturesSymbol(symbol);
  try {
    const res = await fetch(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${s}&period=1h&limit=25`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;

    const data: Array<{ sumOpenInterestValue: string }> = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const last = data[data.length - 1];
    const first = data[0];
    if (!last) return null;
    const current = Number.parseFloat(last.sumOpenInterestValue);
    const prev = data.length >= 25 && first ? Number.parseFloat(first.sumOpenInterestValue) : null;
    const change = prev && prev > 0 ? ((current - prev) / prev) * 100 : null;

    return { exchange: 'Binance', color: '#F0B90B', openInterestUsd: current, change24hPct: change };
  } catch {
    return null;
  }
}

async function fetchBybitOI(symbol: string, currentPrice: number): Promise<ExchangeOI | null> {
  const s = toFuturesSymbol(symbol);
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${s}&intervalTime=1h&limit=25`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;

    const json: {
      retCode: number;
      result?: { list?: Array<{ openInterest: string }> };
    } = await res.json();

    const list = json.result?.list;
    if (json.retCode !== 0 || !list?.length) return null;

    // Bybit returns newest first
    const head = list[0];
    const tail = list[list.length - 1];
    if (!head) return null;
    const currentContracts = Number.parseFloat(head.openInterest);
    const prevContracts = list.length >= 25 && tail ? Number.parseFloat(tail.openInterest) : null;

    const currentUsd = currentContracts * currentPrice;
    const change =
      prevContracts && prevContracts > 0
        ? ((currentContracts - prevContracts) / prevContracts) * 100
        : null;

    return { exchange: 'Bybit', color: '#F26522', openInterestUsd: currentUsd, change24hPct: change };
  } catch {
    return null;
  }
}

async function fetchOkxOI(symbol: string, currentPrice: number): Promise<ExchangeOI | null> {
  const ccy = symbol.toUpperCase();
  const instId = `${ccy}-USDT-SWAP`;
  try {
    // Fetch current OI (specific instrument) and 24h history (rubik, all contracts) in parallel.
    // Current value: accurate — only USDT perpetual swap.
    // Change %: from rubik stats — percentage is directionally correct even on aggregated base.
    const [currentRes, histRes] = await Promise.all([
      fetch(
        `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`,
        { next: { revalidate: 300 } },
      ),
      fetch(
        `https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${ccy}&period=1D`,
        { next: { revalidate: 300 } },
      ),
    ]);

    if (!currentRes.ok) return null;

    const currentJson: {
      code: string;
      data?: Array<{ oiCcy: string }>;
    } = await currentRes.json();

    if (currentJson.code !== '0' || !currentJson.data?.length) return null;
    const entry = currentJson.data[0];
    if (!entry) return null;

    const openInterestUsd = Number.parseFloat(entry.oiCcy) * currentPrice;

    let change24hPct: number | null = null;
    if (histRes.ok) {
      const histJson: {
        code: string;
        data?: Array<[string, string, string, string]>;
      } = await histRes.json();

      if (histJson.code === '0' && histJson.data && histJson.data.length >= 2) {
        const cur = histJson.data[0];
        const prev = histJson.data[1];
        if (cur && prev) {
          const curOi = Number.parseFloat(cur[1]);
          const prevOi = Number.parseFloat(prev[1]);
          if (prevOi > 0) change24hPct = ((curOi - prevOi) / prevOi) * 100;
        }
      }
    }

    return { exchange: 'OKX', color: '#2563EB', openInterestUsd, change24hPct };
  } catch {
    return null;
  }
}

export async function fetchOpenInterest(
  symbol: string,
  currentPrice: number,
): Promise<OpenInterestData | null> {
  const results = await Promise.allSettled([
    fetchBinanceOI(symbol),
    fetchBybitOI(symbol, currentPrice),
    fetchOkxOI(symbol, currentPrice),
  ]);

  const exchanges = results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((e): e is ExchangeOI => e !== null && e.openInterestUsd > 0);

  if (exchanges.length === 0) return null;

  const totalUsd = exchanges.reduce((sum, e) => sum + e.openInterestUsd, 0);

  const withChange = exchanges.filter((e) => e.change24hPct !== null);
  const totalChange24hPct =
    withChange.length > 0
      ? withChange.reduce((s, e) => s + e.change24hPct!, 0) / withChange.length
      : null;

  return { exchanges, totalUsd, totalChange24hPct };
}
