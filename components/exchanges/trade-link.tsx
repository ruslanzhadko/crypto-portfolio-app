"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { exchangeTradeUrl } from "@/lib/exchanges/trade-links";
import { exchangeName } from "./exchange-logo";

/** The coin's market on the exchange that holds it, in a new tab; plain content when there is none. */
export function ExchangeTradeLink({
  exchange,
  symbol,
  kind,
  className,
  children,
}: {
  exchange: string;
  symbol: string;
  /** "futures" opens the perpetual; anything else the spot market. */
  kind?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Exchanges");
  const href = exchangeTradeUrl(exchange, symbol, kind);
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={t("openOnExchange", { exchange: exchangeName(exchange) })}
      // Rows around it fold and unfold on click; opening the exchange must not toggle them.
      onClick={(e) => e.stopPropagation()}
      className={cn("hover:text-primary hover:underline", className)}
    >
      {children}
    </a>
  );
}
