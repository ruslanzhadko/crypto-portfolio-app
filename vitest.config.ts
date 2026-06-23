import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Тестова конфігурація для unit-тестів детермінованих pure-функцій бізнес-логіки.
// Покриття збирається ТІЛЬКИ по чистих модулях бізнес/утиліт-шару, БЕЗ домішування
// I/O-файлів (ankr.ts, price-updater.ts, coingecko.ts тощо) — вони занижують %.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'lib/services/portfolio-math.ts',
        'lib/utils/validators.ts',
        'lib/utils/format.ts',
        'lib/utils/networks.ts',
        'lib/api/auth-guard.ts',
        'lib/api/response.ts',
        'app/api/auth/register/route.ts',
        'app/api/wallets/route.ts',
        'app/api/wallets/[id]/route.ts',
        'app/api/alerts/route.ts',
        'app/api/alerts/[id]/route.ts',
        'app/api/admin/users/route.ts',
        'app/api/admin/stats/route.ts',
        'app/api/telegram/webhook/route.ts',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
