'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LandingCoin } from '@/lib/services/landing-market';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

export function LiveMarket({ initialCoins }: { initialCoins: LandingCoin[] }) {
  const t = useTranslations('Landing');
  const [coins, setCoins] = useState(initialCoins);
  const [unavailable, setUnavailable] = useState(initialCoins.length === 0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch('/api/public/market', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Unavailable');
        const data = (await response.json()) as { coins: LandingCoin[] };
        if (!stopped) {
          setCoins(data.coins);
          setUnavailable(
            data.coins.some(
              (coin) => Date.now() - Date.parse(coin.last_updated) > 5 * 60_000,
            ),
          );
        }
      } catch {
        if (!stopped) setUnavailable(true);
      } finally {
        if (!stopped) timer = setTimeout(refresh, 60_000);
      }
    }
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <section className="container py-20 md:py-28">
      <ScrollReveal variant="sequence">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-20">
          <div
            className="sequence-item lg:sticky lg:top-24"
            style={{ '--sequence-index': 0 } as React.CSSProperties}
          >
            <h2 className="landing-heading max-w-[9ch] font-bold">
              {t('liveMarketTitle')}
            </h2>
            <p className="landing-copy mt-5 text-base text-text-muted">
              {t('liveMarketSubtitle')}
            </p>
            <p
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-text-muted"
              role="status"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${unavailable ? 'bg-warning' : 'bg-success'}`}
                aria-hidden
              />
              {t(unavailable ? 'marketUnavailable' : 'marketRefresh')}
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_24px_70px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.07]">
            {coins.map((coin, index) => (
              <div
                key={coin.id}
                className="sequence-item group flex min-h-[76px] items-center gap-4 border-b border-border px-5 py-4 transition-colors duration-200 last:border-0 hover:bg-surface-2/70 sm:px-7"
                style={{ '--sequence-index': index + 1 } as React.CSSProperties}
              >
                <span className="w-5 text-right font-mono text-xs tabular-nums text-text-muted">
                  {coin.market_cap_rank}
                </span>
                {coin.image && (
                  <Image
                    src={coin.image}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-bold tracking-[-0.02em]">
                    {coin.symbol.toUpperCase()}
                  </span>
                  <span className="ml-2 text-xs font-medium text-text-muted">
                    {coin.name}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    $
                    {coin.current_price.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p
                    className={`mt-0.5 font-mono text-xs tabular-nums ${coin.price_change_percentage_24h === null ? 'text-text-muted' : coin.price_change_percentage_24h >= 0 ? 'text-success' : 'text-danger'}`}
                  >
                    {coin.price_change_percentage_24h === null
                      ? '—'
                      : `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(2)}%`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
