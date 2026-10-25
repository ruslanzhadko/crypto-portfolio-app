import { describe, expect, it } from "vitest";
import { transferChain, transferExplorerUrl } from "./transfer-networks";

const HASH = `0x${"a".repeat(64)}`;

describe("exchange transfer networks", () => {
  it("maps exchange network names to wallet chains or readable names", () => {
    expect(transferChain("BSC")).toBe("bsc");
    expect(transferChain("ETH")).toBe("ethereum");
    expect(transferChain("USDT-Polygon")).toBe("polygon");
    expect(transferChain("Arbitrum One")).toBe("arbitrum");
    expect(transferChain("TRX")).toBe("Tron");
    expect(transferChain("PLASMA")).toBe("Plasma");
    expect(transferChain("SomeNewChain")).toBe("SomeNewChain");
    expect(transferChain(null)).toBeNull();
    expect(transferChain("  ")).toBeNull();
  });

  it("links only chain hashes on known explorers", () => {
    expect(transferExplorerUrl("bsc", HASH)).toBe(`https://bscscan.com/tx/${HASH}`);
    expect(transferExplorerUrl("Tron", "b".repeat(64))).toBe(
      `https://tronscan.org/#/transaction/${"b".repeat(64)}`,
    );
    // Internal transfers carry exchange ids, not chain hashes.
    expect(transferExplorerUrl("bsc", "Internal transfer 12345")).toBeNull();
    expect(transferExplorerUrl("SomeNewChain", HASH)).toBeNull();
    expect(transferExplorerUrl("bsc", null)).toBeNull();
  });
});
