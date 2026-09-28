import type { NormalizedTransaction } from './token-types';
import { getChainInfo } from '@/lib/utils/networks';

interface BalanceLogo { chainName: string; tokenAddress: string; logoUrl: string | null }

export function transactionAssets(tx: NormalizedTransaction, balances: readonly BalanceLogo[]) {
  const symbols = tx.tokenSymbol?.split('→').map((symbol) => symbol.trim()) ?? [];
  const swap = tx.type === 'swap';
  const native = getChainInfo(tx.chainName);
  const nativeSymbol = native?.symbol.toUpperCase();
  const outAddress = swap ? tx.swapOutTokenAddress ?? null : tx.tokenAddresses?.[0] ?? null;
  const inAddress = swap ? tx.swapInTokenAddress ?? null : null;
  const logo = (symbol: string | undefined, address: string | null, providerLogo: string | null | undefined) => {
    if (providerLogo) return providerLogo;
    if (address) return balances.find((balance) => balance.chainName === tx.chainName
      && balance.tokenAddress.toLowerCase() === address.toLowerCase() && balance.logoUrl)?.logoUrl ?? null;
    return symbol?.toUpperCase() === nativeSymbol ? native?.nativeLogoUrl ?? null : null;
  };
  return {
    logoUrl: logo(symbols[0], outAddress, tx.logoUrl),
    swapLogoUrl: swap ? logo(symbols[1], inAddress, tx.swapLogoUrl) : null,
    swapOutTokenAddress: swap ? outAddress : null,
    swapInTokenAddress: swap ? inAddress : null,
    swapOutSymbol: swap ? symbols[0] ?? null : null,
    swapInSymbol: swap ? symbols[1] ?? null : null,
  };
}
