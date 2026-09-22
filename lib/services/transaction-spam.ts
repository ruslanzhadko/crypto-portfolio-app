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
): boolean {
  const relevant = walletTokens.filter((token) => token.chainName === tx.chainName && token.tokenAddress);
  const spamAddresses = new Set(relevant
    .filter((token) => token.isSpam)
    .map((token) => token.tokenAddress.toLowerCase()));
  // A balance can be marked as dust; do not erase deliberate sends or swaps.
  if (tx.type === 'receive' && tx.tokenAddresses?.some((address) => spamAddresses.has(address.toLowerCase()))) return true;
  // Very large unsolicited transfers of a contract absent from the wallet are
  // suspicious airdrops, not proof of a scam. The UI allows reviewing them.
  if (tx.type === 'receive' && (tx.value ?? 0) >= 1_000_000 && tx.tokenAddresses?.length) {
    const knownAddresses = new Set(relevant.map((token) => token.tokenAddress.toLowerCase()));
    if (tx.tokenAddresses.some((address) => !knownAddresses.has(address.toLowerCase()))) return true;
  }
  return SCAM_NAME.test(tx.tokenSymbol ?? '') || SCAM_NAME.test(tx.tokenName ?? '');
}
