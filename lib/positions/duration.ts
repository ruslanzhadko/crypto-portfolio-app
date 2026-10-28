/** Whole days, hours and minutes of a position's life; seconds are dropped. */
export function durationParts(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return { d: Math.floor(minutes / 1440), h: Math.floor((minutes % 1440) / 60), m: minutes % 60 };
}

/** Two largest units, Russian (Telegram messages): "2 д 3 ч", "3 ч 12 мин", "45 мин". */
export function formatDurationRu(ms: number): string {
  const { d, h, m } = durationParts(ms);
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return m ? `${m} мин` : "меньше минуты";
}
