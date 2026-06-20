import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { type NextRequest, NextResponse } from 'next/server';

const handleI18nRouting = createIntlMiddleware(routing);

// Locales that appear as path prefix (en is default — no prefix with 'as-needed')
const PREFIXED_LOCALES = ['uk', 'ru'] as const;

function stripLocalePrefix(pathname: string): { path: string; locale: string | null } {
  for (const locale of PREFIXED_LOCALES) {
    if (pathname.startsWith(`/${locale}/`)) return { path: pathname.slice(locale.length + 1), locale };
    if (pathname === `/${locale}`) return { path: '/', locale };
  }
  return { path: pathname, locale: null };
}

function isPublicPath(path: string): boolean {
  return (
    path === '/' ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/health') ||
    path.startsWith('/api/cron') ||
    path === '/api/telegram/webhook'
  );
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { path, locale } = stripLocalePrefix(pathname);

  const sessionCookie =
    req.cookies.get('next-auth.session-token') ??
    req.cookies.get('__Secure-next-auth.session-token');

  // Redirect logged-in users away from the landing page
  if (path === '/' && sessionCookie) {
    const dashboardPath = locale ? `/${locale}/dashboard` : '/dashboard';
    return NextResponse.redirect(new URL(dashboardPath, req.url));
  }

  // Redirect unauthenticated users from protected routes to login
  if (!isPublicPath(path) && !sessionCookie) {
    const loginPath = locale ? `/${locale}/auth/login` : '/auth/login';
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  return handleI18nRouting(req);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
