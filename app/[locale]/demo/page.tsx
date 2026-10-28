import { getTranslations } from "next-intl/server";
import { demoUserId } from "@/lib/demo/config";
import { DemoEntry } from "@/components/demo/demo-entry";

export const dynamic = "force-dynamic";

/** Public entry: one click (or none) into the shared read-only demo account. */
export default async function DemoPage() {
  const t = await getTranslations("Demo");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6 text-center">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("description")}</p>
        {demoUserId() ? (
          <DemoEntry />
        ) : (
          <p className="text-sm text-warning">{t("unavailable")}</p>
        )}
      </div>
    </main>
  );
}
