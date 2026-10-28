"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Whether the signed-in account is the read-only demo. Controls that change data hide or disable
 * themselves with it; the server refuses those changes anyway (middleware).
 */
const DemoContext = createContext(false);

export function DemoProvider({
  demo,
  children,
}: {
  demo: boolean;
  children: React.ReactNode;
}) {
  return <DemoContext.Provider value={demo}>{children}</DemoContext.Provider>;
}

export function useIsDemo() {
  return useContext(DemoContext);
}

/**
 * Opens sign-up without leaving the demo: Back returns to it, and a new account's sign-in simply
 * replaces the demo session.
 */
export function DemoSignUpButton({
  size = "sm",
  className,
}: {
  size?: "sm" | "lg" | "default";
  className?: string;
}) {
  const t = useTranslations("Demo");
  return (
    <Button asChild size={size} className={className}>
      <Link href="/auth/register">{t("createAccount")}</Link>
    </Button>
  );
}

/** "This needs an account" notice with the sign-up button, for features the demo cannot use. */
export function DemoNotice({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/10 p-4 sm:p-5",
        className,
      )}
    >
      <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
      <DemoSignUpButton />
    </div>
  );
}
