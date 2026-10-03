import { cookies, headers } from 'next/headers';
import { decode, getToken } from 'next-auth/jwt';

export const TELEGRAM_LINK_COOKIE = 'telegram-link-intent';

/** A link requires explicit intent AND the same still-authenticated account. */
export async function telegramLinkTarget(): Promise<string | undefined> {
  const intent = cookies().get(TELEGRAM_LINK_COOKIE)?.value;
  if (!intent) return undefined;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Missing auth secret');
  const payload = await decode({
    token: intent,
    secret,
    salt: TELEGRAM_LINK_COOKIE,
  });
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
    throw new Error('Telegram link session expired');
  return String(payload.userId);
}
