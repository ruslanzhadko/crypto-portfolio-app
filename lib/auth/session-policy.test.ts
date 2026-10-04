import { expect, it } from 'vitest';
import { sessionIsExpired } from './session-policy';
it('preserves old sessions until the first password change', () => {
  expect(sessionIsExpired({ sessionVersion: 0 })).toBe(false);
  expect(sessionIsExpired({ sessionVersion: 1 })).toBe(true);
});
it('only accepts the current credential version', () => {
  expect(sessionIsExpired({ sessionVersion: 3 }, 2)).toBe(true);
  expect(sessionIsExpired({ sessionVersion: 3 }, 3)).toBe(false);
  expect(sessionIsExpired({ sessionVersion: 3 }, 4)).toBe(true);
});
it('revokes sessions for deleted accounts', () => {
  expect(sessionIsExpired(null, 0)).toBe(true);
});
