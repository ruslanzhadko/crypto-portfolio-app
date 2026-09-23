export interface TransactionSpamCandidate {
  chainName: string;
  tokenAddresses?: string[];
  tokenSymbol?: string | null;
  tokenName?: string | null;
  type?: string;
  value?: number | null;
}

export interface SpamTokenIdentity {
  chainName: string;
  tokenAddress: string;
  isSpam: boolean;
}

const SCAM_NAME = /(?:https?:\/\/|www\.|t\.me|(?:^|[\s._-])(?:airdrop|claim|visit|reward)(?:$|[\s._-]))/i;

export function transactionIsSpam(
  tx: TransactionSpamCandidate,
  walletTokens: readonly SpamTokenIdentity[],
  interactedAddresses: ReadonlySet<string> = new Set(),
): boolean {
  const relevant = walletTokens.filter((token) => token.chainName === tx.chainName && token.tokenAddress);
  const spamAddresses = new Set(relevant
    .filter((token) => token.isSpam)
    .map((token) => token.tokenAddress.toLowerCase()));
  // A balance can be marked as dust; do not erase deliberate sends or swaps.
  if (tx.type === 'receive' && tx.tokenAddresses?.some((address) => spamAddresses.has(address.toLowerCase()))) return true;
  // Quarantine unsolicited incoming contracts absent from the current wallet.
  // A send/swap of the same contract on this page is evidence of interaction.
  // This is a suspicion, not proof of a scam; the UI allows reviewing it.
  if (tx.type === 'receive' && tx.tokenAddresses?.length) {
    const knownAddresses = new Set(relevant.map((token) => token.tokenAddress.toLowerCase()));
    if (tx.tokenAddresses.some((address) =>
      !knownAddresses.has(address.toLowerCase()) &&
      !interactedAddresses.has(`${tx.chainName}:${address.toLowerCase()}`),
    )) return true;
  }
  return SCAM_NAME.test(tx.tokenSymbol ?? '') || SCAM_NAME.test(tx.tokenName ?? '');
}
