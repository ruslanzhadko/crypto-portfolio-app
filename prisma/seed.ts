import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.SEED_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'Set ADMIN_PASSWORD (or SEED_PASSWORD) in .env before seeding (see .env.example).',
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, passwordHash, isBlocked: false },
    create: {
      email: adminEmail,
      name: 'Administrator',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`✓ Admin user seeded: ${admin.email}`);

  const e2eEmail = process.env.E2E_EMAIL ?? 'e2e@test.local';
  const e2ePassword = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
  const e2eHash = await bcrypt.hash(e2ePassword, 12);

  const e2eUser = await prisma.user.upsert({
    where: { email: e2eEmail },
    update: { passwordHash: e2eHash, isBlocked: false },
    create: { email: e2eEmail, name: 'E2E User', passwordHash: e2eHash },
  });

  console.log(`✓ E2E user seeded: ${e2eUser.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
