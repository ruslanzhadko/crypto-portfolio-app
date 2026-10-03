import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import messages from '@/messages/en.json';
vi.stubGlobal('React', React);
const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'fixture' } }),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: db } }));
vi.mock('@/lib/auth/social', () => ({
  socialAvailability: () => ({ telegram: true }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations:
    async () =>
    (key: keyof typeof messages.Settings, args?: Record<string, string>) => {
      let text: string = messages.Settings[key];
      for (const [k, v] of Object.entries(args ?? {}))
        text = text.replace(`{${k}}`, v);
      return text;
    },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: keyof typeof messages.Settings) =>
    messages.Settings[key],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/contexts/prize-context', () => ({
  usePrize: () => ({ triggerPrize: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
import SettingsPage from './page';
function preview(name: string, html: string) {
  if (process.env.AUTH_SETTINGS_PREVIEW_DIR)
    writeFileSync(
      join(process.env.AUTH_SETTINGS_PREVIEW_DIR, name + '.html'),
      `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="settings.css"><body><main style="max-width:1000px;margin:auto;padding:24px">${html}</main></body></html>`,
    );
}
beforeEach(() => vi.clearAllMocks());
it('shows Telegram identity without synthetic email or password controls', async () => {
  db.findUnique.mockResolvedValue({
    name: 'Telegram user',
    email: 'telegram-sub@telegram.invalid',
    role: 'USER',
    passwordHash: null,
    accounts: [{ provider: 'telegram' }],
  });
  const html = renderToStaticMarkup(await SettingsPage({ searchParams: {} }));
  expect(html).toContain('Telegram sign-in connected');
  expect(html).not.toContain('@telegram.invalid');
  expect(html).not.toContain('id="current"');
  expect(html).toContain('This account has no password');
  preview('telegram-settings', html);
});
it('offers linking while retaining email and password settings for the main account', async () => {
  db.findUnique.mockResolvedValue({
    name: 'Main',
    email: 'main@example.com',
    role: 'USER',
    passwordHash: 'not-a-real-hash',
    accounts: [],
  });
  const html = renderToStaticMarkup(await SettingsPage({ searchParams: {} }));
  expect(html).toContain('main@example.com');
  expect(html).toContain('id="current"');
  expect(html).toContain('Connect Telegram sign-in');
  preview('email-settings', html);
});
