import { test, expect, type Page, type Route } from "@playwright/test";
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
async function checkSearchKeepsPositions(page: Page) {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  const handler = async (route: Route) => {
    if (new URL(route.request().url()).searchParams.get('coin') === 'BTC') {
      started();
      await gate;
    }
    await route.continue();
  };
  await page.route('**/api/positions?**', handler);
  try {
    await page.getByRole('textbox', {name:'Asset',exact:true}).fill('BTC');
    await requested;
    await expect(page.getByText('BTCUSDT', {exact:true})).toBeVisible();
    await expect(page.getByLabel('Position statistics', {exact:true})).toBeVisible();
    await expect(page.getByText('Updating positions…', {exact:true})).toBeVisible();
  } finally { release(); }
  await expect(page.getByText('Updating positions…', {exact:true})).toHaveCount(0);
  await page.unroute('**/api/positions?**', handler);
  await page.getByRole('textbox', {name:'Asset',exact:true}).fill('');
  await expect(page.getByText('Updating positions…', {exact:true})).toHaveCount(0);
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
          funding: { amount: "-1.25", realizedPnl: "7.5", tradingFees: "0.25", breakEvenPrice: "69960", nextRate: "0.0001", nextTime: Date.now() + 3600_000, since: 1700000000000, updatedAt: 1700001000000, status: "complete" },
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
  await prisma.wallet.deleteMany({ where: { userId, label: "Aster wallet" } });
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

test("BingX connects with encrypted read-only credentials on desktop and mobile", async ({ page }) => {
  await page.goto("/en/exchanges");
  await page.getByRole("button", { name: "Connect exchange" }).click();
  await page.getByLabel("Exchange", { exact: true }).selectOption("bingx");
  await expect(page.getByLabel("API Passphrase", { exact: true })).toHaveCount(0);
  await expect(page.getByText("BingX: enable Read only", { exact: false })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel("Account name").fill("Main BingX");
  await page.getByLabel("API key", { exact: true }).fill("bingx-fixture-key-1234");
  await page.getByLabel("API secret", { exact: true }).fill("bingx-fixture-secret");
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByRole("link", { name: "Main BingX" })).toBeVisible();
  const c = await prisma.exchangeConnection.findFirstOrThrow({ where: { userId, label: "Main BingX" } });
  expect(c.exchange).toBe("bingx");
  expect(c.credentials).not.toContain("bingx-fixture-secret");
  await expect.poll(async () => (await prisma.exchangeSyncJob.findUnique({ where: { connectionId: c.id } })) !== null).toBe(true);
  const job = (await claimJob())!;
  const futures = fixture.accounts[0]!;
  expect(await commitResult(c.id, 1, job.token, { accounts: [
    { ...futures, accountKey: "futures:usdt", kind: "futures", mode: "perpetual", balances: futures.balances.map(b => ({ ...b, assetId: "bingx:USDT" })), positions: futures.positions!.map(p => ({ ...p, symbol: "BTC-USDT" })) },
    { ...futures, accountKey: "spot", kind: "spot", mode: "spot", equityUsd: "20", positions: [], unrealizedPnlUsd: null, balances: [] },
  ], failedAccounts: [] }, new Date())).toBe(true);
  const response = await page.request.get("/api/positions?exchange=bingx");
  expect(response.status()).toBe(200);
  expect((await response.json()).positions[0].symbol).toBe("BTC-USDT");
  await page.getByRole("link", { name: "Main BingX" }).click();
  await expect(page.getByText("BTC-USDT", { exact: true })).toBeVisible();
});
test("Gate and OKX connection forms, encrypted passphrase and OKX replacement", async ({ page }) => {
  await page.goto("/en/exchanges");
  await page.getByRole("button", { name: "Connect exchange" }).click();
  await page.getByLabel("Exchange", { exact: true }).selectOption("okx");
  const passphrase = page.getByLabel("API Passphrase", { exact: true });
  await expect(passphrase).toHaveAttribute("type", "password");
  await expect(passphrase).toHaveAttribute("required", "");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(passphrase).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.EXCHANGE_VISUAL_QA) await page.screenshot({ path: `test-results/okx-connection-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Exchange", { exact: true }).selectOption("gate");
  await expect(passphrase).toHaveCount(0);
  await page.getByLabel("Account name").fill("Main Gate");
  await page.getByLabel("API key", { exact: true }).fill("gate-fixture-key-1234");
  await page.getByLabel("API secret", { exact: true }).fill("gate-fixture-secret");
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByRole("link", { name: "Main Gate" })).toBeVisible();
  expect((await prisma.exchangeConnection.findFirstOrThrow({ where: { userId, label: "Main Gate" } })).exchange).toBe("gate");
  await page.getByRole("button", { name: "Connect exchange" }).click();
  await page.getByLabel("Exchange", { exact: true }).selectOption("okx");
  await page.getByLabel("Account name").fill("Main OKX");
  await page.getByLabel("API key", { exact: true }).fill("okx-fixture-key-1234");
  await page.getByLabel("API secret", { exact: true }).fill("okx-fixture-secret");
  await passphrase.fill("okx-fixture-passphrase");
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByRole("link", { name: "Main OKX" })).toBeVisible();
  const c = await prisma.exchangeConnection.findFirstOrThrow({ where: { userId, label: "Main OKX" } });
  expect(c.exchange).toBe("okx");
  expect(c.credentials).not.toContain("okx-fixture-passphrase");
  await page.getByRole("link", { name: "Main OKX" }).click();
  await page.getByRole("button", { name: "Replace API key" }).click();
  await expect(passphrase).toBeVisible();
  await page.getByLabel("API key", { exact: true }).fill("okx-replacement-key-5678");
  await page.getByLabel("API secret", { exact: true }).fill("okx-replacement-secret");
  await passphrase.fill("okx-replacement-passphrase");
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByText("••••5678", { exact: false })).toBeVisible();
  const updated = await prisma.exchangeConnection.findUniqueOrThrow({ where: { id: c.id } });
  expect(updated.credentialVersion).toBe(2);
  expect(updated.credentials).not.toBe(c.credentials);
  expect(updated.credentials).not.toContain("okx-replacement-passphrase");
});

test("Aster links an existing wallet without keys and coexists with Hyperliquid", async ({ page }) => {
  const wallet = await prisma.wallet.create({ data: { userId, address: `0x${"d".repeat(40)}`, network: "EVM", label: "Aster wallet" } });
  await prisma.exchangeConnection.create({ data: { userId, exchange: "hyperliquid", walletId: wallet.id, label: "Hyper wallet" } });
  await page.goto("/en/exchanges");
  await page.getByRole("button", { name: "Connect exchange" }).click();
  await page.getByLabel("Exchange", { exact: true }).selectOption("aster");
  await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
  await page.getByLabel("Account name").fill("Main Aster");
  await page.getByLabel("Wallet", { exact: true }).selectOption(wallet.id);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Save and verify" }).click();
  await expect(page.getByRole("link", { name: "Main Aster" })).toBeVisible();
  const connection = await prisma.exchangeConnection.findFirstOrThrow({ where: { userId, exchange: "aster", walletId: wallet.id } });
  expect(connection.credentials).toBeNull();
  await page.getByRole("link", { name: "Main Aster" }).click();
  await expect(page).toHaveURL(`/en/exchanges/${connection.id}`, { timeout: 15000 });
  await expect(page.getByRole("button", { name: "Replace API key" })).toHaveCount(0);
  await expect(page.getByText(/Aster positions and futures collateral/)).toBeVisible();
  await prisma.exchangeConnection.deleteMany({ where: { walletId: wallet.id } });
  await prisma.wallet.delete({ where: { id: wallet.id } });
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
  // Allow the protected dynamic route to finish streaming on cold CI runners.
  // Keep the balance/position assertions below: navigation alone is not success.
  await expect(page).toHaveURL(new RegExp(`/exchanges/${c.id}$`), { timeout: 15000 });
  await expect(page.getByText("$12,540.50", { exact: true })).toBeVisible();
  await expect(page.getByText("BTCUSDT", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Exchange", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Account", exact: true })).toHaveCount(0);
  await checkSearchKeepsPositions(page);
  await page.locator("summary").filter({ hasText: "BTCUSDT" }).click();
  await expect(
    page.getByText("Liquidation price", { exact: true }),
  ).toBeVisible();
  // A sync can replace database rows; disclosure identity must follow the position.
  const position = await prisma.exchangePosition.findFirstOrThrow({
    where: { account: { connectionId: c.id } },
  });
  await prisma.exchangePosition.update({
    where: { id: position.id },
    data: { id: `${position.id}-synced` },
  });
  const refreshed = page.waitForResponse(
    (response) => response.url().includes("/api/positions?") && response.ok(),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const body = await (await refreshed).json();
  expect(body.positions[0].id).toBe(`${position.id}-synced`);
  await expect(
    page
      .locator("details")
      .filter({ has: page.locator("summary").filter({ hasText: "BTCUSDT" }) }),
  ).toHaveAttribute("open", "");
  await expect(
    page.getByText("Liquidation price", { exact: true }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "BTCUSDT" }).click();
  await expect(
    page.getByText("Liquidation price", { exact: true }),
  ).not.toBeVisible();
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
  await expect(page.locator(".recharts-area-curve")).toHaveCount(3);
  // Exact source-transition behavior is covered by capital-chart-data.test.ts.
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  if (process.env.EXCHANGE_VISUAL_QA) await page.locator('.recharts-surface').first().screenshot({ path: "test-results/capital-chart-desktop.png" });
  await page.getByText("Capital history", { exact: true }).click();
  await expect(page.locator("#capital-sources").getByRole("heading", {name: "Capital sources"})).toBeVisible();
  expect(await page.locator("#capital-sources").evaluate(el => el.parentElement?.lastElementChild === el)).toBe(true);
  await expect(page.locator('.recharts-surface').first()).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.recharts-surface').first()).not.toBeVisible();
  await page.getByText("Capital history", { exact: true }).click();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await expect(page.getByText("DUST", { exact: true })).toHaveCount(0);
  await expect(page.getByText("UNKNOWN", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Partial valuation: some accounts or asset prices are missing.", { exact: true })).toBeVisible();
  await page.getByLabel("Balances from").selectOption("0");
  await expect(page.getByText("DUST", { exact: true })).toBeVisible();
  await expect(page.getByText("UNKNOWN", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "DUST", exact: true })).toHaveAttribute("src", /\/logo\.png$/);
  const widths = await page.locator("table th").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  await page.locator("table summary").first().click();
  expect(await page.locator("table th").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))).toEqual(widths);
  await page.getByLabel("Hide unpriced assets and valuation warnings").check();
  await expect(page.getByText("UNKNOWN", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Partial valuation: some accounts or asset prices are missing.", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Hide unpriced assets and valuation warnings")).toBeChecked();
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
  await checkSearchKeepsPositions(page);
  const positionDetails = page.locator("details").filter({has: page.getByText("BTCUSDT", {exact:true})});
  const statistics = page.getByLabel("Position statistics", { exact: true });
  await expect(statistics).toContainText("Long 1 · Short 0");
  await expect(statistics.getByText("Position exposure", { exact: true })).toBeVisible();
  await positionDetails.locator("summary").click();
  await expect(positionDetails.getByText("Funding since opening", {exact:true})).toBeVisible();
  await expect(positionDetails.getByText("-1.25 USDT", {exact:true})).toBeVisible();
  await expect(positionDetails.getByText("Account", {exact:true})).toHaveCount(0);
  await expect(positionDetails.getByText("Realized PnL", {exact:true})).toBeVisible();
  await expect(positionDetails.locator("summary")).toContainText("+6 USDT");
  await expect(positionDetails.getByText("Unrealized PnL", {exact:true})).toHaveCount(1);
  await expect(positionDetails.getByText("Funding since opening", {exact:true})).toHaveCount(1);
  await expect(positionDetails.getByText(/Already included in account equity/)).toHaveCount(0);
  await expect(positionDetails.locator("summary").getByText("-6.02%", { exact: true })).toBeVisible();
  await expect(positionDetails.getByText("Break-even price", { exact: true })).toBeVisible();
  await expect(positionDetails.getByText("69,960 USDT", { exact: true })).toBeVisible();
  await expect(positionDetails.getByText("Next funding", { exact: true })).toBeVisible();
  await expect(positionDetails.getByText("0.01%", { exact: true })).toBeVisible();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(positionDetails.getByRole("button", {name:"Breakdown",exact:true})).toHaveCount(0);
    await expect(positionDetails.getByText("PnL after fees", {exact:true})).toBeVisible();
    await expect(positionDetails.getByText("7.25 USDT", {exact:true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (process.env.EXCHANGE_VISUAL_QA) await page.screenshot({path:`test-results/positions-pnl-${width}.png`});
    await page.mouse.move(0, 0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("combobox", { name: "Direction", exact: true }).selectOption("short");
  await expect(page.getByText(/No open positions match/)).toBeVisible();
  await expect(statistics).toContainText("Long 0 · Short 0");
  await page.getByRole("combobox", { name: "Direction", exact: true }).selectOption("");
  await page.getByRole("combobox", { name: "Unrealized PnL result", exact: true }).selectOption("profit");
  await expect(page.getByText(/No open positions match/)).toBeVisible();
  await expect(statistics).toContainText("Long 0 · Short 0");
  await page.getByRole("combobox", { name: "Unrealized PnL result", exact: true }).selectOption("loss");
  await expect(page.getByText("BTCUSDT", { exact: true })).toBeVisible();
  await expect(statistics).toContainText("Long 1 · Short 0");
  await page.getByRole("combobox", { name: "Unrealized PnL result", exact: true }).selectOption("");
  for (const sort of ["pnl", "pnlAsc", "roe", "roeAsc"]) {
    const response = await page.request.get(`/api/positions?sort=${sort}`);
    expect(response.ok()).toBe(true);
  }
  await prisma.exchangePosition.updateMany({where: {account: {connection: {userId}}}, data: {unrealizedPnl: "120.5", unrealizedPnlUsd: "120.5"}});
  await page.reload();
  await expect(page.locator("summary").filter({hasText:"BTCUSDT"})).toContainText("+$120.50");
  await expect(page.locator("summary").filter({hasText:"BTCUSDT"})).toContainText("+6.02%");
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
