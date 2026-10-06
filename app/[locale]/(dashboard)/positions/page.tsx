import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { PositionsPage } from "@/components/exchanges/positions-page";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await auth();
  if (!session?.user.id || !exchangesEnabled(session.user.id)) notFound();
  return <PositionsPage />;
}
