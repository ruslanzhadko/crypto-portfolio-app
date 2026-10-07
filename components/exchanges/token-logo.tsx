"use client";
import { TokenLogo } from "@/components/common/token-logo";

// Branding only: this mapping is never used to identify or price an asset.
const icons = new Set([
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "USDT",
  "USDC",
  "DAI",
  "XRP",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
  "LTC",
  "TRX",
  "BCH",
  "UNI",
  "ATOM",
  "NEAR",
  "SUI",
  "APT",
  "ARB",
  "OP",
  "MNT",
  "TON",
  "SHIB",
  "PEPE",
  "BTTC",
]);
export function ExchangeTokenLogo({ symbol }: { symbol: string }) {
  const ticker = symbol.toUpperCase();
  return (
    <TokenLogo
      symbol={symbol}
      size={28}
      src={
        icons.has(ticker)
          ? `https://assets.coincap.io/assets/icons/${ticker.toLowerCase()}@2x.png`
          : null
      }
    />
  );
}
