import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { exchangesEnabled } from "@/lib/exchanges/config";
import { ExchangesPage } from "@/components/exchanges/exchanges-page";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await auth();
  if (!session?.user.id || !exchangesEnabled(session.user.id)) notFound();
  return <ExchangesPage />;
}
