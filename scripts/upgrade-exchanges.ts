import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

/** Additive upgrade for existing db-push installations. Never resets a database. */
async function main() {
  const db = new PrismaClient();
  try {
    const existing = await db.$queryRaw<
      { table: string | null }[]
    >`SELECT to_regclass('public."ExchangeConnection"')::text AS "table"`;
    if (existing[0]?.table)
      throw new Error(
        "Exchange tables already exist; inspect the schema instead of rerunning this upgrade.",
      );
    const sql = await readFile(resolve("prisma/exchanges.sql"), "utf8");
    // Generated DDL contains no functions, procedural blocks or semicolons in strings.
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (statements.some((s) => /^\s*(DROP|TRUNCATE|DELETE)\b/im.test(s)))
      throw new Error("Upgrade is not additive.");
    await db.$transaction(
      async (tx) => {
        for (const statement of statements)
          await tx.$executeRawUnsafe(statement);
      },
      { timeout: 60_000 },
    );
    console.log(
      "Exchange tables created. Existing wallet and history data were preserved.",
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "Exchange schema upgrade failed. No partial DDL was committed. Check migration prerequisites.",
  );
  process.exitCode = 1;
});
