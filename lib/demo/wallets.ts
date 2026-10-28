/**
 * Sample wallets of the demo account: made-up addresses, a fixed set of coins whose prices are the
 * live market prices (TokenPrice), and a sample transaction history whose times follow the clock.
 * They are never synced with a chain.
 */
export type DemoToken = {
  symbol: string;
  name: string;
  chainName: string;
  /** Contract or mint; null for the chain's native coin. */
  address: string | null;
  decimals: number;
  balance: number;
  coingeckoId: string;
};

export type DemoWallet = {
  label: string;
  address: string;
  network: "EVM" | "SOLANA";
  tokens: DemoToken[];
};

export const DEMO_WALLETS: DemoWallet[] = [
  {
    label: "Main EVM",
    address: "0xDe300000000000000000000000000000000000A1",
    network: "EVM",
    tokens: [
      {
        symbol: "ETH",
        name: "Ethereum",
        chainName: "ethereum",
        address: null,
        decimals: 18,
        balance: 1.84,
        coingeckoId: "ethereum",
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        chainName: "ethereum",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        balance: 2150,
        coingeckoId: "usd-coin",
      },
      {
        symbol: "LINK",
        name: "Chainlink",
        chainName: "ethereum",
        address: "0x514910771af9ca656af840dff83e8264ecf986ca",
        decimals: 18,
        balance: 140,
        coingeckoId: "chainlink",
      },
      {
        symbol: "UNI",
        name: "Uniswap",
        chainName: "ethereum",
        address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        decimals: 18,
        balance: 85,
        coingeckoId: "uniswap",
      },
      {
        symbol: "ARB",
        name: "Arbitrum",
        chainName: "arbitrum",
        address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        decimals: 18,
        balance: 1200,
        coingeckoId: "arbitrum",
      },
      {
        symbol: "BNB",
        name: "BNB",
        chainName: "bsc",
        address: null,
        decimals: 18,
        balance: 2.3,
        coingeckoId: "binancecoin",
      },
      {
        symbol: "USDT",
        name: "Tether",
        chainName: "bsc",
        address: "0x55d398326f99059ff775485246999027b3197955",
        decimals: 18,
        balance: 940,
        coingeckoId: "tether",
      },
    ],
  },
  {
    label: "Solana",
    address: "DemoSo1ana1111111111111111111111111111111111",
    network: "SOLANA",
    tokens: [
      {
        symbol: "SOL",
        name: "Solana",
        chainName: "solana",
        address: null,
        decimals: 9,
        balance: 38.5,
        coingeckoId: "solana",
      },
      {
        symbol: "JUP",
        name: "Jupiter",
        chainName: "solana",
        address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        decimals: 6,
        balance: 1900,
        coingeckoId: "jupiter-exchange-solana",
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        chainName: "solana",
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
        balance: 760,
        coingeckoId: "usd-coin",
      },
    ],
  },
];

type Template = {
  hoursAgo: number;
  type: "receive" | "send" | "swap";
  symbol: string;
  value: number;
  /** For swaps: what was given up, shown as "OUT → IN". */
  out?: { symbol: string; value: number };
  chainName: string;
};

const EVM_HISTORY: Template[] = [
  {
    hoursAgo: 3,
    type: "swap",
    symbol: "LINK",
    value: 40,
    out: { symbol: "USDC", value: 560 },
    chainName: "ethereum",
  },
  {
    hoursAgo: 9,
    type: "receive",
    symbol: "USDC",
    value: 1000,
    chainName: "ethereum",
  },
  { hoursAgo: 27, type: "send", symbol: "USDT", value: 250, chainName: "bsc" },
  {
    hoursAgo: 50,
    type: "swap",
    symbol: "ARB",
    value: 600,
    out: { symbol: "ETH", value: 0.15 },
    chainName: "arbitrum",
  },
  {
    hoursAgo: 75,
    type: "receive",
    symbol: "ETH",
    value: 0.5,
    chainName: "ethereum",
  },
  {
    hoursAgo: 120,
    type: "send",
    symbol: "UNI",
    value: 15,
    chainName: "ethereum",
  },
  {
    hoursAgo: 190,
    type: "receive",
    symbol: "BNB",
    value: 1.2,
    chainName: "bsc",
  },
  {
    hoursAgo: 260,
    type: "swap",
    symbol: "UNI",
    value: 100,
    out: { symbol: "USDC", value: 700 },
    chainName: "ethereum",
  },
];

const SOLANA_HISTORY: Template[] = [
  {
    hoursAgo: 5,
    type: "swap",
    symbol: "JUP",
    value: 500,
    out: { symbol: "SOL", value: 2.1 },
    chainName: "solana",
  },
  {
    hoursAgo: 30,
    type: "receive",
    symbol: "SOL",
    value: 10,
    chainName: "solana",
  },
  {
    hoursAgo: 98,
    type: "send",
    symbol: "USDC",
    value: 120,
    chainName: "solana",
  },
  {
    hoursAgo: 210,
    type: "receive",
    symbol: "USDC",
    value: 500,
    chainName: "solana",
  },
];

const COUNTERPARTY = "0xC0ffee0000000000000000000000000000000De0";
const HOUR = 3600_000;

/** One page of sample history for a demo wallet, in the shape the transactions API returns. */
export function demoTransactionPage(
  wallet: { id: string; address: string; network: string },
  now = Date.now(),
) {
  const history = wallet.network === "EVM" ? EVM_HISTORY : SOLANA_HISTORY;
  // Times move with the clock in whole days, so the history always looks recent.
  const anchor = Math.floor(now / (24 * HOUR)) * 24 * HOUR + 12 * HOUR;
  const transactions = history.map((tx, index) => {
    const hash = `demo-${wallet.id}-${index}`;
    const incoming = tx.type === "receive";
    return {
      id: `${tx.chainName}:${hash}`,
      hash,
      chainName: tx.chainName,
      type: tx.type,
      tokenSymbol: tx.out ? `${tx.out.symbol} → ${tx.symbol}` : tx.symbol,
      tokenName: tx.out ? `${tx.out.symbol} → ${tx.symbol}` : tx.symbol,
      tokenAddresses: [],
      fromAddress: incoming ? COUNTERPARTY : wallet.address,
      toAddress: incoming ? wallet.address : COUNTERPARTY,
      value: tx.value,
      sentValue: tx.out?.value ?? null,
      usdValue: null,
      status: "success",
      timestamp: new Date(
        Math.min(now - 60_000, anchor - tx.hoursAgo * HOUR),
      ).toISOString(),
      blockNumber: null,
      trade: null,
      logoUrl: null,
      swapLogoUrl: null,
      isSpam: false,
    };
  });
  return { transactions, hasMore: false };
}
