"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeCallbackUrl } from "@/lib/auth/redirect";

export function SocialButtons({
  available,
}: {
  available: { google: boolean; telegram: boolean };
}) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const params = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  async function login(provider: "google" | "telegram") {
    setPending(provider);
    setError(false);
    try {
      await signIn(provider, {
        redirectTo: safeCallbackUrl(params.get("callbackUrl"), locale),
      });
    } catch {
      setError(true);
      setPending(null);
    }
  }
  return (
    <div className="mb-6 space-y-3">
      {(["google", "telegram"] as const).map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="h-12 w-full text-sm"
          disabled={Boolean(pending) || !available[provider]}
          aria-describedby={
            !available[provider] ? "social-unavailable" : undefined
          }
          onClick={() => login(provider)}
        >
          {pending === provider ? (
            <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
          ) : provider === "telegram" ? (
            <Send aria-hidden className="h-5 w-5 text-sky-400" />
          ) : (
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04l3.34-2.59Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59C7.19 7.71 9.4 5.95 12 5.95Z"
              />
            </svg>
          )}
          {t(provider === "google" ? "continueGoogle" : "continueTelegram")}
        </Button>
      ))}
      {(!available.google || !available.telegram) && (
        <p
          id="social-unavailable"
          className="text-center text-xs leading-relaxed text-text-muted"
        >
          {t("socialUnavailable")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t("loginServiceErrorMessage")}
        </p>
      )}
      <div className="flex items-center gap-4 pt-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("orEmail")}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
