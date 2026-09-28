import axios from 'axios';

const RPC_CHAINS: Record<string, string> = {
  ethereum: 'eth', bsc: 'bsc', polygon: 'polygon', avalanche: 'avalanche',
  arbitrum: 'arbitrum', optimism: 'optimism', base: 'base', xlayer: 'xlayer',
};

export interface TransactionIdentity { hash: string; chainName: string }

// A token's Transfer.from is arbitrary event data, not the transaction signer.
// Batch-check the parent transaction only for unknown outgoing contracts.
export async function transactionInitiators(
  transactions: readonly TransactionIdentity[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const groups = new Map<string, Set<string>>();
  for (const tx of transactions) {
    if (!/^0x[\da-f]{64}$/i.test(tx.hash) || !RPC_CHAINS[tx.chainName]) continue;
    const hashes = groups.get(tx.chainName) ?? new Set<string>();
    hashes.add(tx.hash);
    groups.set(tx.chainName, hashes);
  }
  await Promise.all([...groups].map(async ([chain, hashes]) => {
    const key = process.env.ANKR_API_KEY;
    const url = `https://rpc.ankr.com/${RPC_CHAINS[chain]}${key ? `/${key}` : ''}`;
    const list = [...hashes];
    for (let offset = 0; offset < list.length; offset += 50) {
      const batch = list.slice(offset, offset + 50);
      try {
        const { data } = await axios.post(url, batch.map((hash, id) => ({
          jsonrpc: '2.0', id, method: 'eth_getTransactionByHash', params: [hash],
        })), { timeout: 8_000 });
        if (!Array.isArray(data)) continue;
        for (const item of data) {
          const hash = batch[item.id];
          const from = item.result?.from;
          if (hash && typeof from === 'string' && /^0x[\da-f]{40}$/i.test(from)
            && item.result?.hash?.toLowerCase() === hash.toLowerCase() && !item.error) {
            result.set(`${chain}:${hash}`, from.toLowerCase());
          }
        }
      } catch {
        // Unavailable verification is not proof that a legitimate send is spam.
      }
    }
  }));
  return result;
}
