import { afterEach, describe, expect, it } from 'vitest';
import { isCronAuthorized } from './auth';

const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe('isCronAuthorized', () => {
  it('fails closed without a configured secret', () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(null)).toBe(false);
  });
  it('accepts only the matching bearer secret', () => {
    process.env.CRON_SECRET = 'test-secret';
    expect(isCronAuthorized('Bearer test-secret')).toBe(true);
    expect(isCronAuthorized(null)).toBe(false);
    expect(isCronAuthorized('Bearer wrong')).toBe(false);
  });
});
