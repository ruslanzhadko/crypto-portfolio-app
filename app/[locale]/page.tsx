import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import {
  ArrowRight, BarChart3, Bell, ShieldCheck, Wallet,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fetchTopMarkets, type MarketCoin } from '@/lib/services/coingecko';
import { ALL_CHAINS } from '@/lib/utils/networks';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LocaleSwitcher } from '@/components/common/locale-switcher';
import { cn } from '@/lib/utils/cn';

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Landing');

  let coins: MarketCoin[] = [];
  try {
    coins = await fetchTopMarkets({ perPage: 6 });
  } catch {}

  const steps = [
    { num: '01', icon: Wallet, title: t('step1Title'), desc: t('step1Desc') },
    { num: '02', icon: BarChart3, title: t('step2Title'), desc: t('step2Desc') },
    { num: '03', icon: Bell, title: t('step3Title'), desc: t('step3Desc') },
  ];

  const features = [
    { icon: Wallet, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: BarChart3, title: t('feature3Title'), desc: t('feature3Desc') },
    { icon: Bell, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: ShieldCheck, title: t('feature4Title'), desc: t('feature4Desc') },
  ];

  const faqs = [
    { q: t('faq1q'), a: t('faq1a') },
    { q: t('faq2q'), a: t('faq2a') },
    { q: t('faq3q'), a: t('faq3a') },
    { q: t('faq4q'), a: t('faq4a') },
  ];

  return (
    <main className="relative min-h-screen overflow-x-hidden text-base">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[700px] w-[1000px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/10 blur-[130px]" />
        <div className="absolute left-0 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/6 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[600px] translate-x-1/4 translate-y-1/4 rounded-full bg-primary/8 blur-[120px]" />
      </div>

      {/* ── Nav ── */}
      <header className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/logo2.png"
            alt="CryptoPortfolio"
            width={32}
            height={32}
            className="rounded-lg object-cover"
          />
          <span className="font-semibold tracking-tight">
            Crypto<span className="gradient-text">Portfolio</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">{t('navSignIn')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/auth/register">
              {t('navGetStarted')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            {t('heroTitle')}{' '}
            <span className="gradient-text">{t('heroTitleAccent')}</span>
          </h1>
          <p className="mt-6 text-lg text-text-muted md:text-xl">
            {t('heroSubtitle')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth/register">{t('heroCreateAccount')}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auth/login">{t('heroSignIn')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="container pb-14">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('howItWorksTitle')}</h2>
          <p className="mt-2 text-base text-text-muted">{t('howItWorksSubtitle')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.num} className="card-gradient">
              <CardContent className="p-6 pt-6 sm:pt-6">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-text-muted">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Live market ── */}
      {coins.length > 0 && (
        <section className="container pb-14">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('liveMarketTitle')}</h2>
            <p className="mt-2 text-base text-text-muted">{t('liveMarketSubtitle')}</p>
          </div>
          <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-border bg-surface">
            {coins.map((coin) => {
              const change = coin.price_change_percentage_24h ?? 0;
              const positive = change >= 0;
              return (
                <div
                  key={coin.id}
                  className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0"
                >
                  <span className="w-5 text-right text-xs text-text-muted">
                    {coin.market_cap_rank}
                  </span>
                  {coin.image ? (
                    <Image src={coin.image} alt={coin.symbol} width={28} height={28} className="rounded-full" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-surface-2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold">{coin.symbol.toUpperCase()}</span>
                    <span className="ml-2 text-xs text-text-muted">{coin.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-medium">
                      ${coin.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </p>
                    <p className={cn('flex items-center justify-end gap-0.5 text-xs', positive ? 'text-success' : 'text-danger')}>
                      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {positive ? '+' : ''}{change.toFixed(2)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Features ── */}
      <section className="container pb-14">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('featuresTitle')}</h2>
          <p className="mt-2 text-base text-text-muted">{t('featuresSubtitle')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} className="card-gradient">
              <CardContent className="p-6 pt-6 sm:pt-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-base text-text-muted">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Networks ── */}
      <section className="container pb-14">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('networksTitle')}</h2>
          <p className="mt-2 text-base text-text-muted">{t('networksSubtitle')}</p>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-3 sm:grid-cols-9">
          {ALL_CHAINS.map((chain) => (
            <div
              key={chain.chainName}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-3 text-center transition-colors hover:border-primary/30"
            >
              <Image
                src={chain.chainLogoUrl}
                alt={chain.displayName}
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-[11px] font-medium leading-tight text-text-muted">
                {chain.displayName}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Telegram showcase ── */}
      <section className="container pb-14">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Bell className="h-3.5 w-3.5" />
                {t('telegramTitle')}
              </div>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                {t('telegramSubtitle')}
              </h2>
              <p className="mt-4 leading-relaxed text-text-muted">
                {t('telegramDesc')}
              </p>
              <ul className="mt-4 space-y-2">
                {[t('telegramFeature1'), t('telegramFeature2'), t('telegramFeature3')].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-text-muted">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-[320px] rounded-2xl bg-[#1c2733] p-4 shadow-2xl ring-1 ring-white/5">
                <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
                  <Image
                    src="/logo2.png"
                    alt="CryptoPortfolio bot"
                    width={36}
                    height={36}
                    className="rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">CryptoPortfolio</p>
                    <p className="text-xs text-[#8096a7]">bot</p>
                  </div>
                </div>
                <div className="mb-2 ml-2 max-w-[90%] rounded-xl rounded-tl-none bg-[#2b5278] px-3.5 py-2.5 text-[13px] text-white">
                  <p>🚨 <strong>Price alert: BTC</strong></p>
                  <p className="mt-1.5">📈 Change: <strong>+5.43%</strong> in 1h</p>
                  <p>💰 Price now: <strong>$67,234</strong></p>
                  <p>📌 Price before: <strong>$63,778</strong></p>
                  <p className="mt-1.5 text-[11px] text-[#8096a7]">⏱ 21.06.2026, 14:32:15</p>
                </div>
                <div className="ml-2 max-w-[90%] rounded-xl rounded-tl-none bg-[#2b5278] px-3.5 py-2.5 text-[13px] text-white">
                  <p>🎯 <strong>Target price: ETH</strong></p>
                  <p className="mt-1.5">📈 Price went <strong>above</strong> $3,500</p>
                  <p>💰 Current price: <strong>$3,521</strong></p>
                  <p className="mt-1.5 text-[11px] italic text-[#8096a7]">Trigger deactivated.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="container pb-14">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('faqTitle')}</h2>
            <p className="mt-2 text-base text-text-muted">{t('faqSubtitle')}</p>
          </div>
          <Card className="card-gradient">
            <CardContent className="p-6">
              <LandingFaq items={faqs} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-4">
        <div className="container text-center text-sm text-text-muted">
          {t.rich('footerAuthor', {
            link: (chunks) => (
              <a
                href="https://t.me/ludoslan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </div>
      </footer>
    </main>
  );
}
