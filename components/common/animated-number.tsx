"use client";
import { useTween } from "./use-tween";

/** A number that eases to its new value; `format` turns the shown value into text. */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number | null;
  format: (value: number) => string;
}) {
  const shown = useTween(value);
  return <>{shown === null ? "—" : format(shown)}</>;
}
