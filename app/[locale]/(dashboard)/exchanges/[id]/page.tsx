import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { ConnectionDetail } from "@/components/exchanges/connection-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user.id || !exchangesEnabled(session.user.id)) notFound();
  const connection = await prisma.exchangeConnection.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!connection) notFound();
  return <ConnectionDetail id={connection.id} />;
}
