/**
 * Finds money moving between the user's own wallets and exchange accounts in the recent
 * transactions list: wallet → exchange, exchange → wallet, wallet → wallet, exchange → exchange.
 *
 * Both legs of one move share the on-chain hash (a wallet send and an exchange deposit, an exchange
 * withdrawal and a wallet receive...). Such pairs collapse into one row, shown on the sending leg.
 * When only one leg is loaded, the counterparty is still recognised by address: a wallet send to
 * another own wallet or to a deposit address an own exchange account has used, an exchange
 * withdrawal to an own wallet or to another account's deposit address.
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
  /** The same hash found in the user's whole exchange history (server lookup), if any. */
  exchangeLeg?: { connectionId: string; direction: "deposit" | "withdrawal" } | null;
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
export function normalizeHash(hash: string | null): string | null {
  const value = hash?.trim().toLowerCase().replace(/^0x/, "");
  return value && /^[0-9a-z]{32,}$/.test(value) ? value : null;
}

const sameParty = (a: Party, b: Party) => a.kind === b.kind && a.id === b.id;

export function linkOwnTransfers(input: {
  walletTxs: readonly WalletLegInput[];
  transfers: readonly ExchangeLegInput[];
  wallets: readonly { id: string; address: string }[];
  /** Deposit addresses seen in each exchange account's history. */
  exchangeAddresses?: readonly { connectionId: string; address: string | null }[];
}): Map<string, OwnTransfer> {
  const walletByAddress = new Map(input.wallets.map((w) => [w.address.toLowerCase(), w.id]));
  const exchangeByAddress = new Map(
    (input.exchangeAddresses ?? [])
      .filter((entry): entry is { connectionId: string; address: string } => Boolean(entry.address))
      .map((entry) => [entry.address.toLowerCase(), entry.connectionId]),
  );
  /** The own wallet or exchange account behind an address, if any. */
  const ownerOf = (address: string | null): Party | null => {
    if (!address) return null;
    const wallet = walletByAddress.get(address.toLowerCase());
    if (wallet) return { kind: "wallet", id: wallet };
    const account = exchangeByAddress.get(address.toLowerCase());
    return account ? { kind: "exchange", id: account } : null;
  };
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

  // One leg only: the exchange history found by hash on the server, else an own address.
  for (const tx of input.walletTxs) {
    if (result.has(tx.key)) continue;
    const self: Party = { kind: "wallet", id: tx.walletId };
    const leg = tx.exchangeLeg;
    if (leg && tx.type === "send" && leg.direction === "deposit") {
      result.set(tx.key, { from: self, to: { kind: "exchange", id: leg.connectionId }, hidden: false });
      continue;
    }
    if (leg && (tx.type === "receive" || tx.type === "transfer") && leg.direction === "withdrawal") {
      result.set(tx.key, { from: { kind: "exchange", id: leg.connectionId }, to: self, hidden: false });
      continue;
    }
    const other = tx.type === "send" ? tx.toAddress : tx.type === "receive" || tx.type === "transfer" ? tx.fromAddress : null;
    // Money arriving from an exchange comes from its hot wallet, never from a deposit address.
    const owner = ownerOf(other);
    const counterpart = tx.type === "send" || owner?.kind === "wallet" ? owner : null;
    if (!counterpart || sameParty(counterpart, self)) continue;
    result.set(tx.key, tx.type === "send"
      ? { from: self, to: counterpart, hidden: false }
      : { from: counterpart, to: self, hidden: false });
  }
  for (const tr of input.transfers) {
    if (result.has(tr.key) || tr.direction !== "withdrawal") continue;
    const self: Party = { kind: "exchange", id: tr.connectionId };
    const to = ownerOf(tr.address);
    if (to && !sameParty(to, self)) result.set(tr.key, { from: self, to, hidden: false });
  }
  return result;
}
