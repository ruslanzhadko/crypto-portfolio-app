import { getTranslations } from "next-intl/server";
import { RefreshCw } from "lucide-react";
import { FeedStream } from "@/components/feed/feed-stream";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const t = await getTranslations("Feed");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t("pageTitle")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            {t("pageDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("autoRefresh")}
        </div>
      </div>
      <FeedStream />
    </div>
  );
}
