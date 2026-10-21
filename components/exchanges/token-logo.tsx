"use client";
import { TokenLogo } from "@/components/common/token-logo";
import { useEffect, useState } from "react";

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
const catalogIds: Record<string, string> = {
  PURR: "purr-2",
  HYPE: "hyperliquid",
  TURTLE: "turtle",
  OPN: "opinion",
  MET: "meteora",
  TREE: "treehouse",
  MORPHO: "morpho",
  LYN: "everlyn",
  COOL: "usdc-is-cool",
};
const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
let lookupQueue: Promise<unknown> = Promise.resolve();
// Perp contracts quote multiples of a coin (1000PEPE, kBONK, 1MBABYDOGE); the logo belongs to the base coin.
export function logoTicker(symbol: string) {
  const ticker = symbol.toUpperCase();
  const stripped = ticker.replace(/^(?:10{3,6}|1M)(?=[A-Z])/, "");
  if (stripped !== ticker) return stripped;
  return /^K[A-Z]{2,}$/.test(ticker) && symbol.startsWith("k")
    ? ticker.slice(1)
    : ticker;
}
function findLogo(ticker: string) {
  const existing = pending.get(ticker);
  if (existing) return existing;
  // Serialize metadata requests; mounting a balance table must not burst the provider.
  const lookup = lookupQueue
    .then(async () => {
      const response = await fetch(
        `/api/market/search?q=${encodeURIComponent(ticker === "PURR" ? "purr" : ticker === "COOL" ? "usdc is cool" : (catalogIds[ticker] ?? ticker))}`,
      );
      if (!response.ok) throw new Error("Logo metadata unavailable");
      const data = (await response.json()) as {
        results?: {
          id: string;
          symbol: string;
          thumb: string | null;
          marketCapRank: number | null;
        }[];
      };
      const matches =
        data.results?.filter((coin) => coin.symbol.toUpperCase() === ticker) ??
        [];
      // Several coins can share a symbol: take the best-ranked one; unranked ambiguity keeps the fallback.
      const ranked = matches
        .filter((coin) => coin.marketCapRank != null)
        .sort((a, b) => a.marketCapRank! - b.marketCapRank!);
      const selected = catalogIds[ticker]
        ? matches.find((coin) => coin.id === catalogIds[ticker])
        : (ranked[0] ?? (matches.length === 1 ? matches[0] : undefined));
      const logo = selected?.thumb ?? null;
      resolved.set(ticker, logo);
      return logo;
    })
    .finally(() => pending.delete(ticker));
  lookupQueue = lookup.catch(() => {});
  pending.set(ticker, lookup);
  return lookup;
}
export function ExchangeTokenLogo({
  symbol,
  size = 28,
}: {
  symbol: string;
  size?: number;
}) {
  const ticker = logoTicker(symbol);
  const [metadataLogo, setMetadataLogo] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMetadataLogo(null);
    if (!icons.has(ticker) && /^[A-Z0-9]{2,20}$/.test(ticker)) {
      if (resolved.has(ticker)) setMetadataLogo(resolved.get(ticker) ?? null);
      else
        void findLogo(ticker)
          .then((logo) => {
            if (!cancelled) setMetadataLogo(logo);
          })
          .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [ticker]);
  return (
    <TokenLogo
      symbol={symbol}
      size={size}
      src={
        icons.has(ticker)
          ? `https://assets.coincap.io/assets/icons/${ticker.toLowerCase()}@2x.png`
          : metadataLogo
      }
    />
  );
}
