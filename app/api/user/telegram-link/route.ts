import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { requireUser } from '@/lib/api/auth-guard';
import { apiError, handleUnknown } from '@/lib/api/response';
import { TELEGRAM_LINK_COOKIE } from '@/lib/auth/telegram-link';
import { socialAvailability } from '@/lib/auth/social';

export async function POST(req: NextRequest) {
  try {
    // Explicit same-origin action; a third-party page cannot initiate linking.
    if (req.headers.get('origin') !== req.nextUrl.origin)
      return apiError('FORBIDDEN', 'Invalid origin');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    if (!socialAvailability().telegram)
      return apiError('BAD_REQUEST', 'Telegram is unavailable');
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('Missing auth secret');
    const value = await encode({
      secret,
      salt: TELEGRAM_LINK_COOKIE,
      maxAge: 600,
      token: { userId: guard.user.id },
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(TELEGRAM_LINK_COOKIE, value, {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return handleUnknown(error);
  }
}
