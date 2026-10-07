import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn(() => { throw new Error('Manifest must bypass locale routing'); }) }));
import middleware from '@/middleware';

describe('installed web app navigation', () => {
  it('serves the manifest without auth or locale redirects', () => {
    const response = middleware(new NextRequest('https://app.example/manifest.webmanifest'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
