import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import type { Credentials } from "./types";
import { ExchangeError } from "./types";

export const credentialsSchema = z
  .object({
    apiKey: z.string().trim().min(8).max(256),
    secret: z.string().trim().min(8).max(512),
  })
  .strict();

function keyring(): Record<string, string> {
  try {
    const keys = JSON.parse(
      process.env.EXCHANGE_ENCRYPTION_KEYS ?? "{}",
    ) as Record<string, string>;
    if (!keys || typeof keys !== "object" || Array.isArray(keys))
      throw new Error();
    return keys;
  } catch {
    throw new ExchangeError("CONFIGURATION");
  }
}
function key(version: string): Buffer {
  const raw = keyring()[version];
  if (typeof raw !== "string") throw new ExchangeError("CONFIGURATION");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new ExchangeError("CONFIGURATION");
  return bytes;
}
function aad(userId: string, connectionId: string, version: string) {
  return Buffer.from(
    JSON.stringify(["exchange-credentials", userId, connectionId, version]),
  );
}
export function encryptCredentials(
  credentials: Credentials,
  userId: string,
  connectionId: string,
): string {
  const version = process.env.EXCHANGE_ENCRYPTION_KEY_VERSION ?? "1";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(version), iv);
  cipher.setAAD(aad(userId, connectionId, version));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(credentialsSchema.parse(credentials))),
    cipher.final(),
  ]);
  return JSON.stringify({
    version,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function decryptCredentials(
  envelope: string,
  userId: string,
  connectionId: string,
): Credentials {
  try {
    const value = JSON.parse(envelope);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(value.version),
      Buffer.from(value.iv, "base64"),
    );
    decipher.setAAD(aad(userId, connectionId, value.version));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return credentialsSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(value.data, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      ),
    );
  } catch {
    throw new ExchangeError("CONFIGURATION");
  }
}
export function credentialFingerprint(apiKey: string): string {
  const secret = process.env.EXCHANGE_FINGERPRINT_KEY;
  if (!secret || secret.length < 32) throw new ExchangeError("CONFIGURATION");
  return createHmac("sha256", secret).update(apiKey).digest("hex");
}
export function maskKey(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}
