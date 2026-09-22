/** Known canonical WETH9 contracts. Never group arbitrary contracts by ticker. */
const WETH_CONTRACTS: Record<string, string> = {
  ethereum: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  arbitrum: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  optimism: '0x4200000000000000000000000000000000000006',
  base: '0x4200000000000000000000000000000000000006',
};

export function getTokenGroupingKey(token: {
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  coingeckoId: string | null;
}): string {
  const chain = token.chainName.toLowerCase();
  const address = token.tokenAddress.toLowerCase();

  if (address) {
    if (token.tokenSymbol.toUpperCase() === 'WETH' && WETH_CONTRACTS[chain] === address) {
      return 'wrapped:ethereum';
    }
    return `${chain}:${address}`;
  }

  return token.coingeckoId
    ? `market:${token.coingeckoId}`
    : `${chain}:native:${token.tokenSymbol.toLowerCase()}`;
}
