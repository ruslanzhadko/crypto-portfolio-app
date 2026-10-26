import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/common/locale-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { exchangesEnabled } from "@/lib/exchanges/config";

/**
 * Frame of a public content page (changelog, guide): the app shell for a signed-in user, a plain
 * header with sign-in links for a visitor.
 */
export async function ContentShell({ children }: { children: ReactNode }) {
  const [landingT, session] = await Promise.all([
    getTranslations("Landing"),
    auth(),
  ]);

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
            {children}
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
      <div className="container relative py-8 md:py-12">{children}</div>
    </main>
  );
}
