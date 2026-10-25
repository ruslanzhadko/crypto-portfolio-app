/**
 * Finds money moving between the user's own wallets and exchange accounts in the recent
 * transactions list: wallet → exchange, exchange → wallet, wallet → wallet, exchange → exchange.
 *
 * Both legs of one move share the on-chain hash (a wallet send and an exchange deposit, an exchange
 * withdrawal and a wallet receive...). Such pairs collapse into one row, shown on the sending leg.
 * When only one leg is loaded, the counterparty is still recognised by address: a wallet send to
 * another own wallet, or an exchange withdrawal to an own wallet address.
 */

export type Party =
  | { kind: "wallet"; id: string }
  | { kind: "exchange"; id: string };

export interface OwnTransfer {
  from: Party;
  to: Party;
  /** The receiving leg folded into the sending one; that row is not shown on its own. */
  hidden: boolean;
}

export interface WalletLegInput {
  key: string;
  walletId: string;
  hash: string;
  chainName: string;
  type: string;
  fromAddress: string | null;
  toAddress: string | null;
}

export interface ExchangeLegInput {
  key: string;
  connectionId: string;
  direction: "deposit" | "withdrawal";
  txHash: string | null;
  address: string | null;
}

interface Leg {
  key: string;
  party: Party;
  side: "out" | "in";
  hash: string | null;
}

/** Exchanges store hashes in their own case and sometimes without the 0x prefix. */
function normalizeHash(hash: string | null): string | null {
  const value = hash?.trim().toLowerCase().replace(/^0x/, "");
  return value && /^[0-9a-z]{32,}$/.test(value) ? value : null;
}

const sameParty = (a: Party, b: Party) => a.kind === b.kind && a.id === b.id;

export function linkOwnTransfers(input: {
  walletTxs: readonly WalletLegInput[];
  transfers: readonly ExchangeLegInput[];
  wallets: readonly { id: string; address: string }[];
}): Map<string, OwnTransfer> {
  const walletByAddress = new Map(input.wallets.map((w) => [w.address.toLowerCase(), w.id]));
  const legs: Leg[] = [
    ...input.walletTxs
      .filter((tx) => tx.type === "send" || tx.type === "receive" || tx.type === "transfer")
      .map((tx): Leg => ({
        key: tx.key,
        party: { kind: "wallet", id: tx.walletId },
        side: tx.type === "send" ? "out" : "in",
        hash: normalizeHash(tx.hash),
      })),
    ...input.transfers.map((tr): Leg => ({
      key: tr.key,
      party: { kind: "exchange", id: tr.connectionId },
      side: tr.direction === "withdrawal" ? "out" : "in",
      hash: normalizeHash(tr.txHash),
    })),
  ];

  const result = new Map<string, OwnTransfer>();
  const byHash = new Map<string, Leg[]>();
  for (const leg of legs) {
    if (!leg.hash) continue;
    byHash.set(leg.hash, [...(byHash.get(leg.hash) ?? []), leg]);
  }
  for (const group of byHash.values()) {
    const out = group.find((leg) => leg.side === "out");
    const into = group.find((leg) => leg.side === "in" && out && !sameParty(leg.party, out.party));
    if (!out || !into) continue;
    result.set(out.key, { from: out.party, to: into.party, hidden: false });
    result.set(into.key, { from: out.party, to: into.party, hidden: true });
  }

  // One leg only: recognise the other side by an own wallet address.
  for (const tx of input.walletTxs) {
    if (result.has(tx.key)) continue;
    const self: Party = { kind: "wallet", id: tx.walletId };
    const other = tx.type === "send" ? tx.toAddress : tx.type === "receive" || tx.type === "transfer" ? tx.fromAddress : null;
    const otherId = other ? walletByAddress.get(other.toLowerCase()) : undefined;
    if (!otherId || otherId === tx.walletId) continue;
    const party: Party = { kind: "wallet", id: otherId };
    result.set(tx.key, tx.type === "send"
      ? { from: self, to: party, hidden: false }
      : { from: party, to: self, hidden: false });
  }
  for (const tr of input.transfers) {
    if (result.has(tr.key) || tr.direction !== "withdrawal" || !tr.address) continue;
    const walletId = walletByAddress.get(tr.address.toLowerCase());
    if (walletId) {
      result.set(tr.key, {
        from: { kind: "exchange", id: tr.connectionId },
        to: { kind: "wallet", id: walletId },
        hidden: false,
      });
    }
  }
  return result;
}
