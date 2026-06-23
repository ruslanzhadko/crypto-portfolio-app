import { test, expect } from '@playwright/test';

const PROTECTED_ROUTES = [
  '/en/dashboard',
  '/en/wallets',
  '/en/alerts',
  '/en/settings',
];

test.describe('unauthenticated access', () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} → redirects to login`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/en\/auth\/login/, { timeout: 10_000 });
    });
  }
});
