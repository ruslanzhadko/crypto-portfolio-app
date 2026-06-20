import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import {
  ArrowRight, BarChart3, Bell, ShieldCheck, Wallet,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { fetchTopMarkets, type MarketCoin } from '@/lib/services/coingecko';
import { ALL_CHAINS } from '@/lib/utils/networks';
import { LandingFaq } from '@/components/landing/landing-faq';
import { cn } from '@/lib/utils/cn';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  let coins: MarketCoin[] = [];
  try {
    coins = await fetchTopMarkets({ perPage: 6 });
  } catch {}

  const steps = [
    {
      num: '01',
      icon: Wallet,
      title: 'Додай гаманець',
      desc: 'Вставте публічну адресу будь-якої мережі. Приватні ключі не потрібні.',
    },
    {
      num: '02',
      icon: BarChart3,
      title: 'Аналізуй портфель',
      desc: 'Загальна вартість, PnL за 24г, розподіл по мережах і токенах, графік динаміки.',
    },
    {
      num: '03',
      icon: Bell,
      title: 'Отримуй сповіщення',
      desc: 'Підключи Telegram і налаштуй тригери — бот повідомить про цінові аномалії миттєво.',
    },
  ];

  const features = [
    {
      icon: Wallet,
      title: '8 блокчейн-мереж',
      desc: 'Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, Solana — лише адреси, без приватних ключів.',
    },
    {
      icon: BarChart3,
      title: 'Аналітика портфеля',
      desc: 'PnL, агрегація по гаманцях, розподіл за мережами і токенами, графіки динаміки вартості.',
    },
    {
      icon: Bell,
      title: 'Telegram-сповіщення',
      desc: 'Налаштовуйте цінові тригери і отримуйте миттєві повідомлення про відхилення.',
    },
    {
      icon: ShieldCheck,
      title: 'Безпечно і безкоштовно',
      desc: 'Read-only режим. Жодних транзакцій, жодних підписок.',
    },
  ];

  const faqs = [
    {
      q: 'Чи безпечно підключати гаманець?',
      a: 'Абсолютно. Ви вказуєте лише публічну адресу — ніяких приватних ключів, seed-фраз або підписів. Додаток тільки читає on-chain дані у режимі read-only.',
    },
    {
      q: 'Скільки це коштує?',
      a: 'Повністю безкоштовно. Ніяких підписок, прихованих платежів або лімітів на кількість гаманців.',
    },
    {
      q: 'Як працюють Telegram-сповіщення?',
      a: 'Підключіть Telegram у налаштуваннях, задайте тригер (наприклад: зміна ціни BTC > 5% за годину або досягнення цільової ціни) — і бот надішле повідомлення як тільки умова виконається.',
    },
    {
      q: 'Які мережі підтримуються?',
      a: '8 мереж: Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche і Solana. EVM-гаманець відстежується одночасно на всіх 7 EVM-ланцюгах.',
    },
  ];

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* Top hero glow */}
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
        {/* Bottom-right accent */}
        <div className="absolute -bottom-32 right-0 h-[400px] w-[500px] rounded-full bg-primary/5 blur-[100px]" />
      </div>
      {/* ── Nav ── */}
      <header className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
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
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">Увійти</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/auth/register">
              Реєстрація <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Моніторинг крипто-портфеля{' '}
            <span className="gradient-text">в одному місці</span>
          </h1>
          <p className="mt-6 text-lg text-text-muted md:text-xl">
            On-chain баланси, біржові ціни, аналітика динаміки і Telegram-сповіщення — для приватного інвестора.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth/register">Почати безкоштовно</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auth/login">Вже маю акаунт</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="container pb-14">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Як це працює</h2>
          <p className="mt-2 text-text-muted">Три кроки до повного контролю над портфелем</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.num} className="card-gradient">
              <CardContent className="p-6">
                <div className="relative mb-5">
                  <span className="absolute -top-1 -left-1 text-5xl font-black text-primary/5 select-none leading-none">
                    {step.num}
                  </span>
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Live market ── */}
      {coins.length > 0 && (
        <section className="container pb-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Ринок прямо зараз</h2>
            <p className="mt-2 text-text-muted">Актуальні ціни з CoinGecko</p>
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
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Що всередині</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} className="card-gradient">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-text-muted">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Networks ── */}
      <section className="container pb-14">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">8 підтримуваних мереж</h2>
          <p className="mt-2 text-text-muted">Один EVM-гаманець охоплює 7 ланцюгів одночасно</p>
        </div>
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-3 sm:grid-cols-8">
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
                Telegram-сповіщення
              </div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                Ніколи не пропустиш<br />цінову аномалію
              </h2>
              <p className="mt-4 text-text-muted leading-relaxed">
                Підключи Telegram-бота в налаштуваннях і задай умови спрацювання:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  'Зміна ціни понад X% за обраний інтервал',
                  'Досягнення цільової ціни вгору або вниз',
                  'Підтримка будь-якого токена з вашого портфеля',
                ].map((item) => (
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
                    src="/logo.png"
                    alt="CryptoPortfolio bot"
                    width={36}
                    height={36}
                    className="rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">CryptoPortfolio</p>
                    <p className="text-xs text-[#8096a7]">бот</p>
                  </div>
                </div>
                <div className="mb-2 ml-2 max-w-[90%] rounded-xl rounded-tl-none bg-[#2b5278] px-3.5 py-2.5 text-[13px] text-white">
                  <p>🚨 <strong>Цінова аномалія: BTC</strong></p>
                  <p className="mt-1.5">📈 Зміна: <strong>+5.43%</strong> за 1 год</p>
                  <p>💰 Ціна зараз: <strong>$67,234</strong></p>
                  <p>📌 Ціна раніше: <strong>$63,778</strong></p>
                  <p className="mt-1.5 text-[11px] text-[#8096a7]">⏱ 21.06.2026, 14:32:15</p>
                </div>
                <div className="ml-2 max-w-[90%] rounded-xl rounded-tl-none bg-[#2b5278] px-3.5 py-2.5 text-[13px] text-white">
                  <p>🎯 <strong>Цільова ціна: ETH</strong></p>
                  <p className="mt-1.5">📈 Ціна пішла <strong>вище</strong> $3 500</p>
                  <p>💰 Поточна ціна: <strong>$3,521</strong></p>
                  <p className="mt-1.5 text-[11px] text-[#8096a7] italic">Тригер деактивовано.</p>
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
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Часті питання</h2>
          </div>
          <Card className="card-gradient">
            <CardContent className="p-6">
              <LandingFaq items={faqs} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="container pb-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Почати безкоштовно
          </h2>
          <p className="mt-3 text-text-muted">
            Реєстрація займає 30 секунд. Жодних карток, жодних підписок.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth/register">
                Створити акаунт <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auth/login">Увійти</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8">
        <div className="container text-center text-xs text-text-muted">
          Автор:{' '}
          <a
            href="https://t.me/ludoslan"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            @ludoslan
          </a>
        </div>
      </footer>
    </main>
  );
}
