import Image from "next/image";
import { ArrowRight, LayoutDashboard, RefreshCw } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { FeedStream } from "@/components/feed/feed-stream";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { exchangesEnabled } from "@/lib/exchanges/config";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, landingT, session] = await Promise.all([
    getTranslations("Feed"),
    getTranslations("Landing"),
    auth(),
  ]);

  const feedContent = (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t("pageTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted md:text-base">
            {t("pageDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-text-muted">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("autoRefresh")}
        </div>
      </div>
      <div className="pt-5">
        <FeedStream />
      </div>
    </div>
  );

  if (session?.user?.id) {
    return (
      <div className="flex min-h-screen">
        <Sidebar userRole={session.user.role} exchangesEnabled={exchangesEnabled(session.user.id)} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Navbar
            email={session.user.email ?? ""}
            name={session.user.name}
            role={session.user.role}
          />
          <main className="relative min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-6 md:px-8 md:pb-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] bg-primary/5 blur-[120px]" />
            {feedContent}
          </main>
        </div>
        <MobileNav userRole={session.user.role} exchangesEnabled={exchangesEnabled(session.user.id)} />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[130px]" />
      </div>

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
            {session?.user?.id ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  {t("openDashboard")}
                </Link>
              </Button>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </header>

      <div className="container relative py-8 md:py-12">{feedContent}</div>
    </main>
  );
}
