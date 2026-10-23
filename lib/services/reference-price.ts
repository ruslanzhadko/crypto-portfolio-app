/**
 * Guards prices from a single pool (DexScreener) or explorer (Blockscout exchange_rate) with an
 * aggregated reference (CoinGecko). A thin or misreported pool once priced USDG, a $1 stablecoin,
 * at $3.71; the reference keeps such readings out of balances and capital history.
 */

/** Contracts CoinGecko lists without this chain's platform entry: chain:lowercase address → CoinGecko id. */
const VERIFIED_CONTRACTS: Record<string, string> = {
  // Paxos Global Dollar (USDG) on Robinhood Chain.
  'robinhood:0x5fc5360d0400a0fd4f2af552add042d716f1d168': 'global-dollar',
};

export function verifiedCoingeckoId(chainName: string, address: string | null | undefined): string | undefined {
  return address ? VERIFIED_CONTRACTS[`${chainName}:${address.toLowerCase()}`] : undefined;
}

/** A price further than this from the reference is treated as a bad reading. */
export const MAX_REFERENCE_DEVIATION = 0.1;

/** Returns the reference when the observed price strays too far from it, otherwise the observed price. */
export function checkedPrice(observed: number, reference: number | null | undefined): number {
  if (!reference || !Number.isFinite(reference) || reference <= 0) return observed;
  if (!Number.isFinite(observed) || observed <= 0) return reference;
  return Math.abs(observed / reference - 1) > MAX_REFERENCE_DEVIATION ? reference : observed;
}
