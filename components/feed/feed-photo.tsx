"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export function FeedPhoto({ src, source }: { src: string; source: string }) {
  const t = useTranslations("Feed");
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={t("viewPhoto")}
          className="mt-3 block w-full max-w-2xl cursor-zoom-in overflow-hidden rounded-xl bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="max-h-[32rem] w-full object-contain"
          />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface shadow-card focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <Dialog.Title className="min-w-0 truncate text-sm font-medium text-text">
              {t("photoFrom", { source })}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("closePhoto")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={t("photoFrom", { source })}
            className="min-h-0 max-h-[calc(100dvh-6rem)] w-full object-contain"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
