"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DEMO_READ_ONLY } from "@/lib/demo/config";

/**
 * Shown only to the demo account. Every change is refused by the server (middleware); this turns
 * that refusal into one clear message wherever on the site it happens.
 */
export function DemoBanner() {
  const t = useTranslations("Demo");
  const locale = useLocale();
  const { toast } = useToast();

  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (response.status === 403) {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        if (body?.error?.code === DEMO_READ_ONLY)
          toast({
            title: t("readOnlyTitle"),
            description: t("readOnlyDescription"),
          });
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, [t, toast]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm md:px-8">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <b>{t("bannerTitle")}</b> · {t("bannerDescription")}
        </span>
      </span>
      <Button
        size="sm"
        onClick={() => void signOut({ redirectTo: `/${locale}/auth/register` })}
      >
        {t("createAccount")}
      </Button>
    </div>
  );
}
