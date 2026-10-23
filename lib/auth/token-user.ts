import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";

/**
 * The signed-in user id from the session cookie alone, without the database round trip that
 * auth() makes. Only for frequent polls that return the user's own non-sensitive data.
 */
export async function tokenUserId(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const jar = await cookies();
  const cookieName =
    jar.has("__Secure-authjs.session-token") || jar.has("__Secure-authjs.session-token.0")
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
  try {
    const token = await getToken({ req: { headers: await headers() }, secret, cookieName });
    return typeof token?.id === "string" && token.id ? token.id : null;
  } catch {
    return null;
  }
}
