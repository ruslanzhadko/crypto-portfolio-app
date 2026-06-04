/**
 * One-time cleanup: знаходить і скидає TokenBalance записи з некоректним priceChange24h.
 * Запуск: npx tsx scripts/fix-bad-price-changes.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Знаходимо NaN-записи через raw SQL (Prisma filter не вміє знаходити NaN)
  const nanRecords = await prisma.$queryRaw<
    Array<{ id: string; tokenSymbol: string; chainName: string; usdValue: number }>
  >`SELECT id, "tokenSymbol", "chainName", "usdValue"
    FROM "TokenBalance"
    WHERE "priceChange24h" = 'NaN'::float`;

  if (nanRecords.length > 0) {
    console.log(`\n🟡 Знайдено ${nanRecords.length} записів з priceChange24h = NaN:\n`);
    console.table(nanRecords.map((b) => ({
      symbol: b.tokenSymbol,
      chain: b.chainName,
      change: 'NaN',
      usdValue: `$${b.usdValue.toFixed(2)}`,
    })));
    await prisma.$executeRaw`
      UPDATE "TokenBalance" SET "priceChange24h" = 0
      WHERE "priceChange24h" = 'NaN'::float
    `;
    console.log(`✅ Скинуто NaN → 0 для ${nanRecords.length} записів.`);
  }

  // 2. Знаходимо значення поза межами [-99.9, 10000]
  const bad = await prisma.tokenBalance.findMany({
    where: {
      OR: [
        { priceChange24h: { lt: -99.9 } },
        { priceChange24h: { gt: 10_000 } },
      ],
    },
    select: {
      id: true,
      tokenSymbol: true,
      chainName: true,
      priceChange24h: true,
      usdValue: true,
    },
    orderBy: { priceChange24h: 'asc' },
  });

  if (bad.length === 0 && nanRecords.length === 0) {
    console.log('✅ Брудних записів не знайдено.');
    return;
  }

  if (bad.length > 0) {
    console.log(`\n🔴 Знайдено ${bad.length} записів з некоректним priceChange24h:\n`);
    console.table(bad.map((b) => ({
      symbol: b.tokenSymbol,
      chain: b.chainName,
      change: `${b.priceChange24h.toFixed(2)}%`,
      usdValue: `$${b.usdValue.toFixed(2)}`,
    })));

    const { count } = await prisma.tokenBalance.updateMany({
      where: {
        OR: [
          { priceChange24h: { lt: -99.9 } },
          { priceChange24h: { gt: 10_000 } },
        ],
      },
      data: { priceChange24h: 0 },
    });
    console.log(`\n✅ Скинуто priceChange24h → 0 для ${count} записів.`);
  }

  console.log('   Запусти Sync на дашборді щоб підвантажити свіжі ціни.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
