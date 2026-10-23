/** Cron requests must carry the configured secret; request headers alone are forgeable. */
export function isCronAuthorized(authorization: string | null): boolean {
  // A pasted value may carry a trailing newline; callers send the trimmed secret.
  const secret = process.env.CRON_SECRET?.trim();
  return !!secret && authorization?.trim() === `Bearer ${secret}`;
}
