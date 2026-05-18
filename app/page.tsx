import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, BarChart3, Bell, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { auth } from '@/lib/auth';

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

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

  return (
    <main className="min-h-screen">
      <header className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
            <Wallet className="h-4 w-4 text-white" />
          </div>
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

      <section className="container py-20 md:py-32">
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
              <Link href="/auth/register">Почати</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auth/login">Вже маю акаунт</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container pb-20">
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

      <footer className="border-t border-border py-8">
        <div className="container text-center text-xs text-text-muted">
          Дипломний проєкт · КПІ ім. Ігоря Сікорського · Спеціальність 121 «Інженерія програмного забезпечення»
        </div>
      </footer>
    </main>
  );
}
