import { describe, expect, it } from "vitest";
import { trimTrailing } from "./trim";

describe("trimTrailing", () => {
  it("drops only the listed characters at the end", () => {
    expect(trimTrailing("https://a.b/c?!.", ".,!?;:")).toBe("https://a.b/c");
    expect(trimTrailing("0.012500", "0")).toBe("0.0125");
    expect(trimTrailing("abc", "x")).toBe("abc");
    expect(trimTrailing("***", "*")).toBe("");
  });
});
