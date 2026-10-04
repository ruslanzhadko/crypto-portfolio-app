import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { telegramProvider } from './telegram-provider';
import { telegramLinkTarget } from './telegram-link';
import {
  resolveTelegramIdentity,
  TelegramIdentityConflict,
} from './telegram-identity';
import { publicEmail } from './public-email';
import { resolveSocialUser, socialAvailability } from './social';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { loginSchema } from '@/lib/utils/validators';
import { authConfig } from './config';
import { allowAuthAttempt, clientAddress } from './rate-limit';
import { sessionIsExpired } from './session-policy';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === 'credentials') return true;
      if (!account || !['google', 'telegram'].includes(account.provider))
        return false;
      if (account.provider === 'google' && profile?.email_verified !== true)
        return false;
      let stored;
      if (account.provider === 'telegram') {
        let target: string | undefined;
        try {
          target = await telegramLinkTarget();
          const telegramId =
            typeof profile?.id === 'number' && Number.isSafeInteger(profile.id)
              ? String(profile.id)
              : typeof profile?.id === 'string' && /^\d+$/.test(profile.id)
                ? profile.id
                : undefined;
          stored = await resolveTelegramIdentity(
            account.providerAccountId,
            user.name ?? null,
            telegramId,
            target,
            // OAuth omitting scope means the granted scope equals the requested
            // scope. An explicit reduced scope must not enable bot messages.
            account.scope === undefined ||
              account.scope.split(/\s+/).includes('telegram:bot_access'),
          );
        } catch (error) {
          if (error instanceof TelegramIdentityConflict)
            return target || error.code === 'TelegramLinkExpired'
              ? `/settings?telegramError=${error.code}`
              : `/auth/error?error=${error.code}`;
          throw error;
        }
      } else
        stored = await resolveSocialUser(
          account.provider,
          account.providerAccountId,
          user.email?.toLowerCase() ?? null,
          user.name ?? null,
        );
      if (!stored) return false;
      Object.assign(user, {
        id: stored.id,
        email: publicEmail(stored.email),
        name: stored.name,
        role: stored.role,
        isBlocked: stored.isBlocked,
        sessionVersion: stored.sessionVersion,
      });
      return true;
    },
    async session({ session, token }) {
      if (!token?.id || !session.user) return session;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isBlocked: true,
          sessionVersion: true,
        },
      });
      session.user.id = current?.id ?? token.id;
      session.user.email = publicEmail(current?.email) ?? '';
      session.user.name = current?.name ?? null;
      session.user.role = current?.role ?? token.role;
      session.user.isBlocked = current?.isBlocked ?? true;
      session.user.sessionExpired = sessionIsExpired(
        current,
        token.sessionVersion,
      );
      if (session.user.sessionExpired) session.user.id = '';
      return session;
    },
  },
  providers: [
    ...(socialAvailability().google
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    ...(socialAvailability().telegram ? [telegramProvider()] : []),
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        if (
          !(await allowAuthAttempt(
            'login',
            clientAddress(request.headers),
            email,
          ))
        )
          return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            isBlocked: true,
            sessionVersion: true,
          },
        });

        if (!user || !user.passwordHash) return null;
        if (user.isBlocked) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isBlocked: user.isBlocked,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
