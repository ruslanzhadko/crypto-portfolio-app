import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import manifest from '@/app/manifest';
import { NAV_ITEMS } from '@/components/layout/nav-items';
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn(() => { throw new Error('Manifest must bypass locale routing'); }) }));
import middleware from '@/middleware';

describe('installed web app navigation', () => {
  it('keeps all sections and locales inside standalone scope', () => {
    const config = manifest();
    expect(config.display).toBe('standalone');
    expect(config.scope).toBe('/');
    expect(config.start_url).toBe('/');
    for (const locale of ['en', 'ru', 'uk']) {
      for (const item of NAV_ITEMS) {
        expect(new URL(`/${locale}${item.href}`, 'https://app.example').pathname.startsWith(config.scope!)).toBe(true);
      }
    }
  });
  it('serves the manifest without auth or locale redirects', () => {
    const response = middleware(new NextRequest('https://app.example/manifest.webmanifest'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
