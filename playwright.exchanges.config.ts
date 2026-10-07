import { defineConfig, devices } from "@playwright/test";

// Never inherits the production DATABASE_URL from .env for fixture writes.
const url = process.env.EXCHANGE_TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).hostname !== "127.0.0.1" ||
  new URL(url).pathname !== "/exchange_test"
)
  throw new Error(
    "Set EXCHANGE_TEST_DATABASE_URL to an isolated localhost /exchange_test database.",
  );
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
export default defineConfig({
  testDir: "./tests/exchanges-e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["line"]],
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: url,
      DIRECT_URL: url,
      EXCHANGES_ENABLED: "true",
      EXCHANGES_PILOT_USER_IDS: "",
      AUTH_SECRET: "exchange-test-auth-secret-at-least-32-characters",
      NEXTAUTH_SECRET: "exchange-test-auth-secret-at-least-32-characters",
      NEXTAUTH_URL: "http://localhost:3100",
      AUTH_URL: "http://localhost:3100",
      EXCHANGE_ENCRYPTION_KEYS: JSON.stringify({
        1: Buffer.alloc(32, 3).toString("base64"),
      }),
      EXCHANGE_ENCRYPTION_KEY_VERSION: "1",
      EXCHANGE_FINGERPRINT_KEY:
        "exchange-test-fingerprint-at-least-32-characters",
      EXCHANGE_WORKER_PUBLIC_IP: "203.0.113.10",
    },
    timeout: 60_000,
  },
});
