import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Playwright globalSetup — runs in Node.js before any browser test.
// Upserts the E2E test user so the password is always known regardless
// of prior database state. Playwright auto-loads .env from the project root,
// which gives PrismaClient its DATABASE_URL.
export default async function globalSetup() {
  const prisma = new PrismaClient();
  const email = process.env.E2E_EMAIL ?? 'e2e@test.local';
  const password = process.env.E2E_PASSWORD ?? 'E2ePassword123!';
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, isBlocked: false },
      create: { email, name: 'E2E User', passwordHash },
    });
  } finally {
    await prisma.$disconnect();
  }
}
