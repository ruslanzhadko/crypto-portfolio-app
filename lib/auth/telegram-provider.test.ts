import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '@auth/core';
import { encode } from 'next-auth/jwt';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { telegramProvider } from './telegram-provider';
import { compactTelegramState, withTelegramState } from './telegram-state';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function runCallback(mode: 'valid' | 'wrong-audience' | 'expired' | 'missing-pkce' | 'wrong-state' | 'invalid-signature') {
  const secret = 'telegram-test-only-auth-secret';
  vi.stubEnv('AUTH_SECRET', secret);
  vi.stubEnv('AUTH_TELEGRAM_ID', '123456');
  vi.stubEnv('AUTH_TELEGRAM_SECRET', 'test-client-secret');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const idToken = await new SignJWT({ name: 'Telegram Test', id: 1234 })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://oauth.telegram.org')
    .setSubject('98765').setAudience(mode === 'wrong-audience' ? 'another-app' : '123456')
    .setIssuedAt().setExpirationTime(mode === 'expired' ? Math.floor(Date.now() / 1000) - 3600 : '5m')
    .sign(privateKey);
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/.well-known/jwks.json')) {
      const key = await exportJWK(mode === 'invalid-signature' ? (await generateKeyPair('RS256')).publicKey : publicKey);
      return Response.json({ keys: [{ ...key, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
    }
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({
      issuer: 'https://oauth.telegram.org', authorization_endpoint: 'https://oauth.telegram.org/auth',
      token_endpoint: 'https://oauth.telegram.org/token', jwks_uri: 'https://oauth.telegram.org/.well-known/jwks.json',
      response_types_supported: ['code'], id_token_signing_alg_values_supported: ['RS256'],
      subject_types_supported: ['public'],
      // Deliberately no userinfo_endpoint, matching Telegram.
    });
    if (url === 'https://oauth.telegram.org/token') {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('code_verifier')).toBe('v'.repeat(43));
      expect(body.get('redirect_uri')).toBe('https://app.example/api/auth/callback/telegram');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Basic ${Buffer.from('123456:test-client-secret').toString('base64')}`);
      return Response.json({ access_token: 'test-access-token', token_type: 'Bearer', id_token: idToken });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const state = 'original-encrypted-state-for-this-browser';
  const cookies = ['__Secure-authjs.callback-url=https%3A%2F%2Fapp.example%2Fen%2Fdashboard'];
  for (const [name, value] of [['__Secure-authjs.state', state], ['__Secure-authjs.pkce.code_verifier', 'v'.repeat(43)]] as const) {
    if (mode === 'missing-pkce' && name.includes('pkce')) continue;
    cookies.push(`${name}=${await encode({ secret, salt: name, maxAge: 900, token: { value, provider: 'telegram' } })}`);
  }
  const provider = telegramProvider();
  const error = vi.fn();
  const signIn = vi.fn(async () => true);
  const handler = withTelegramState((request) => Auth(request, {
    secret, trustHost: true, basePath: '/api/auth', providers: [provider],
    session: { strategy: 'jwt' }, callbacks: { signIn }, logger: { error, warn: vi.fn(), debug: vi.fn() },
  }));
  const response = await handler(new NextRequest(`https://app.example/api/auth/callback/telegram?code=test-code&state=${compactTelegramState(mode === 'wrong-state' ? 'other-flow' : state)}`, {
    headers: { cookie: cookies.join('; ') },
  }));
  return { response, signIn, error, fetchMock };
}

describe('Telegram callback with the installed Auth.js implementation', () => {
  it('exchanges the code, reads ID-token profile and issues a session without userinfo', async () => {
    const { response, signIn, error, fetchMock } = await runCallback('valid');
    expect(error).not.toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({
      account: expect.objectContaining({ provider: 'telegram', providerAccountId: '98765' }),
      user: expect.objectContaining({ name: 'Telegram Test' }),
    }));
    expect(response.headers.get('location')).toBe('https://app.example/en/dashboard');
    expect(response.headers.getSetCookie().some(c => c.startsWith('__Secure-authjs.session-token='))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['wrong-audience', 'expired', 'missing-pkce', 'wrong-state', 'invalid-signature'] as const)('rejects %s before creating a session', async mode => {
    const { response, signIn } = await runCallback(mode);
    expect(signIn).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toContain(mode === 'invalid-signature' ? '/signin' : 'error=');
    expect(response.headers.getSetCookie().some(c => c.startsWith('__Secure-authjs.session-token='))).toBe(false);
  });
});
