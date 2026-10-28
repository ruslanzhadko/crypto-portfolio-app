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

  // Nothing to set up in the demo: settings and alerts point to sign-up instead.
  await page.goto('/en/settings');
  await expect(page.getByText('Settings come with your own account').first()).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveCount(0);
  await page.goto('/en/alerts');
  await expect(page.getByText('Alerts are for registered users').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create trigger' })).toHaveCount(0);
});

test('sign-up from the demo keeps the demo on Back and replaces it after registering', async ({ page }) => {
  const email = 'from-demo-e2e@test.local';
  // Registration is rate-limited per address; reruns must start from zero.
  await prisma.authRateLimit.deleteMany({});
  await prisma.user.deleteMany({ where: { email } });
  await page.goto('/en/demo');
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 30_000 });
  await page.goto('/en/alerts');
  await page.getByRole('link', { name: 'Create an account' }).first().click();
  await expect(page).toHaveURL(/\/en\/auth\/register/);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/alerts/);
  await expect(page.getByText('Demo mode')).toBeVisible();

  await page.getByRole('link', { name: 'Create an account' }).first().click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('FromDemoPassword123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText('Demo mode')).toHaveCount(0);
  await prisma.user.deleteMany({ where: { email } });
});
