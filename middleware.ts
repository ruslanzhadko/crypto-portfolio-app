import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { type NextRequest, NextResponse } from "next/server";
import { isPublicPath } from "@/lib/auth/public-paths";

const handleI18nRouting = createIntlMiddleware(routing);

// All locales require a URL prefix with localePrefix: 'always'
const PREFIXED_LOCALES = ["en", "uk", "ru"] as const;

function stripLocalePrefix(pathname: string): {
  path: string;
  locale: string | null;
} {
  for (const locale of PREFIXED_LOCALES) {
    if (pathname.startsWith(`/${locale}/`))
      return { path: pathname.slice(locale.length + 1), locale };
    if (pathname === `/${locale}`) return { path: "/", locale };
  }
  return { path: pathname, locale: null };
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Installation metadata is shared by every locale and must never redirect
  // to login or a localized HTML page, even for signed-out visitors.
  if (pathname === '/manifest.webmanifest') return NextResponse.next();
  const { path, locale } = stripLocalePrefix(pathname);

  const sessionCookie =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  // Redirect logged-in users away from the landing page
  if (path === "/" && sessionCookie) {
    const dashboardPath = locale ? `/${locale}/dashboard` : "/en/dashboard";
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  // Redirect unauthenticated users from protected routes to login
  if (!isPublicPath(path) && !sessionCookie) {
    const loginPath = locale ? `/${locale}/auth/login` : "/en/auth/login";
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  // API routes don't need locale prefixes — skip i18n routing
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return handleI18nRouting(req);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
