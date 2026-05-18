import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - static files (_next/static, _next/image)
     * - favicon
     * - public images
     */
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
