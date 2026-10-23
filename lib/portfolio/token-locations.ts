import { getChainInfo } from "@/lib/utils/networks";
import type { AggregatedToken } from "@/lib/services/portfolio";
import type { ExchangeHolding } from "./unified-assets";

const MAX_NAMED = 2;

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * Where a coin is held, for one short line under its name: wallets with their network, then exchange
 * accounts. Long lists are cut to the first few places plus "+N".
 */
export function describeTokenLocations(
  token: Pick<AggregatedToken, "wallets"> & { exchanges?: ExchangeHolding[] },
): string {
  const places: string[] = [];
  for (const wallet of token.wallets) {
    const chain = getChainInfo(wallet.chainName)?.displayName ?? wallet.chainName;
    const name = wallet.walletLabel?.trim() || shortAddress(wallet.walletAddress);
    places.push(chain ? `${name} · ${chain}` : name);
  }
  for (const holding of token.exchanges ?? []) places.push(holding.label);
  const unique = [...new Set(places.filter(Boolean))];
  if (unique.length <= MAX_NAMED) return unique.join(", ");
  return `${unique.slice(0, MAX_NAMED).join(", ")} +${unique.length - MAX_NAMED}`;
}
