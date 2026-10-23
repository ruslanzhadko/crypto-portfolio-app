import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { CHANGELOG, type ChangelogLocale } from "@/lib/changelog/entries";

export const dynamic = "force-dynamic";

function changelogLocale(locale: string): ChangelogLocale {
  return locale === "ru" || locale === "uk" ? locale : "en";
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = changelogLocale(locale);
  const [t, landingT, session] = await Promise.all([
    getTranslations("Changelog"),
    getTranslations("Landing"),
    auth(),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const content = (
    <div className="mx-auto max-w-3xl">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="mt-1.5 text-xs leading-5 text-text-muted md:text-sm">
          {t("pageDescription")}
        </p>
      </div>
      <ol className="mt-6 space-y-8">
        {CHANGELOG.map((entry, index) => (
          <li
            key={`${entry.date}-${index}`}
            className="grid gap-2 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-6"
          >
            <time
              dateTime={entry.date}
              className="text-sm font-medium text-text-muted md:pt-0.5"
            >
              {dateFormat.format(new Date(`${entry.date}T12:00:00Z`))}
            </time>
            <div>
              <h2 className="text-base font-semibold md:text-lg">
                {entry.title[lang]}
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-muted">
                {entry.items[lang].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-primary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );

  if (session?.user?.id) {
    return (
      <div className="flex min-h-screen">
        <Sidebar
          userRole={session.user.role}
          exchangesEnabled={exchangesEnabled(session.user.id)}
        />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Navbar
            email={session.user.email ?? ""}
            name={session.user.name}
            role={session.user.role}
          />
          <main className="relative min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-6 md:px-8 md:pb-8">
            {content}
          </main>
        </div>
        <MobileNav
          userRole={session.user.role}
          exchangesEnabled={exchangesEnabled(session.user.id)}
        />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/logo2.png"
              alt="CryptoPortfolio"
              width={32}
              height={32}
              className="rounded-lg object-cover"
            />
            <span className="hidden font-semibold tracking-tight sm:inline">
              Crypto<span className="text-primary">Portfolio</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/auth/login">{landingT("navSignIn")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/register">
                {landingT("navGetStarted")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <div className="container relative py-8 md:py-12">{content}</div>
    </main>
  );
}
