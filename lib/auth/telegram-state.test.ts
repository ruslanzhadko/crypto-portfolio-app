import { afterEach, describe, expect, it, vi } from 'vitest';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { compactTelegramState, withTelegramState } from './telegram-state';

const secret = 'test-only-secret-for-telegram-state-roundtrip';
const original = 'encrypted-authjs-state.'.repeat(30);
const origin = 'https://app.example';
const authorize = `https://oauth.telegram.org/auth?state=${original}&code_challenge=pkce-value&code_challenge_method=S256`;
afterEach(() => vi.unstubAllEnvs());

async function callback(cookieName = '__Secure-authjs.state', provider = 'telegram', maxAge = 900, state = compactTelegramState(original)) {
  vi.stubEnv('AUTH_SECRET', secret);
  const token = await encode({ secret, salt: cookieName, maxAge, token: { value: original, provider } });
  return new NextRequest(`${origin}/api/auth/callback/telegram?code=test-code&state=${state}`, {
    headers: { cookie: `${cookieName}=${token}; other=preserved` },
  });
}

describe('Telegram compact state bridge', () => {
  it.each(['json', 'redirect', 'json-with-location'])('shortens %s sign-in responses and preserves cookies and PKCE', async (kind) => {
    const headers = new Headers();
    headers.append('set-cookie', 'authjs.state=encrypted; HttpOnly; Secure');
    headers.append('set-cookie', 'authjs.pkce.code_verifier=verifier; HttpOnly; Secure');
    const handler = vi.fn(async () => {
      if (kind === 'json-with-location') {
        headers.set('location', authorize);
        return Response.json({ url: authorize }, { headers });
      }
      if (kind === 'json') return Response.json({ url: authorize }, { headers });
      headers.set('location', authorize);
      return new Response(null, { status: 302, headers });
    });
    const response = await withTelegramState(handler)(new NextRequest(`${origin}/api/auth/signin/telegram`, { method: 'POST' }));
    const url = new URL(kind !== 'redirect' ? (await response.json()).url : response.headers.get('location')!);
    expect(url.searchParams.get('state')).toBe(compactTelegramState(original));
    expect(url.searchParams.get('state')).toHaveLength(43);
    expect(url.searchParams.get('code_challenge')).toBe('pkce-value');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    if (response.headers.has('location')) {
      expect(new URL(response.headers.get('location')!).searchParams.get('state')).toBe(compactTelegramState(original));
    }
  });

  it.each(['__Secure-authjs.state', 'authjs.state'])('restores state from %s for the normal Auth.js checks', async (name) => {
    const request = await callback(name);
    const handler = vi.fn(async () => new Response('ok'));
    await withTelegramState(handler)(request);
    const forwarded = handler.mock.calls[0] as unknown as [NextRequest];
    expect(forwarded[0].nextUrl.searchParams.get('state')).toBe(original);
    expect(forwarded[0].nextUrl.searchParams.get('code')).toBe('test-code');
    expect(forwarded[0].headers.get('cookie')).toBe(request.headers.get('cookie'));
  });

  it.each(['mismatch', 'expired', 'other-provider', 'tampered', 'missing'])('does not restore %s state', async (mode) => {
    let request = await callback('__Secure-authjs.state', mode === 'other-provider' ? 'google' : 'telegram',
      mode === 'expired' ? -3600 : 900, mode === 'mismatch' ? 'x'.repeat(43) : compactTelegramState(original));
    if (mode === 'tampered' || mode === 'missing') request = new NextRequest(request.url, {
      headers: { cookie: mode === 'tampered' ? '__Secure-authjs.state=tampered' : '' },
    });
    const handler = vi.fn(async () => new Response('normal Auth.js validation'));
    await withTelegramState(handler)(request);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it('leaves Google responses unchanged', async () => {
    const response = Response.json({ url: authorize });
    const handler = vi.fn(async () => response);
    expect(await withTelegramState(handler)(new NextRequest(`${origin}/api/auth/signin/google`, { method: 'POST' }))).toBe(response);
  });
});
