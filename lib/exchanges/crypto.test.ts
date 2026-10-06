import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encryptCredentials,
  decryptCredentials,
  credentialFingerprint,
} from "./crypto";
const credentials = {
  apiKey: "test-only-key-1234",
  secret: "test-only-secret-5678",
};
beforeEach(() => {
  vi.stubEnv(
    "EXCHANGE_ENCRYPTION_KEYS",
    JSON.stringify({
      "1": Buffer.alloc(32, 1).toString("base64"),
      "2": Buffer.alloc(32, 2).toString("base64"),
    }),
  );
  vi.stubEnv("EXCHANGE_ENCRYPTION_KEY_VERSION", "1");
  vi.stubEnv(
    "EXCHANGE_FINGERPRINT_KEY",
    "test-fingerprint-key-at-least-32-characters",
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("exchange credential encryption", () => {
  it("round trips without storing plaintext and randomizes every envelope", () => {
    const a = encryptCredentials(credentials, "u", "c"),
      b = encryptCredentials(credentials, "u", "c");
    expect(a).not.toBe(b);
    expect(a).not.toContain(credentials.apiKey);
    expect(a).not.toContain(credentials.secret);
    expect(decryptCredentials(a, "u", "c")).toEqual(credentials);
  });
  it("rejects tampering and cross-user or cross-connection substitution", () => {
    const envelope = encryptCredentials(credentials, "u", "c");
    expect(() => decryptCredentials(envelope, "other", "c")).toThrow(
      "CONFIGURATION",
    );
    expect(() => decryptCredentials(envelope, "u", "other")).toThrow(
      "CONFIGURATION",
    );
    const parsed = JSON.parse(envelope);
    parsed.tag = Buffer.alloc(16).toString("base64");
    expect(() => decryptCredentials(JSON.stringify(parsed), "u", "c")).toThrow(
      "CONFIGURATION",
    );
  });
  it("supports rotation while retaining the old key and a stable separate fingerprint", () => {
    const old = encryptCredentials(credentials, "u", "c"),
      fingerprint = credentialFingerprint(credentials.apiKey);
    vi.stubEnv("EXCHANGE_ENCRYPTION_KEY_VERSION", "2");
    const next = encryptCredentials(
      decryptCredentials(old, "u", "c"),
      "u",
      "c",
    );
    expect(JSON.parse(next).version).toBe("2");
    expect(decryptCredentials(next, "u", "c")).toEqual(credentials);
    expect(credentialFingerprint(credentials.apiKey)).toBe(fingerprint);
  });
});
