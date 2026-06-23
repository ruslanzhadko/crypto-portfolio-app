import { test as setup, expect } from '@playwright/test';
import path from 'path';

const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@test.local';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate E2E user', async ({ page, request }) => {
  // Ensure the E2E user exists — register if not, ignore 409 conflict
  const reg = await request.post('/api/auth/register', {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD, name: 'E2E User' },
  });
  // 201 = created, 409 = already exists — both are fine
  expect([201, 409]).toContain(reg.status());

  // Log in via the UI so Next-Auth sets the session cookie
  await page.goto('/en/auth/login');
  await page.getByLabel('Email').fill(E2E_EMAIL);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to dashboard after successful login
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
