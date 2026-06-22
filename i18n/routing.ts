import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'uk', 'ru'],
  defaultLocale: 'en',
  localePrefix: 'always', // /en/dashboard, /uk/dashboard, /ru/dashboard
});
