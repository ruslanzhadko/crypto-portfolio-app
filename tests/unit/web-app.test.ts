import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const token = vi.hoisted(() => vi.fn());
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn(() => { throw new Error('Manifest must bypass locale routing'); }) }));
vi.mock('next-auth/jwt', () => ({ getToken: token }));
import middleware from '@/middleware';

const signedIn = { cookie: 'authjs.session-token=x' };
afterEach(() => {
  vi.unstubAllEnvs();
  token.mockReset();
});

describe('installed web app navigation', () => {
  it('serves the manifest without auth or locale redirects', async () => {
    const response = await middleware(new NextRequest('https://app.example/manifest.webmanifest'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('read-only demo account', () => {
  it('refuses every change request of the demo account', async () => {
    vi.stubEnv('DEMO_USER_ID', 'demo-user');
    token.mockResolvedValue({ id: 'demo-user' });
    for (const [method, path] of [['POST', '/api/wallets'], ['PUT', '/api/user/profile'], ['DELETE', '/api/wallets/w1'], ['PATCH', '/api/exchanges/c1']]) {
      const response = await middleware(new NextRequest(`https://app.example${path}`, { method, headers: signedIn }));
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('DEMO_READ_ONLY');
    }
  });

  it('lets the demo account read and sign out, and leaves other users alone', async () => {
    vi.stubEnv('DEMO_USER_ID', 'demo-user');
    token.mockResolvedValue({ id: 'demo-user' });
    expect((await middleware(new NextRequest('https://app.example/api/wallets', { headers: signedIn }))).status).toBe(200);
    expect((await middleware(new NextRequest('https://app.example/api/auth/signout', { method: 'POST', headers: signedIn }))).status).toBe(200);
    token.mockResolvedValue({ id: 'real-user' });
    expect((await middleware(new NextRequest('https://app.example/api/wallets', { method: 'POST', headers: signedIn }))).status).toBe(200);
  });

  it('does nothing while the demo is not configured', async () => {
    token.mockResolvedValue({ id: 'demo-user' });
    expect((await middleware(new NextRequest('https://app.example/api/wallets', { method: 'POST', headers: signedIn }))).status).toBe(200);
    expect(token).not.toHaveBeenCalled();
  });
});
