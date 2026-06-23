import { test, expect } from '@playwright/test';

test.describe('dashboard', () => {
  test('authenticated user sees Dashboard heading', async ({ page }) => {
    await page.goto('/en/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('wallets page', () => {
  // Use a unique EVM-format address per test run so re-runs don't hit a duplicate constraint.
  // Format: 0x + 16 hex digits (timestamp) + 24 zeros — passes /^0x[a-fA-F0-9]{40}$/.
  const ts = Date.now().toString(16).padStart(16, '0');
  const TEST_ADDRESS = `0x${ts}${'0'.repeat(24)}`;

  test('"Add wallet" button opens dialog', async ({ page }) => {
    await page.goto('/en/wallets');

    await page.getByRole('button', { name: 'Add wallet' }).click();

    await expect(page.locator('[data-testid="add-wallet-dialog"]')).toBeVisible();
  });

  test('submit valid EVM address → wallet card appears', async ({ page }) => {
    await page.goto('/en/wallets');

    await page.getByRole('button', { name: 'Add wallet' }).click();
    await expect(page.locator('[data-testid="add-wallet-dialog"]')).toBeVisible();

    await page.locator('#address').fill(TEST_ADDRESS);

    // Click the submit button inside the dialog (text "Add")
    await page.locator('[data-testid="add-wallet-form"]').getByRole('button', { name: 'Add' }).click();

    // Dialog should close after successful submission
    await expect(page.locator('[data-testid="add-wallet-dialog"]')).not.toBeVisible({
      timeout: 10_000,
    });

    // The new wallet's address (lowercased by API) should appear on the refreshed page
    await expect(page.getByText(TEST_ADDRESS.toLowerCase())).toBeVisible({ timeout: 8_000 });
  });

  test('submit empty address → browser validation blocks, dialog stays open', async ({ page }) => {
    await page.goto('/en/wallets');

    await page.getByRole('button', { name: 'Add wallet' }).click();
    await expect(page.locator('[data-testid="add-wallet-dialog"]')).toBeVisible();

    // Submit without filling in the required address field
    await page.locator('[data-testid="add-wallet-form"]').getByRole('button', { name: 'Add' }).click();

    // Dialog must stay open (browser required validation prevents submission)
    await expect(page.locator('[data-testid="add-wallet-dialog"]')).toBeVisible();
  });

  test('submit invalid EVM address → validation error shown, dialog stays open', async ({ page }) => {
    await page.goto('/en/wallets');

    await page.getByRole('button', { name: 'Add wallet' }).click();
    await page.locator('#address').fill('not-an-evm-address');
    await page.locator('[data-testid="add-wallet-form"]').getByRole('button', { name: 'Add' }).click();

    await expect(page.locator('.text-danger')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="add-wallet-dialog"]')).toBeVisible();
  });
});

test.describe('alerts / triggers', () => {
  test('/alerts/new renders the New trigger form', async ({ page }) => {
    await page.goto('/en/alerts/new');

    // Card title from i18n NewAlert.cardTitle
    await expect(page.getByRole('heading', { name: 'New trigger' })).toBeVisible({
      timeout: 10_000,
    });
  });
});
