import { test as setup } from '@playwright/test';
import path from 'path';

const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@test.local';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate E2E user', async ({ page }) => {
  // Pre-warm the NextAuth handler.
  //
  // In `next dev`, the first request to any /api/auth/* route triggers
  // on-demand route compilation. If signIn() fires while the compilation is
  // still running, the credentials endpoint returns a transient error and
  // next-auth/react interprets it as wrong credentials — even though the
  // password is correct. Hitting /api/auth/csrf first blocks until the
  // entire [...nextauth] handler is compiled and ready.
  await page.request.get('/api/auth/csrf');

  // Login with up to 3 retries in case compilation didn't fully settle.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto('/en/auth/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    try {
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      break; // success
    } catch {
      if (attempt === 3) {
        throw new Error(
          'E2E login failed after 3 attempts — check that prepare.ts ran and credentials match',
        );
      }
      await page.waitForTimeout(3_000);
    }
  }

  await page.context().storageState({ path: AUTH_FILE });
});
