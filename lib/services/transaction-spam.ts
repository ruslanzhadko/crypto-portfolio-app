export interface TransactionSpamCandidate {
  chainName: string;
  tokenAddresses?: string[];
  tokenSymbol?: string | null;
  tokenName?: string | null;
  type?: string;
  value?: number | null;
  hash?: string;
  walletAddress?: string;
  transactionInitiator?: string;
}

export interface SpamTokenIdentity {
  chainName: string;
  tokenAddress: string;
  isSpam: boolean;
}

const SCAM_NAME = /(?:https?:\/\/|www\.|t\.me|(?:^|[\s._-])(?:airdrop|claim|visit|reward|voucher|bonus|free|gift)(?:$|[\s._-]))/i;

const NATIVE_RECEIVE_DUST: Record<string, number> = {
  solana: 0.00001,
  ethereum: 0.0000001,
  arbitrum: 0.0000001,
  optimism: 0.0000001,
  base: 0.0000001,
  polygon: 0.0000001,
  avalanche: 0.0000001,
  bsc: 0.0000001,
  xlayer: 0.0000001,
  robinhood: 0.0000001,
};

export function transactionIsSpam(
  tx: TransactionSpamCandidate,
  walletTokens: readonly SpamTokenIdentity[],
  interactedAddresses: ReadonlySet<string> = new Set(),
): boolean {
  const symbol = tx.tokenSymbol?.trim() ?? '';
  const name = tx.tokenName?.trim() ?? '';
  if (SCAM_NAME.test(symbol) || SCAM_NAME.test(name)) return true;

  const relevant = walletTokens.filter((token) => token.chainName === tx.chainName && token.tokenAddress);
  const knownAddresses = new Set(relevant.filter((token) => !token.isSpam).map((token) => token.tokenAddress.toLowerCase()));
  if ((tx.type === 'send' || tx.type === 'swap') && tx.walletAddress && tx.transactionInitiator
    && tx.walletAddress.toLowerCase() !== tx.transactionInitiator.toLowerCase()
    && tx.tokenAddresses?.some((address) => !knownAddresses.has(address.toLowerCase()))) return true;
  const spamAddresses = new Set(relevant
    .filter((token) => token.isSpam)
    .map((token) => token.tokenAddress.toLowerCase()));
  // A balance can be marked as dust; do not erase deliberate sends or swaps.
  if (tx.type === 'receive' && tx.tokenAddresses?.some((address) => spamAddresses.has(address.toLowerCase()))) return true;
  // Quarantine unsolicited incoming contracts absent from the current wallet.
  // A send/swap of the same contract on this page is evidence of interaction.
  // This is a suspicion, not proof of a scam; the UI allows reviewing it.
  if (tx.type === 'receive' && tx.tokenAddresses?.length) {
    if (tx.tokenAddresses.some((address) =>
      !knownAddresses.has(address.toLowerCase()) &&
      !interactedAddresses.has(`${tx.chainName}:${address.toLowerCase()}`),
    )) return true;
  }

  // Native dust transfers are commonly used to poison wallet histories.
  // Keep outgoing activity intact: a user may deliberately send a tiny amount.
  const nativeDust = NATIVE_RECEIVE_DUST[tx.chainName];
  if (
    tx.type === 'receive' &&
    (!tx.tokenAddresses || tx.tokenAddresses.length === 0) &&
    nativeDust !== undefined &&
    tx.value !== null && tx.value !== undefined &&
    tx.value > 0 && tx.value < nativeDust
  ) return true;

  return false;
}
