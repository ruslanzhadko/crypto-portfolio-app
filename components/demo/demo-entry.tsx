"use client";

import { useEffect, useState } from "react";
import { getCsrfToken, signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the demo at once; the button is there if the automatic start fails. A first visit has no
 * CSRF cookie yet, so it is fetched first and a failed attempt is retried once instead of landing
 * on the sign-in error page.
 */
export function DemoEntry() {
  const t = useTranslations("Demo");
  const locale = useLocale();
  const [failed, setFailed] = useState(false);
  const open = async () => {
    setFailed(false);
    const target = `/${locale}/dashboard`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await getCsrfToken();
        const result = await signIn("demo", {
          redirect: false,
          redirectTo: target,
        });
        if (result && !result.error) {
          window.location.assign(target);
          return;
        }
      } catch {
        // Retried once below.
      }
    }
    setFailed(true);
  };
  useEffect(() => {
    void open();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      {!failed && (
        <p className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("opening")}
        </p>
      )}
      <Button onClick={() => void open()}>{t("open")}</Button>
      {failed && <p className="text-sm text-danger">{t("failed")}</p>}
    </div>
  );
}
