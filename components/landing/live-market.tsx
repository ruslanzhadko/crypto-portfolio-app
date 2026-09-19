'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LandingCoin } from '@/lib/services/landing-market';

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
        const response = await fetch('/api/public/market', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json() as { coins: LandingCoin[] };
        if (!stopped) {
          setCoins(data.coins);
          setUnavailable(data.coins.some((coin) => Date.now() - Date.parse(coin.last_updated) > 5 * 60_000));
        }
      } catch {
        if (!stopped) setUnavailable(true);
      } finally {
        if (!stopped) timer = setTimeout(refresh, 60_000);
      }
    }
    void refresh();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, []);
  return <section className="container pb-14">
    <div className="mb-8 text-center">
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('liveMarketTitle')}</h2>
      <p className="mt-2 text-base text-text-muted">{t('liveMarketSubtitle')}</p>
      <p className="mt-2 text-xs text-text-muted" role="status">{t(unavailable ? 'marketUnavailable' : 'marketRefresh')}</p>
    </div>
    <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-border bg-surface">
      {coins.map((coin) => <div key={coin.id} className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0">
        <span className="w-5 text-right text-xs text-text-muted">{coin.market_cap_rank}</span>
        {coin.image && <Image src={coin.image} alt={coin.symbol} width={28} height={28} className="rounded-full" />}
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{coin.symbol.toUpperCase()}</span>
          <span className="ml-2 text-xs text-text-muted">{coin.name}</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-medium">${coin.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          <p className={`text-xs ${coin.price_change_percentage_24h === null ? 'text-text-muted' : coin.price_change_percentage_24h >= 0 ? 'text-success' : 'text-danger'}`}>
            {coin.price_change_percentage_24h === null ? '—' : `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(2)}%`}
          </p>
        </div>
      </div>)}
    </div>
  </section>;
}
