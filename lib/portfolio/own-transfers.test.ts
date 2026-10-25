import { describe, expect, it } from "vitest";
import { linkOwnTransfers } from "./own-transfers";

const HASH = `0x${"ab".repeat(32)}`;
const wallets = [
  { id: "main", address: "0xAAA0000000000000000000000000000000000001" },
  { id: "cold", address: "0xbbb0000000000000000000000000000000000002" },
];

describe("own transfers between wallets and exchanges", () => {
  it("folds a wallet send and an exchange deposit with the same hash into one row", () => {
    const links = linkOwnTransfers({
      walletTxs: [{ key: "w1", walletId: "main", hash: HASH, chainName: "bsc", type: "send", fromAddress: null, toAddress: "0xdeposit" }],
      // Exchanges may store the hash in upper case and without 0x.
      transfers: [{ key: "x1", connectionId: "binance", direction: "deposit", txHash: HASH.slice(2).toUpperCase(), address: null }],
      wallets,
    });
    expect(links.get("w1")).toEqual({ from: { kind: "wallet", id: "main" }, to: { kind: "exchange", id: "binance" }, hidden: false });
    expect(links.get("x1")).toMatchObject({ hidden: true });
  });

  it("links exchange to exchange and exchange to wallet by hash", () => {
    const links = linkOwnTransfers({
      walletTxs: [{ key: "w1", walletId: "cold", hash: HASH, chainName: "ethereum", type: "receive", fromAddress: "0xhot", toAddress: null }],
      transfers: [{ key: "x1", connectionId: "okx", direction: "withdrawal", txHash: HASH, address: null }],
      wallets,
    });
    expect(links.get("x1")).toEqual({ from: { kind: "exchange", id: "okx" }, to: { kind: "wallet", id: "cold" }, hidden: false });
    expect(links.get("w1")?.hidden).toBe(true);
  });

  it("recognises the other side by an own address when only one leg is loaded", () => {
    const links = linkOwnTransfers({
      walletTxs: [
        { key: "w1", walletId: "main", hash: "0x1", chainName: "ethereum", type: "send", fromAddress: null, toAddress: wallets[1]!.address },
        { key: "w2", walletId: "main", hash: "0x2", chainName: "ethereum", type: "send", fromAddress: null, toAddress: "0xstranger" },
      ],
      transfers: [{ key: "x1", connectionId: "bybit", direction: "withdrawal", txHash: null, address: wallets[0]!.address.toLowerCase() }],
      wallets,
    });
    expect(links.get("w1")).toEqual({ from: { kind: "wallet", id: "main" }, to: { kind: "wallet", id: "cold" }, hidden: false });
    expect(links.has("w2")).toBe(false);
    expect(links.get("x1")?.to).toEqual({ kind: "wallet", id: "main" });
  });

  it("recognises a send to an exchange deposit address used before", () => {
    const links = linkOwnTransfers({
      walletTxs: [{ key: "w1", walletId: "main", hash: "0x1", chainName: "bsc", type: "send", fromAddress: null, toAddress: "0xDEPOSIT" }],
      transfers: [{ key: "x1", connectionId: "okx", direction: "withdrawal", txHash: null, address: "0xdeposit" }],
      wallets,
      exchangeAddresses: [{ connectionId: "binance", address: "0xdeposit" }, { connectionId: "bybit", address: null }],
    });
    expect(links.get("w1")).toEqual({ from: { kind: "wallet", id: "main" }, to: { kind: "exchange", id: "binance" }, hidden: false });
    expect(links.get("x1")).toEqual({ from: { kind: "exchange", id: "okx" }, to: { kind: "exchange", id: "binance" }, hidden: false });
  });

  it("ignores swaps and two legs of the same account", () => {
    const links = linkOwnTransfers({
      walletTxs: [
        { key: "s", walletId: "main", hash: HASH, chainName: "ethereum", type: "swap", fromAddress: null, toAddress: null },
        { key: "r", walletId: "main", hash: HASH, chainName: "ethereum", type: "receive", fromAddress: null, toAddress: null },
      ],
      transfers: [],
      wallets,
    });
    expect(links.size).toBe(0);
  });
});
