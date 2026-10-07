import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/db/prisma";
import { commitResult } from "../../lib/exchanges/worker";
import { claimJob as claimDueJob } from "../../lib/exchanges/queue";
import { saveCapitalSnapshot } from "../../lib/exchanges/portfolio";
import type { SyncResult } from "../../lib/exchanges/types";

const userId = "exchange-e2e",
  email = "e2e@test.local",
  password = "E2ePassword123!";
async function claimJob() {
  // Fixtures bypass scheduling, including host/Docker clock skew.
  await prisma.exchangeSyncJob.updateMany({
    where: { connection: { userId } }, data: { dueAt: new Date(0) },
  });
  return claimDueJob();
}
const fixture: SyncResult = {
  accounts: [
    {
      accountKey: "unified",
      kind: "unified",
      mode: "cross",
      equityUsd: "12540.5",
      availableUsd: "8400",
      unrealizedPnlUsd: "-120.5",
      complete: true,
      errorCode: null,
      balances: [
        {
          assetId: "bybit:USDT",
          symbol: "USDT",
          total: "12661",
          free: null,
          locked: "500",
          debt: null,
          priceUsd: "1",
          usdValue: "12661",
        },
      ],
      positions: [
        {
          positionKey: "BTCUSDT:1",
          symbol: "BTCUSDT",
          base: "BTC",
          settle: "USDT",
          side: "long",
          contracts: "0.15",
          contractSize: "1",
          baseSize: "0.15",
          notionalUsd: "10000",
          entryPrice: "70000",
          markPrice: "69196.666666",
          liquidationPrice: null,
          leverage: "5",
          marginMode: "cross",
          margin: "2000",
          unrealizedPnl: "-120.5",
          unrealizedPnlUsd: "-120.5",
        },
      ],
    },
  ],
  failedAccounts: [],
};

test.beforeAll(async () => {
  const target = process.env.EXCHANGE_TEST_DATABASE_URL;
  if (
    !target ||
    new URL(target).hostname !== "127.0.0.1" ||
    new URL(target).pathname !== "/exchange_test"
  )
    throw new Error("Unsafe test database");
  process.env.EXCHANGES_ENABLED = "true";
  process.env.EXCHANGES_PILOT_USER_IDS = "";
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      passwordHash: await bcrypt.hash(password, 10),
    },
    update: { passwordHash: await bcrypt.hash(password, 10), isBlocked: false },
  });
  await prisma.wallet.updateMany({
    where: { userId },
    data: { isActive: false },
  });
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/market/search?**", async (route) => {
    const symbol = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({ json: { results: symbol === "DUST" ? [{ symbol: "DUST", thumb: "/logo.png" }] : [] } });
  });
  await prisma.exchangeConnection.deleteMany({ where: { userId } });
  await prisma.portfolioCapitalSnapshot.deleteMany({ where: { userId } });
  await prisma.capitalEvent.deleteMany({ where: { userId } });
  await prisma.authRateLimit.deleteMany({
    where: { key: { startsWith: `exchange:${userId}:` } },
  });
  await prisma.exchangeWorkerLease.upsert({
    where: { name: "worker:e2e" },
    create: {
      name: "worker:e2e",
      owner: "e2e",
      expiresAt: new Date(Date.now() + 300000),
    },
    update: { expiresAt: new Date(Date.now() + 300000) },
  });
  await page.goto("/en/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
test.afterAll(async () => {
  await prisma.exchangeWorkerLease.deleteMany({
    where: { name: "worker:e2e" },
  });
  await prisma.$disconnect();
});

test("connect → queued sync → balances and positions → replace key → disconnect", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/en/exchanges");
  await page.getByRole("button", { name: "Connect exchange" }).click();
  await expect(page.getByText("203.0.113.10")).toBeVisible();
  await page.getByLabel("Account name").fill("Main Bybit");
  await page.getByLabel("API key", { exact: true }).fill("test-api-key-1234");
  await page.getByLabel("API secret", { exact: true }).fill("test-secret-5678");
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByRole("link", { name: "Main Bybit" })).toBeVisible();
  const c = await prisma.exchangeConnection.findFirstOrThrow({
    where: { userId, label: "Main Bybit" },
  });
  expect(c.credentials).not.toContain("test-secret-5678");
  const job = (await claimJob())!;
  expect(job.connectionId).toBe(c.id);
  expect(
    await commitResult(
      c.id,
      c.credentialVersion,
      job.token,
      fixture,
      new Date(),
    ),
  ).toBe(true);
  await saveCapitalSnapshot(userId);
  await page.getByRole("link", { name: "Main Bybit" }).click();
  await expect(page).toHaveURL(new RegExp(`/exchanges/${c.id}$`));
  await expect(page.getByText("$12,540.50", { exact: true })).toBeVisible();
  await expect(page.getByText("BTCUSDT", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Exchange", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Account", exact: true })).toHaveCount(0);
  await page.locator("summary").filter({ hasText: "BTCUSDT" }).click();
  await expect(
    page.getByText("Liquidation price", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replace API key" }).click();
  await page
    .getByLabel("API key", { exact: true })
    .fill("replacement-key-5678");
  await page
    .getByLabel("API secret", { exact: true })
    .fill("replacement-secret-1234");
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByText("••••5678", { exact: false })).toBeVisible();
  const replaced = await prisma.exchangeConnection.findUniqueOrThrow({
    where: { id: c.id },
  });
  expect(replaced.credentialVersion).toBe(2);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page
    .getByRole("button", { name: "Disconnect", exact: true })
    .last()
    .click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  expect(
    (await prisma.exchangeConnection.findUniqueOrThrow({ where: { id: c.id } }))
      .credentials,
  ).toBeNull();
  expect(
    await prisma.portfolioCapitalSnapshot.count({ where: { userId } }),
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("dashboard and positions render on desktop/mobile, old navigation remains reachable", async ({
  page,
}) => {
  const c = await prisma.exchangeConnection.create({
    data: {
      userId,
      exchange: "bybit",
      label: "Main Bybit",
      job: { create: {} },
    },
  });
  const job = (await claimJob())!;
  await commitResult(c.id, 1, job.token, fixture, new Date());
  const base = Date.now();
  const account = await prisma.exchangeAccount.findFirstOrThrow({ where: { connectionId: c.id } });
  await prisma.exchangeBalance.createMany({ data: [
    { accountId: account.id, assetId: "bybit:DUST", symbol: "DUST", total: "1", priceUsd: "0.09", usdValue: "0.09" },
    { accountId: account.id, assetId: "bybit:UNKNOWN", symbol: "UNKNOWN", total: "1000" },
  ] });
  await prisma.exchangeAccount.update({ where: { id: account.id }, data: { complete: false, errorCode: "UNPRICED_ASSETS" } });
  await prisma.exchangeConnection.update({ where: { id: c.id }, data: { status: "PARTIAL", errorCode: "UNPRICED_ASSETS" } });
  for (let i = 0; i < 4; i++)
    await prisma.portfolioCapitalSnapshot.create({
      data: {
        userId,
        bucket: new Date(base - (4 - i) * 300000),
        walletsUsd: "0",
        exchangesUsd: String(12200 + i * 100),
        totalUsd: String(12200 + i * 100),
        sourceSet: i === 3 ? "fixture-new-account" : "fixture",
        complete: true,
        sources: [],
      },
    });
  await page.goto("/en/dashboard");
  await expect(page.getByRole("paragraph").filter({ hasText: /^Total capital$/ })).toBeVisible();
  await expect(
    page.getByText("$12,540.50", { exact: true }).first(),
  ).toBeVisible();
  // Exact source-transition behavior is covered by capital-chart-data.test.ts.
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  if (process.env.EXCHANGE_VISUAL_QA) await page.locator('.recharts-surface').first().screenshot({ path: "test-results/capital-chart-desktop.png" });
  await page.getByText("Capital history", { exact: true }).click();
  await expect(page.locator('.recharts-surface').first()).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.recharts-surface').first()).not.toBeVisible();
  await page.getByText("Capital history", { exact: true }).click();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await expect(page.getByText("DUST", { exact: true })).toHaveCount(0);
  await expect(page.getByText("UNKNOWN", { exact: true })).toBeVisible();
  await expect(page.getByText("Partial valuation: some accounts or asset prices are missing.", { exact: true })).toBeVisible();
  await page.getByLabel("Balances from").selectOption("0");
  await expect(page.getByText("DUST", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "DUST", exact: true })).toHaveAttribute("src", /\/logo\.png$/);
  const widths = await page.locator("table th").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  await page.locator("table summary").first().click();
  expect(await page.locator("table th").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))).toEqual(widths);
  await page.getByLabel("Hide valuation warnings").check();
  await expect(page.getByText("Partial valuation: some accounts or asset prices are missing.", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Hide valuation warnings")).toBeChecked();
  await expect(page.getByLabel("Balances from")).toHaveValue("0");
  if (process.env.EXCHANGE_VISUAL_QA) {
    await page.getByLabel("Balances from").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/exchange-balances-desktop.png" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("table").scrollIntoViewIfNeeded();
  if (process.env.EXCHANGE_VISUAL_QA) {
    await page.getByLabel("Balances from").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/exchange-balances-mobile.png" });
  }
  await expect(page.getByRole("cell", { name: "$12,661.00", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/en/positions");
  await expect(page.getByText("BTCUSDT", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Direction", exact: true }).selectOption("short");
  await expect(page.getByText(/No open positions match/)).toBeVisible();
  await page.getByRole("combobox", { name: "Direction", exact: true }).selectOption("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("BTCUSDT", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Wallets", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Wallets", exact: true })
    .click();
  await expect(page).toHaveURL(/\/wallets$/);
});
