import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'uk', 'ru'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /dashboard = English, /uk/dashboard, /ru/dashboard
});
