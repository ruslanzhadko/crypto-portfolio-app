/** Internal placeholders are persistence keys, never contact addresses. */
export function publicEmail(email: string | null | undefined): string | null {
  return email && !email.toLowerCase().endsWith('@telegram.invalid')
    ? email
    : null;
}
