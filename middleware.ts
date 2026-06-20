import NextAuth from 'next-auth';
import createIntlMiddleware from 'next-intl/middleware';
import { authConfig } from '@/lib/auth/config';
import { routing } from '@/i18n/routing';

const handleI18nRouting = createIntlMiddleware(routing);
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  return handleI18nRouting(req);
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
