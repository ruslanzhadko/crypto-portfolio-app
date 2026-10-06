import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { LegacyHistory } from "@/components/exchanges/legacy-history";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await auth();
  if (!session?.user.id) notFound();
  const latest = await prisma.portfolioSnapshot.findFirst({
    where: { userId: session.user.id },
    orderBy: { timestamp: "desc" },
  });
  return <LegacyHistory totalUsd={latest?.totalUsd ?? 0} />;
}
