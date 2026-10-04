export function sessionIsExpired(
  current: { sessionVersion: number } | null,
  tokenVersion?: number,
) {
  // Sessions issued before versioning remain usable until the first revocation.
  return !current || current.sessionVersion !== (tokenVersion ?? 0);
}
