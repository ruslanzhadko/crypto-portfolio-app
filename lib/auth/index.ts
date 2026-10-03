import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { telegramProvider } from "./telegram-provider";
import { resolveSocialUser, socialAvailability } from "./social";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/utils/validators";
import { authConfig } from "./config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;
      if (!account || !["google", "telegram"].includes(account.provider))
        return false;
      if (account.provider === "google" && profile?.email_verified !== true)
        return false;
      const stored = await resolveSocialUser(
        account.provider,
        account.providerAccountId,
        user.email?.toLowerCase() ?? null,
        user.name ?? null,
      );
      if (!stored) return false;
      Object.assign(user, {
        id: stored.id,
        email: stored.email,
        name: stored.name,
        role: stored.role,
        isBlocked: stored.isBlocked,
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
        },
      });
      session.user.id = current?.id ?? token.id;
      session.user.email = current?.email ?? "";
      session.user.name = current?.name ?? null;
      session.user.role = current?.role ?? token.role;
      session.user.isBlocked = current?.isBlocked ?? true;
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
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
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
