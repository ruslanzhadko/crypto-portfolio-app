import { describe, expect, it } from 'vitest';
import { isPublicPath } from '@/lib/auth/public-paths';

describe('isPublicPath', () => {
  it('allows the public feed and its media files', () => {
    expect(isPublicPath('/feed')).toBe(true);
    expect(isPublicPath('/api/feed')).toBe(true);
    expect(isPublicPath('/api/feed/media/cm123')).toBe(true);
  });

  it('does not expose unrelated feed API routes', () => {
    expect(isPublicPath('/api/feed/admin')).toBe(false);
    expect(isPublicPath('/api/feed/media')).toBe(false);
  });
});
