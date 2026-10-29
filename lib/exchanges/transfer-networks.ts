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

/** Networks without wallet support; ids match the badge list in lib/utils/networks.ts. */
const NAMES: Record<string, string> = {
  TRX: "tron",
  TRC20: "tron",
  TRON: "tron",
  PLASMA: "plasma",
  XPL: "plasma",
  APTOS: "aptos",
  APT: "aptos",
  TON: "ton",
  GRAM: "ton",
  SUI: "sui",
  BTC: "bitcoin",
  BITCOIN: "bitcoin",
  LINEA: "linea",
  ZKSYNC: "zksync",
  ZKSYNCERA: "zksync",
  ZKSERA: "zksync",
  SCROLL: "scroll",
  MANTLE: "mantle",
  MNT: "mantle",
  NEAR: "near",
  CELO: "celo",
  SEI: "sei",
  SONIC: "sonic",
  OPBNB: "opbnb",
  ADA: "cardano",
  CARDANO: "cardano",
  LTC: "litecoin",
  DOT: "polkadot",
  ATOM: "cosmos",
};

const EXPLORER: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  bsc: "https://bscscan.com/tx/",
  polygon: "https://polygonscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  solana: "https://solscan.io/tx/",
  ton: "https://tonviewer.com/transaction/",
  avalanche: "https://snowtrace.io/tx/",
  xlayer: "https://explorer.xlayer.xyz/tx/",
  tron: "https://tronscan.org/#/transaction/",
  plasma: "https://plasmascan.to/tx/",
  aptos: "https://explorer.aptoslabs.com/txn/",
  linea: "https://lineascan.build/tx/",
  scroll: "https://scrollscan.com/tx/",
  mantle: "https://mantlescan.xyz/tx/",
  zksync: "https://era.zksync.network/tx/",
  sonic: "https://sonicscan.org/tx/",
  opbnb: "https://opbnb.bscscan.com/tx/",
};

function key(network: string) {
  // OKX prefixes the coin ("USDT-Polygon"); spaces and dashes vary ("Arbitrum One").
  const last = network.split("-").pop() ?? network;
  return last.replace(/[\s_()]/g, "").toUpperCase();
}

/** Wallet chain id ("bsc"), a known network id ("tron") or the exchange's own name; null when none. */
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

/**
 * Exchanges whose deposits are a call to their own vault contract rather than a send to a personal
 * deposit address: a wallet send to the vault, or money coming back from it, is a move to or from
 * that exchange. Addresses are lower case; add a chain once a real transaction confirms its vault.
 */
export const EXCHANGE_VAULTS: Record<string, readonly string[]> = {
  // BSC; confirmed by a USDT deposit whose Deposit event credits the sender.
  aster: ["0x128463a60784c4d3f46c23af3f65ed859ba87974"],
};
