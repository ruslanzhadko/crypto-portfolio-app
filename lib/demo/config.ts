/**
 * The public demo: one shared, read-only account opened without a password. Its id comes from
 * `DEMO_USER_ID` (Vercel and the worker VM); without it the demo is off everywhere.
 */
export const DEMO_READ_ONLY = "DEMO_READ_ONLY";

export function demoUserId(): string | null {
  const id = process.env.DEMO_USER_ID?.trim();
  return id ? id : null;
}

export function isDemoUser(userId: string | null | undefined): boolean {
  const id = demoUserId();
  return !!id && userId === id;
}

/** Requests that change data; the demo account may only read. */
export function isWriteRequest(method: string, pathname: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  // Signing out (and the sign-in handshake) must keep working.
  return !pathname.startsWith("/api/auth/");
}
