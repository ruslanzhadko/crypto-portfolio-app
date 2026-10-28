"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the demo at once; the button is there if the automatic start fails. */
export function DemoEntry() {
  const t = useTranslations("Demo");
  const locale = useLocale();
  const [failed, setFailed] = useState(false);
  const open = () => {
    setFailed(false);
    signIn("demo", { redirectTo: `/${locale}/dashboard` }).catch(() =>
      setFailed(true),
    );
  };
  useEffect(open, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      {!failed && (
        <p className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("opening")}
        </p>
      )}
      <Button onClick={open}>{t("open")}</Button>
      {failed && <p className="text-sm text-danger">{t("failed")}</p>}
    </div>
  );
}
