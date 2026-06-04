import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Тестова конфігурація для unit-тестів детермінованих pure-функцій бізнес-логіки.
// Покриття збирається ТІЛЬКИ по чистих модулях бізнес/утиліт-шару, БЕЗ домішування
// I/O-файлів (ankr.ts, price-updater.ts, coingecko.ts тощо) — вони занижують %.
export default defineConfig({
  resolve: {
    // Дзеркалимо tsconfig paths: "@/*" -> "./*"
    alias: { '@': resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Чистий бізнес/утиліт-шар (детермінований, без I/O):
      include: [
        'lib/services/portfolio-math.ts', // V = Σ balance×price, share %, PnL
        'lib/utils/validators.ts', // валідатори адрес EVM/Solana + zod-схеми
        'lib/utils/format.ts', // форматери чисел/відсотків/балансів/адрес
        'lib/utils/networks.ts', // мапінг ланцюгів (chainInfo / color / displayName)
      ],
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
