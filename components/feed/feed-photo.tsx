"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function FeedPhoto({
  images,
  source,
}: {
  images: string[];
  source: string;
}) {
  const t = useTranslations("Feed");
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const touchStartX = useRef<number | null>(null);
  const visibleImages = images.filter((image) => !failed.includes(image));
  const currentIndex = Math.min(index, visibleImages.length - 1);
  const currentImage = visibleImages[currentIndex];
  const count = visibleImages.length;

  if (!currentImage) return null;

  const move = (direction: -1 | 1) => {
    setIndex((current) => (current + direction + count) % count);
  };
  const markFailed = (src: string) => {
    setFailed((current) => (current.includes(src) ? current : [...current, src]));
    setIndex(0);
  };
  const position = t("photoPosition", { current: currentIndex + 1, count });
  const controls = (large: boolean) =>
    count > 1 && (
      <div className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between sm:inset-x-4">
        {([-1, 1] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            onClick={() => move(direction)}
            aria-label={t(direction === -1 ? "previousPhoto" : "nextPhoto")}
            className={`pointer-events-auto flex items-center justify-center rounded-full bg-background/90 text-text shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${large ? "h-11 w-11" : "h-10 w-10"}`}
          >
            {direction === -1 ? (
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    );

  return (
    <Dialog.Root>
      <div className="mt-3 w-full max-w-2xl">
        <div className="relative overflow-hidden rounded-xl bg-surface-2">
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label={t("viewPhoto")}
              className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImage}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => markFailed(currentImage)}
                className="max-h-[32rem] w-full object-contain"
              />
            </button>
          </Dialog.Trigger>
          {count > 1 && (
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold text-text shadow-sm sm:left-3 sm:top-3">
              <Images className="h-4 w-4" aria-hidden="true" />
              {t("photoCount", { count })}
            </span>
          )}
          {controls(false)}
          {count > 1 && (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium tabular-nums text-text">
              {position}
            </span>
          )}
        </div>
        {count > 1 && (
          <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label={t("photoCount", { count })}>
            {visibleImages.map((image, imageIndex) => (
              <button
                key={image}
                type="button"
                onClick={() => setIndex(imageIndex)}
                aria-label={t("selectPhoto", { current: imageIndex + 1, count })}
                aria-current={imageIndex === currentIndex ? "true" : undefined}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${imageIndex === currentIndex ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => markFailed(image)}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (count < 2) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              move(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStartX.current === null || count < 2) return;
            const distance =
              (event.changedTouches[0]?.clientX ?? touchStartX.current) -
              touchStartX.current;
            if (Math.abs(distance) > 50) move(distance < 0 ? 1 : -1);
            touchStartX.current = null;
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface shadow-card focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <Dialog.Title className="min-w-0 truncate text-sm font-medium text-text">
              {t("photoFrom", { source })}
            </Dialog.Title>
            {count > 1 && (
              <span aria-live="polite" className="text-xs tabular-nums text-text-muted">
                {position}
              </span>
            )}
            <Dialog.Close
              aria-label={t("closePhoto")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImage}
              alt={t("photoFrom", { source })}
              onError={() => markFailed(currentImage)}
              className="min-h-0 max-h-[calc(100dvh-6rem)] w-full object-contain"
            />
            {controls(true)}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
