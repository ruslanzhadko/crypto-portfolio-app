import { createHash, timingSafeEqual } from 'node:crypto';
import { decode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

type AuthHandler = (request: NextRequest) => Promise<Response>;

// Auth.js beta.32 sends an encrypted JWT as state. Telegram rejects its length.
// Send a 43-character SHA-256 digest; the original remains in Auth.js's encrypted,
// expiring, HttpOnly state cookie. Restore it only for the matching browser flow.
export function compactTelegramState(state: string) {
  return createHash('sha256').update(state).digest('base64url');
}

function shortenAuthorizationUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== 'https://oauth.telegram.org' || url.pathname !== '/auth')
    return value;
  const state = url.searchParams.get('state');
  if (state) url.searchParams.set('state', compactTelegramState(state));
  return url.toString();
}

async function restoreState(request: NextRequest) {
  const received = request.nextUrl.searchParams.get('state');
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!received || !/^[A-Za-z0-9_-]{43}$/.test(received) || !secret)
    return request;
  for (const name of ['__Secure-authjs.state', 'authjs.state']) {
    const token = request.cookies.get(name)?.value;
    if (!token) continue;
    try {
      const payload = await decode({ token, secret, salt: name });
      if (payload?.provider !== 'telegram' || typeof payload.value !== 'string')
        continue;
      const expected = compactTelegramState(payload.value);
      if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected)))
        continue;
      const url = new URL(request.url);
      url.searchParams.set('state', payload.value);
      return new NextRequest(url, request);
    } catch {
      // Leave invalid/expired cookies to Auth.js's normal error handling.
    }
  }
  return request;
}

export function withTelegramState(handler: AuthHandler): AuthHandler {
  return async (request) => {
    const path = request.nextUrl.pathname;
    let clearLinkIntent = false;
    if (request.method === 'POST' && path === '/api/auth/signin/telegram') {
      const body = await request
        .clone()
        .formData()
        .catch(() => null);
      if (body?.get('linkAccount') !== 'true') {
        // An abandoned settings flow must not turn a later ordinary login
        // into account linking. Auth.js still checks its own CSRF token.
        clearLinkIntent = request.cookies.has('telegram-link-intent');
        if (clearLinkIntent) {
          const headers = new Headers(request.headers);
          headers.set(
            'cookie',
            request.cookies
              .getAll()
              .filter((c) => c.name !== 'telegram-link-intent')
              .map((c) => `${c.name}=${c.value}`)
              .join('; '),
          );
          request = new NextRequest(request.url, {
            method: request.method,
            headers,
            body: await request.clone().text(),
          });
        }
      }
    }
    if (request.method === 'GET' && path === '/api/auth/callback/telegram') {
      // Auth.js still verifies state and PKCE, validates the ID token and clears
      // its original cookies. No checks are disabled or replaced.
      const response = await handler(await restoreState(request));
      const headers = new Headers(response.headers);
      headers.append(
        'set-cookie',
        `telegram-link-intent=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${request.nextUrl.protocol === 'https:' ? '; Secure' : ''}`,
      );
      return new Response(response.body, { status: response.status, headers });
    }
    const response = await handler(request);
    if (path !== '/api/auth/signin/telegram') return response;
    const headers = new Headers(response.headers);
    if (clearLinkIntent)
      headers.append(
        'set-cookie',
        `telegram-link-intent=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${request.nextUrl.protocol === 'https:' ? '; Secure' : ''}`,
      );
    const location = response.headers.get('location');
    if (location) {
      headers.set('location', shortenAuthorizationUrl(location));
    }
    // Auth.js keeps Location even in its JSON response. Rewrite BOTH: the React
    // client reads body.url and ignores Location on a successful JSON response.
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.clone().json();
      if (typeof body?.url === 'string') {
        headers.delete('content-length');
        return new Response(
          JSON.stringify({ ...body, url: shortenAuthorizationUrl(body.url) }),
          {
            status: response.status,
            headers,
          },
        );
      }
    }
    if (location)
      return new Response(response.body, { status: response.status, headers });
    return response;
  };
}
