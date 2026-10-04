import { cookies, headers } from 'next/headers';
import { decode, getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db/prisma';
import { TelegramIdentityConflict } from './telegram-identity';

export const TELEGRAM_LINK_COOKIE = 'telegram-link-intent';

/** A link requires explicit intent AND the same still-authenticated account. */
export async function telegramLinkTarget(): Promise<string | undefined> {
  const intent = cookies().get(TELEGRAM_LINK_COOKIE)?.value;
  if (!intent) return undefined;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Missing auth secret');
  let payload;
  try {
    payload = await decode({
      token: intent,
      secret,
      salt: TELEGRAM_LINK_COOKIE,
    });
  } catch {
    throw new TelegramIdentityConflict('TelegramLinkExpired');
  }
  const cookieName =
    cookies().has('__Secure-authjs.session-token') ||
    cookies().has('__Secure-authjs.session-token.0')
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token';
  const session = await getToken({
    req: { headers: headers() },
    secret,
    cookieName,
  });
  if (!payload?.userId || payload.userId !== session?.id)
    throw new TelegramIdentityConflict('TelegramLinkExpired');
  const current = await prisma.user.findUnique({
    where: { id: String(payload.userId) },
    select: { isBlocked: true, sessionVersion: true },
  });
  if (
    !current ||
    current.isBlocked ||
    current.sessionVersion !== (session?.sessionVersion ?? 0)
  )
    throw new TelegramIdentityConflict('TelegramLinkExpired');
  return String(payload.userId);
}
