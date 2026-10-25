import { prisma } from "@/lib/db/prisma";
import { normalizeHash } from "@/lib/portfolio/own-transfers";

/** The exchange side of an on-chain transfer that also shows in a user's wallet. */
export interface ExchangeLeg {
  connectionId: string;
  exchange: string;
  label: string;
  direction: "deposit" | "withdrawal";
}

/**
 * Looks wallet transaction hashes up in the user's whole stored exchange transfer history, so a
 * wallet send is recognised as a deposit to an own exchange even when that deposit is far older
 * than the page of exchange transfers the list has loaded. One query; hashes are compared without
 * case and 0x prefix, as exchanges store them their own way.
 */
export async function findExchangeLegs(userId: string, hashes: readonly string[]) {
  const wanted = [...new Set(hashes.map(normalizeHash).filter((hash): hash is string => hash !== null))];
  const legs = new Map<string, ExchangeLeg>();
  if (!wanted.length) return legs;
  const rows = await prisma.$queryRaw<(ExchangeLeg & { hash: string })[]>`
    SELECT t."connectionId", c.exchange, c.label, t.direction,
           lower(regexp_replace(t."txHash", '^0x', '')) AS hash
    FROM "ExchangeTransfer" t
    JOIN "ExchangeConnection" c ON c.id = t."connectionId"
    WHERE c."userId" = ${userId}
      AND c.status <> 'DISCONNECTED'
      AND t.status <> 'failed'
      AND lower(regexp_replace(t."txHash", '^0x', '')) = ANY(${wanted}::text[])`;
  for (const { hash, ...leg } of rows) legs.set(hash, leg);
  return legs;
}
