import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { type NextRequest, NextResponse } from "next/server";
import { isPublicPath } from "@/lib/auth/public-paths";
import { getToken } from "next-auth/jwt";
import { DEMO_READ_ONLY, demoUserId, isWriteRequest } from "@/lib/demo/config";

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

/** The demo account may only read: every change request of it is refused here, in one place. */
async function demoWriteRefused(req: NextRequest) {
  const demo = demoUserId();
  if (!demo || !isWriteRequest(req.method, req.nextUrl.pathname)) return false;
  const secure = req.nextUrl.protocol === "https:";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: secure,
    salt: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
  }).catch(() => null);
  return token?.id === demo;
}

export default async function middleware(req: NextRequest) {
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

  if (pathname.startsWith("/api/") && (await demoWriteRefused(req)))
    return NextResponse.json(
      { error: { code: DEMO_READ_ONLY, message: "The demo is read-only" } },
      { status: 403 },
    );

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
