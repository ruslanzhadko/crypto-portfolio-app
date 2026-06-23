import { test as setup } from '@playwright/test';
import path from 'path';

const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@test.local';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

// Browser-side half of E2E setup: log in via the UI and persist the
// session cookie so authenticated tests can reuse it via storageState.
// The user is guaranteed to exist with the correct password because
// prepare.ts (Playwright globalSetup) already ran the Prisma upsert.
setup('authenticate E2E user', async ({ page }) => {
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(E2E_EMAIL);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
