import { test, expect } from '@playwright/test';

const UNIQUE_SUFFIX = Date.now().toString(36);
const REG_EMAIL = `e2e-reg-${UNIQUE_SUFFIX}@test.local`;
const REG_PASSWORD = 'E2eRegTest99!';

test.describe('registration', () => {
  test('register with unique email → redirects to dashboard', async ({ page }) => {
    await page.goto('/en/auth/register');

    await page.getByLabel('Email').fill(REG_EMAIL);
    await page.getByRole('button', { name: 'Create account' }).click();
    // Password is required — browser validation fires first
    await expect(page.getByLabel('Password')).toBeFocused();

    await page.getByLabel('Password').fill(REG_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/en\/dashboard/);
  });

  test('register with already-registered email → inline error shown', async ({ page }) => {
    // Register the same email twice; second attempt must show the server error
    await page.goto('/en/auth/register');
    await page.getByLabel('Email').fill(REG_EMAIL);
    await page.getByLabel('Password').fill(REG_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    // Brief pause to let the first registration complete
    await page.waitForTimeout(2000);

    // Second registration with the same email
    await page.goto('/en/auth/register');
    await page.getByLabel('Email').fill(REG_EMAIL);
    await page.getByLabel('Password').fill(REG_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Use p.text-danger to avoid strict-mode clash with destructive toast <li>
    await expect(page.locator('p.text-danger')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/en\/auth\/register/);
  });
});

test.describe('login', () => {
  const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@test.local';
  const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';

  test('valid credentials → redirects to dashboard', async ({ page }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/en\/dashboard/);
  });

  test('wrong password → inline error, stays on login page', async ({ page }) => {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Use p.text-danger to avoid strict-mode clash with destructive toast <li>
    await expect(page.locator('p.text-danger')).toContainText('Invalid email or password', {
      timeout: 8_000,
    });
    await expect(page).toHaveURL(/\/en\/auth\/login/);
  });
});
