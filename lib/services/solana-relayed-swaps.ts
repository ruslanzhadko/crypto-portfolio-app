/**
 * Gasless swaps (Jupiter Ultra and similar) take two Solana transactions: the wallet first moves the
 * token it sells to the aggregator's account, then the aggregator swaps it and sends the proceeds
 * back. Read one by one they look like an unrelated send and receive. This pairs them, so the list
 * shows one swap.
 */

interface RelayTokenTransfer {
  mint: string;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  tokenAmount: number;
}

interface RelayTx {
  signature: string;
  timestamp: number;
  tokenTransfers: RelayTokenTransfer[];
  nativeTransfers: { fromUserAccount?: string | null; toUserAccount?: string | null; amount: number }[];
}

const WSOL = 'So11111111111111111111111111111111111111112';
/** The swap lands within minutes of the hand-over. */
const MAX_DELAY_S = 10 * 60;

export interface RelayedSwaps {
  /** Hand-over transactions folded into their swap. */
  skip: Set<string>;
  /** Per swap transaction: the token the wallet handed over beforehand. */
  handedOver: Map<string, { mint: string; amount: number }>;
}

export function pairRelayedSwaps(txs: readonly RelayTx[], address: string): RelayedSwaps {
  const skip = new Set<string>();
  const handedOver = new Map<string, { mint: string; amount: number }>();
  // A hand-over: the wallet only sends one token to one account and gets nothing back.
  const handOvers = txs.flatMap((tx) => {
    const out = tx.tokenTransfers.filter((t) => t.fromUserAccount === address && t.mint !== WSOL);
    const gotToken = tx.tokenTransfers.some((t) => t.toUserAccount === address);
    const gotSol = tx.nativeTransfers.some((t) => t.toUserAccount === address && t.amount > 0);
    const first = out[0];
    if (out.length !== 1 || !first?.toUserAccount || gotToken || gotSol) return [];
    return [{ tx, mint: first.mint, amount: first.tokenAmount, to: first.toUserAccount }];
  });
  for (const handOver of handOvers) {
    const swap = txs.find((tx) =>
      tx.signature !== handOver.tx.signature
      && !handedOver.has(tx.signature)
      && tx.timestamp >= handOver.tx.timestamp
      && tx.timestamp - handOver.tx.timestamp <= MAX_DELAY_S
      // The aggregator spends the same token from the account it was handed to...
      && tx.tokenTransfers.some((t) => t.fromUserAccount === handOver.to && t.mint === handOver.mint
        && t.tokenAmount <= handOver.amount * 1.001)
      // ...and the wallet receives the proceeds.
      && (tx.tokenTransfers.some((t) => t.toUserAccount === address && t.mint !== handOver.mint)
        || tx.nativeTransfers.some((t) => t.toUserAccount === address && t.amount > 0)));
    if (!swap) continue;
    skip.add(handOver.tx.signature);
    handedOver.set(swap.signature, { mint: handOver.mint, amount: handOver.amount });
  }
  return { skip, handedOver };
}
