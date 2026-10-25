/**
 * Exchanges name deposit networks their own way ("BSC", "ETH", OKX "USDT-Polygon"). Known ones map
 * to the wallet chain ids, so one network filter and badge cover wallets and exchanges; the rest
 * keep a readable name. Shared by the API and the dashboard list.
 */
const CHAIN_BY_NETWORK: Record<string, string> = {
  ETH: "ethereum",
  ERC20: "ethereum",
  ETHEREUM: "ethereum",
  BSC: "bsc",
  BEP20: "bsc",
  BNB: "bsc",
  MATIC: "polygon",
  POLYGON: "polygon",
  ARBITRUM: "arbitrum",
  ARBITRUMONE: "arbitrum",
  ARBI: "arbitrum",
  OPTIMISM: "optimism",
  OP: "optimism",
  BASE: "base",
  SOL: "solana",
  SOLANA: "solana",
  AVAXC: "avalanche",
  AVAX: "avalanche",
  AVALANCHE: "avalanche",
  XLAYER: "xlayer",
};

const NAMES: Record<string, string> = {
  TRX: "Tron",
  TRC20: "Tron",
  TRON: "Tron",
  PLASMA: "Plasma",
  APTOS: "Aptos",
  APT: "Aptos",
  TON: "TON",
  SUI: "Sui",
  BTC: "Bitcoin",
};

const EXPLORER: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  bsc: "https://bscscan.com/tx/",
  polygon: "https://polygonscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  solana: "https://solscan.io/tx/",
  avalanche: "https://snowtrace.io/tx/",
  xlayer: "https://explorer.xlayer.xyz/tx/",
  Tron: "https://tronscan.org/#/transaction/",
  Plasma: "https://plasmascan.to/tx/",
  Aptos: "https://explorer.aptoslabs.com/txn/",
};

function key(network: string) {
  // OKX prefixes the coin ("USDT-Polygon"); spaces and dashes vary ("Arbitrum One").
  const last = network.split("-").pop() ?? network;
  return last.replace(/[\s_()]/g, "").toUpperCase();
}

/** Wallet chain id ("bsc") or a readable network name ("Tron"); null when the exchange gave none. */
export function transferChain(network: string | null): string | null {
  if (!network?.trim()) return null;
  const k = key(network.trim());
  return CHAIN_BY_NETWORK[k] ?? NAMES[k] ?? network.trim();
}

export function transferExplorerUrl(chain: string | null, txHash: string | null): string | null {
  if (!chain || !txHash) return null;
  const base = EXPLORER[chain];
  // Internal transfers carry exchange ids instead of chain hashes.
  if (!base || !/^(0x)?[0-9a-fA-F]{40,}$|^[1-9A-HJ-NP-Za-km-z]{60,90}$/.test(txHash)) return null;
  return `${base}${txHash}`;
}
