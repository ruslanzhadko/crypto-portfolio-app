import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { loginSchema } from '@/lib/utils/validators';
import { authConfig } from './config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (!token?.id || !session.user) return session;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, email: true, name: true, role: true, isBlocked: true },
      });
      session.user.id = current?.id ?? token.id;
      session.user.email = current?.email ?? '';
      session.user.name = current?.name ?? null;
      session.user.role = current?.role ?? token.role;
      session.user.isBlocked = current?.isBlocked ?? true;
      return session;
    },
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            isBlocked: true,
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
        };
      },
    }),
  ],
});
