import { test, expect } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';

const email = 'auth-wallet-e2e@test.local';
const password = 'E2eWalletPassword123!';
const address = `0x${'b'.repeat(40)}`;

test.beforeAll(async () => {
  // Config refuses remote/production DBs. Reset fixture counters for local reruns.
  await prisma.authRateLimit.deleteMany({});
  await prisma.user.deleteMany({ where: { email } });
});
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('protected access → registration → wallet persistence → duplicate rejection → wrong password', async ({ page }) => {
  await page.goto('/en/exchanges');
  await expect(page).toHaveURL(/\/auth\/login/);
  // A cookie merely existing must not grant access at the API boundary.
  expect((await page.request.get('/api/wallets', {
    headers: { cookie: 'authjs.session-token=invalid' }, maxRedirects: 0,
  })).status()).toBe(401);

  await page.goto('/en/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Only external balance synchronization is stubbed; auth/API/DB stay real.
  await page.route('**/api/wallets/*/sync', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ result: { tokensSynced: 0, spamFiltered: 0 } }),
  }));
  await page.goto('/en/wallets');
  await page.getByRole('button', { name: 'Add wallet', exact: true }).click();
  await page.locator('#address').fill(address);
  await page.locator('#label').fill('CI wallet');
  await page.getByTestId('add-wallet-form').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('add-wallet-dialog')).not.toBeVisible();
  await expect(page.getByTestId('wallet-card').filter({ hasText: 'CI wallet' })).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(await prisma.wallet.count({ where: { userId: user.id, address } })).toBe(1);
  expect((await page.request.post('/api/wallets', {
    data: { address, network: 'EVM' },
  })).status()).toBe(409);

  await page.context().clearCookies();
  await page.goto('/en/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const duplicate = page.waitForResponse(response =>
    response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect((await duplicate).status()).toBe(409);
  await expect(page.locator('p.text-danger')).toBeVisible();
  expect(await prisma.user.count({ where: { email } })).toBe(1);

  await page.goto('/en/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('p.text-danger')).toContainText('Invalid email or password');
  await expect(page).toHaveURL(/\/auth\/login/);
});
