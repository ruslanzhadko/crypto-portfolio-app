import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Newspaper,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchLandingMarket,
  type LandingCoin,
} from "@/lib/services/landing-market";
import { LiveMarket } from "@/components/landing/live-market";
import { ALL_CHAINS } from "@/lib/utils/networks";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Landing");

  let coins: LandingCoin[] = [];
  try {
    coins = await fetchLandingMarket();
  } catch {}

  const steps = [
    { num: "01", icon: Wallet, title: t("step1Title"), desc: t("step1Desc") },
    {
      num: "02",
      icon: BarChart3,
      title: t("step2Title"),
      desc: t("step2Desc"),
    },
    { num: "03", icon: Bell, title: t("step3Title"), desc: t("step3Desc") },
  ];

  const features = [
    { icon: Wallet, title: t("feature1Title"), desc: t("feature1Desc") },
    { icon: BarChart3, title: t("feature3Title"), desc: t("feature3Desc") },
    { icon: Bell, title: t("feature2Title"), desc: t("feature2Desc") },
    { icon: ShieldCheck, title: t("feature4Title"), desc: t("feature4Desc") },
  ];

  const faqs = [
    { q: t("faq1q"), a: t("faq1a") },
    { q: t("faq2q"), a: t("faq2a") },
    { q: t("faq3q"), a: t("faq3a") },
    { q: t("faq4q"), a: t("faq4a") },
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
      <header className="container relative z-20 flex h-20 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo2.png"
            alt="CryptoPortfolio"
            width={36}
            height={36}
            className="rounded-xl object-cover"
          />
          <span className="text-[15px] font-bold tracking-[-0.02em] sm:text-base">
            Crypto<span className="gradient-text">Portfolio</span>
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <LocaleSwitcher />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href="/feed">{t("navFeed")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">{t("navSignIn")}</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/auth/register">
              {t("navGetStarted")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="container relative flex min-h-[620px] items-center py-20 md:min-h-[700px] md:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="landing-display hero-enter mx-auto max-w-[12ch] font-extrabold">
            {t("heroTitle")}
            <br />
            <span className="gradient-text">{t("heroTitleAccent")}</span>
          </h1>
          <p className="hero-enter hero-enter-delay-1 mx-auto mt-8 max-w-[62ch] text-base font-medium leading-7 text-text-muted md:text-xl md:leading-8">
            {t("heroSubtitle")}
          </p>
          <div className="hero-enter hero-enter-delay-2 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="min-w-48 shadow-[0_12px_32px_rgba(108,99,255,0.22)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(108,99,255,0.3)]"
            >
              <Link href="/auth/register">{t("heroCreateAccount")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-32">
              <Link href="/auth/login">{t("heroSignIn")}</Link>
            </Button>
          </div>
        </div>
        <div
          className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted/70 md:flex"
          aria-hidden
        >
          <span className="h-10 w-px bg-gradient-to-b from-primary/70 to-transparent" />
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="container py-20 md:py-28">
        <ScrollReveal variant="sequence">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div
              className="sequence-item lg:sticky lg:top-24 lg:self-start"
              style={{ "--sequence-index": 0 } as React.CSSProperties}
            >
              <h2 className="landing-heading max-w-[10ch] font-bold">
                {t("howItWorksTitle")}
              </h2>
              <p className="landing-copy mt-5 text-text-muted">
                {t("howItWorksSubtitle")}
              </p>
            </div>
            <ol className="relative border-t border-border lg:border-l lg:border-t-0">
              {steps.map((step, index) => (
                <li
                  key={step.num}
                  className="sequence-item grid gap-5 border-b border-border py-8 first:pt-8 sm:grid-cols-[3rem_1fr] lg:px-9 lg:py-10 lg:first:pt-0"
                  style={
                    { "--sequence-index": index + 1 } as React.CSSProperties
                  }
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="mb-2 flex min-w-0 items-baseline gap-3">
                      <span className="font-mono text-xs font-semibold tabular-nums text-primary">
                        {step.num}
                      </span>
                      <h3 className="min-w-0 text-lg font-bold tracking-[-0.02em]">
                        {step.title}
                      </h3>
                    </div>
                    <p className="landing-copy text-[15px] text-text-muted md:text-base">
                      {step.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </ScrollReveal>
      </section>

      {/* ── Live market ── */}
      <LiveMarket initialCoins={coins} />

      {/* ── Public crypto feed ── */}
      <section className="container py-20 md:py-28">
        <ScrollReveal variant="left">
          <div className="mx-auto grid max-w-6xl overflow-hidden rounded-2xl bg-surface shadow-[0_28px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.06] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
              <h2 className="landing-heading max-w-[13ch] font-bold">
                {t("feedTitle")}
              </h2>
              <p className="landing-copy mt-6 max-w-xl text-base text-text-muted">
                {t("feedDescription")}
              </p>
              <div className="mt-7">
                <Button asChild size="lg">
                  <Link href="/feed">
                    {t("feedCta")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-text-muted">
                {t("feedNoAccount")}
              </p>
            </div>

            <div className="bg-surface-2/55 p-5 sm:p-7 lg:p-10">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {t("feedPreviewTitle")}
                  </span>
                </div>
                <span className="flex items-center gap-2 text-xs font-medium text-success">
                  <span
                    className="h-2 w-2 rounded-full bg-success"
                    aria-hidden
                  />
                  {t("feedLive")}
                </span>
              </div>

              <div className="divide-y divide-border overflow-hidden rounded-xl bg-background/80 ring-1 ring-white/[0.04]">
                {[
                  {
                    icon: Zap,
                    title: t("feedSignalTitle"),
                    desc: t("feedSignalDesc"),
                  },
                  {
                    icon: Search,
                    title: t("feedOpportunityTitle"),
                    desc: t("feedOpportunityDesc"),
                  },
                  {
                    icon: Newspaper,
                    title: t("feedNewsTitle"),
                    desc: t("feedNewsDesc"),
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 p-5 sm:p-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-text-muted">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ── Features ── */}
      <section className="container py-20 md:py-28">
        <ScrollReveal variant="right">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <div>
              <h2 className="landing-heading max-w-[12ch] font-bold">
                {t("featuresTitle")}
              </h2>
              <p className="landing-copy mt-5 text-text-muted">
                {t("featuresSubtitle")}
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-2">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="group bg-surface p-7 transition-colors duration-300 hover:bg-surface-2/80 sm:p-8"
                >
                  <div className="mb-8 flex items-center">
                    <f.icon className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <h3 className="text-lg font-bold tracking-[-0.02em]">
                    {f.title}
                  </h3>
                  <p className="landing-copy mt-3 text-[15px] text-text-muted">
                    {f.desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ── Networks ── */}
      <section className="container py-20 md:py-28">
        <ScrollReveal>
          <div className="mb-10 text-center">
            <h2 className="landing-heading font-bold">{t("networksTitle")}</h2>
            <p className="mt-4 text-base text-text-muted">
              {t("networksSubtitle")}
            </p>
          </div>
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-4 lg:grid-cols-6">
            {ALL_CHAINS.filter((chain) => !chain.chainName.startsWith("hypercore")).map((chain) => (
              <div
                key={chain.chainName}
                className="flex min-h-28 flex-col items-center justify-center gap-3 bg-surface p-4 text-center transition-colors duration-200 hover:bg-surface-2"
              >
                <Image
                  src={chain.chainLogoUrl}
                  alt={chain.displayName}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
                <span className="text-xs font-semibold leading-tight text-text-muted">
                  {chain.displayName}
                </span>
              </div>
            ))}
            <div className="flex min-h-28 flex-col items-center justify-center gap-3 bg-surface p-4 text-center">
              <Plus aria-hidden="true" className="h-8 w-8 text-primary" />
              <span className="text-xs font-semibold leading-tight text-text-muted">
                {t("moreNetworksSoon")}
              </span>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ── Telegram showcase ── */}
      <section className="container py-20 md:py-28">
        <ScrollReveal variant="left">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
              <div>
                <h2 className="landing-heading font-bold">
                  {t("telegramSubtitle")}
                </h2>
                <p className="landing-copy mt-6 text-text-muted">
                  {t("telegramDesc")}
                </p>
                <ul className="mt-7 space-y-3 border-t border-border pt-6">
                  {[
                    t("telegramFeature1"),
                    t("telegramFeature2"),
                    t("telegramFeature3"),
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm font-medium text-text-muted"
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary ring-1 ring-primary/20">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-center lg:justify-end">
                <div className="w-full max-w-[340px] rounded-2xl bg-[#18222d] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.36)] ring-1 ring-white/10">
                  <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
                    <Image
                      src="/logo2.png"
                      alt="CryptoPortfolio bot"
                      width={36}
                      height={36}
                      className="rounded-full object-cover"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        CryptoPortfolio
                      </p>
                      <p className="text-xs text-[#8096a7]">bot</p>
                    </div>
                  </div>
                  <div className="mb-2 ml-2 max-w-[90%] rounded-xl rounded-tl-none bg-[#2b5278] px-3.5 py-2.5 text-[13px] text-white">
                    <p>
                      🚨 <strong>Price alert: BTC</strong>
                    </p>
                    <p className="mt-1.5">
                      📈 Change: <strong>+5.43%</strong> in 1h
                    </p>
                    <p>
                      💰 Price now: <strong>$67,234</strong>
                    </p>
                    <p>
                      📌 Price before: <strong>$63,778</strong>
                    </p>
                    <p className="mt-1.5 text-[11px] text-[#8096a7]">
                      ⏱ 21.06.2026, 14:32:15
                    </p>
                  </div>
                  <div className="ml-2 max-w-[90%] rounded-xl rounded-tl-none bg-[#2b5278] px-3.5 py-2.5 text-[13px] text-white">
                    <p>
                      🎯 <strong>Target price: ETH</strong>
                    </p>
                    <p className="mt-1.5">
                      📈 Price went <strong>above</strong> $3,500
                    </p>
                    <p>
                      💰 Current price: <strong>$3,521</strong>
                    </p>
                    <p className="mt-1.5 text-[11px] italic text-[#8096a7]">
                      Trigger deactivated.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ── FAQ ── */}
      <section className="container py-20 md:py-28">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <h2 className="landing-heading font-bold">{t("faqTitle")}</h2>
              <p className="mt-4 text-base text-text-muted">
                {t("faqSubtitle")}
              </p>
            </div>
            <Card className="card-gradient overflow-hidden rounded-2xl shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <CardContent className="p-6 pt-6 sm:p-8 sm:pt-8">
                <LandingFaq items={faqs} />
              </CardContent>
            </Card>
          </div>
        </ScrollReveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8">
        <div className="container text-center text-sm font-medium text-text-muted">
          {t.rich("footerAuthor", {
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
