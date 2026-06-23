import { test as setup, expect } from '@playwright/test';
import path from 'path';

const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@test.local';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate E2E user', async ({ page, request }) => {
  // Upsert the E2E user via a dev-only endpoint so we always get the correct
  // password regardless of what's already in the database.
  const seed = await request.post('/api/e2e/setup');
  expect(seed.ok()).toBeTruthy();

  // Log in via the UI so Next-Auth sets the session cookie on the page context
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(E2E_EMAIL);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to dashboard after successful login
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
