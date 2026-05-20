import type { NextAuthConfig, DefaultSession } from 'next-auth';
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      isBlocked: boolean;
    } & DefaultSession['user'];
  }
  interface User {
    role: Role;
    isBlocked: boolean;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: Role;
    isBlocked: boolean;
  }
}

/**
 * Edge-safe base config — no Credentials provider (which needs Prisma).
 * Used by middleware. Full config (with providers) lives in `lib/auth/index.ts`.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.isBlocked = user.isBlocked;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.isBlocked = token.isBlocked;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isAuthPath = pathname.startsWith('/auth');
      const isPublic =
        pathname === '/' ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/health') ||
        pathname.startsWith('/api/cron') ||
        pathname.startsWith('/api/telegram/webhook') ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/icons') ||
        isAuthPath;

      if (isPublic) return true;
      return !!auth?.user;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
