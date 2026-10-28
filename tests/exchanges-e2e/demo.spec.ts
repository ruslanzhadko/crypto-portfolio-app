import { test, expect } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';

// Matches DEMO_USER_ID of the test web server (playwright.exchanges.config.ts).
const id = 'e2e-demo-user';

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { id } });
  await prisma.user.create({ data: { id, email: 'demo-e2e@test.local', name: 'Demo' } });
  await prisma.wallet.create({
    data: { userId: id, address: `0x${'e'.repeat(40)}`, network: 'EVM', label: 'Demo wallet' },
  });
});
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
});

test('a fresh visitor opens the demo in one step and cannot change anything', async ({ page }) => {
  // A brand-new browser context: no CSRF or session cookie yet.
  await page.goto('/en/demo');
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText('Demo mode')).toBeVisible();
  // The read-only notice hooks into fetch after hydration.
  await page.waitForLoadState('networkidle');

  const refused = await page.evaluate(async () => {
    const response = await fetch('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: `0x${'1'.repeat(40)}`, network: 'EVM' }),
    });
    return { status: response.status, code: (await response.json()).error?.code };
  });
  expect(refused).toEqual({ status: 403, code: 'DEMO_READ_ONLY' });
  await expect(page.getByText('The demo is view-only').first()).toBeVisible();
  expect(await prisma.wallet.count({ where: { userId: id } })).toBe(1);
});
