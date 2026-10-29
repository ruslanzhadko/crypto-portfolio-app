import { describe, expect, it } from "vitest";
import {
  friendlyTonAddress,
  isValidTonAddress,
  normalizeTonWallet,
  parseTonAddress,
  rawTonAddress,
  sameTonAddress,
} from "./ton-address";

// TON Foundation (old) wallet in its three spellings.
const RAW = "0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8";
const BOUNCEABLE = "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N";

describe("TON addresses", () => {
  it("reads raw and user-friendly forms of one account", () => {
    expect(rawTonAddress(parseTonAddress(BOUNCEABLE)!)).toBe(RAW);
    expect(rawTonAddress(parseTonAddress(RAW)!)).toBe(RAW);
  });

  it("stores wallets non-bounceable and contracts bounceable", () => {
    const wallet = normalizeTonWallet(RAW)!;
    expect(wallet.startsWith("UQ")).toBe(true);
    expect(normalizeTonWallet(BOUNCEABLE)).toBe(wallet);
    expect(normalizeTonWallet(wallet)).toBe(wallet);
    expect(friendlyTonAddress(RAW, true)).toBe(BOUNCEABLE);
    expect(sameTonAddress(wallet, BOUNCEABLE)).toBe(true);
  });

  it("accepts standard base64 as well as base64url", () => {
    const urlSafe = normalizeTonWallet(RAW)!;
    expect(isValidTonAddress(urlSafe.replace(/-/g, "+").replace(/_/g, "/"))).toBe(true);
  });

  it("rejects a broken checksum, other chains and garbage", () => {
    expect(isValidTonAddress(BOUNCEABLE.slice(0, -1) + "M")).toBe(false);
    expect(isValidTonAddress("0x0000000000000000000000000000000000000000")).toBe(false);
    expect(isValidTonAddress("So11111111111111111111111111111111111111112")).toBe(false);
    expect(isValidTonAddress("1:" + "a".repeat(64))).toBe(false);
    expect(friendlyTonAddress("not an address", true)).toBe("not an address");
  });
});
