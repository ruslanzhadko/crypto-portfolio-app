/**
 * TON addresses. One account has several spellings: raw `0:<64 hex>` and user-friendly base64
 * (bounceable `EQ…`, non-bounceable `UQ…`, either in base64 or base64url). Wallets are stored in the
 * non-bounceable form the TON wallets show; contracts (jettons) in the bounceable form explorers use.
 */

export interface TonAddress {
  workchain: number;
  hash: Uint8Array;
}

const BOUNCEABLE = 0x11;
const NON_BOUNCEABLE = 0x51;
const TEST_ONLY = 0x80;

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function fromBase64(text: string): Uint8Array | null {
  const normal = text.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]{48}$/.test(normal)) return null;
  const binary = atob(normal);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

/** Raw or user-friendly mainnet address; null for anything else (testnet included). */
export function parseTonAddress(text: string): TonAddress | null {
  const value = text.trim();
  const raw = /^(-1|0):([0-9a-fA-F]{64})$/.exec(value);
  if (raw) {
    const hash = Uint8Array.from(raw[2]!.match(/../g)!, (h) => parseInt(h, 16));
    return { workchain: Number(raw[1]), hash };
  }
  const bytes = fromBase64(value);
  if (!bytes || bytes.length !== 36) return null;
  const tag = bytes[0]!;
  if (tag & TEST_ONLY) return null;
  if (tag !== BOUNCEABLE && tag !== NON_BOUNCEABLE) return null;
  if (crc16(bytes.subarray(0, 34)) !== ((bytes[34]! << 8) | bytes[35]!)) return null;
  const workchain = bytes[1] === 0xff ? -1 : bytes[1]!;
  if (workchain !== 0 && workchain !== -1) return null;
  return { workchain, hash: bytes.slice(2, 34) };
}

export function formatTonAddress(address: TonAddress, bounceable: boolean): string {
  const body = new Uint8Array(34);
  body[0] = bounceable ? BOUNCEABLE : NON_BOUNCEABLE;
  body[1] = address.workchain === -1 ? 0xff : address.workchain;
  body.set(address.hash, 2);
  const crc = crc16(body);
  const full = new Uint8Array(36);
  full.set(body);
  full[34] = crc >> 8;
  full[35] = crc & 0xff;
  return toBase64Url(full);
}

export function rawTonAddress(address: TonAddress): string {
  return `${address.workchain}:${Array.from(address.hash, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function isValidTonAddress(text: string): boolean {
  return parseTonAddress(text) !== null;
}

/** The form a wallet is stored and shown in (`UQ…`), or null when the text is not a TON address. */
export function normalizeTonWallet(text: string): string | null {
  const address = parseTonAddress(text);
  return address ? formatTonAddress(address, false) : null;
}

/** Any spelling → `UQ…` for wallets or `EQ…` for contracts; the input back when it cannot be parsed. */
export function friendlyTonAddress(text: string, bounceable: boolean): string {
  const address = parseTonAddress(text);
  return address ? formatTonAddress(address, bounceable) : text;
}

/** Same account, whatever the spelling. */
export function sameTonAddress(a: string, b: string): boolean {
  const x = parseTonAddress(a);
  const y = parseTonAddress(b);
  return !!x && !!y && rawTonAddress(x) === rawTonAddress(y);
}
