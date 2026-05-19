/**
 * Скидає всі синхронізовані дані, зберігаючи User / Wallet / PriceTrigger.
 * Запуск: npx tsx scripts/reset-token-data.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [balances, txs, snapshots, logs, prices, history] = await Promise.all([
    prisma.tokenBalance.count(),
    prisma.walletTransaction.count(),
    prisma.portfolioSnapshot.count(),
    prisma.notificationLog.count(),
    prisma.tokenPrice.count(),
    prisma.priceHistory.count(),
  ]);

  console.log('\nПоточний стан БД:');
  console.table({
    TokenBalance: balances,
    WalletTransaction: txs,
    PortfolioSnapshot: snapshots,
    NotificationLog: logs,
    TokenPrice: prices,
    PriceHistory: history,
  });

  if (balances + txs + snapshots + logs + prices + history === 0) {
    console.log('\n✅ База вже порожня.');
    return;
  }

  // Порядок важливий: спочатку залежні таблиці
  await prisma.priceHistory.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.portfolioSnapshot.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.tokenBalance.deleteMany();
  await prisma.tokenPrice.deleteMany();

  console.log('\n✅ Очищено:');
  console.log(`  TokenBalance      — ${balances}`);
  console.log(`  WalletTransaction — ${txs}`);
  console.log(`  PortfolioSnapshot — ${snapshots}`);
  console.log(`  NotificationLog   — ${logs}`);
  console.log(`  TokenPrice        — ${prices}`);
  console.log(`  PriceHistory      — ${history}`);
  console.log('\n  User, Wallet, PriceTrigger — збережено ✓');
  console.log('\n  Зроби Sync на дашборді щоб підтягнути баланси через Ankr.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
