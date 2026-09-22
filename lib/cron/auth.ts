/** Cron requests must carry the configured secret; request headers alone are forgeable. */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && authorization === `Bearer ${secret}`;
}
