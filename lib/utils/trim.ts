/** Removes any of `chars` from the end of `value`; a loop instead of a backtracking `[…]+$` regex. */
export function trimTrailing(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value[end - 1]!)) end--;
  return value.slice(0, end);
}
