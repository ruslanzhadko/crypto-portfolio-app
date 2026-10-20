"use client";
import { useState } from "react";
import { Landmark } from "lucide-react";

// Official exchange images from CoinGecko's exchange API (coin-images CDN).
const LOGOS: Record<string, string> = {
  binance:
    "https://coin-images.coingecko.com/markets/images/52/small/binance.jpg?1706864274",
  bybit:
    "https://coin-images.coingecko.com/markets/images/698/small/bybit_spot.png?1706864649",
  gate: "https://coin-images.coingecko.com/markets/images/60/small/Frame_1.png?1747795534",
  okx: "https://coin-images.coingecko.com/markets/images/96/small/WeChat_Image_20220117220452.png?1706864283",
  bingx:
    "https://coin-images.coingecko.com/markets/images/812/small/YtFwQwJr_400x400.jpg?1706864837",
  bitget:
    "https://coin-images.coingecko.com/markets/images/540/small/2023-07-25_21.47.43.jpg?1706864507",
  hyperliquid:
    "https://coin-images.coingecko.com/markets/images/1571/small/PFP.png?1714470912",
  aster:
    "https://coin-images.coingecko.com/markets/images/22102/small/_ASTER.png?1758244334",
};

export const EXCHANGE_NAMES: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  gate: "Gate",
  okx: "OKX",
  bingx: "BingX",
  bitget: "Bitget",
  hyperliquid: "Hyperliquid",
  aster: "Aster",
};

export function exchangeName(exchange: string) {
  return EXCHANGE_NAMES[exchange] ?? exchange;
}

/** Exchange logo with a neutral icon when the image is missing or fails. */
export function ExchangeLogo({
  exchange,
  size = 16,
}: {
  exchange: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = LOGOS[exchange];
  if (!src || failed)
    return (
      <Landmark
        className="shrink-0 text-text-muted"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny fixed CDN icons
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-surface-2 object-cover"
      onError={() => setFailed(true)}
    />
  );
}
