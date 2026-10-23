import { describe, expect, it } from "vitest";
import { CHANGELOG } from "./entries";

const locales = ["ru", "uk", "en"] as const;

describe("changelog entries", () => {
  it("are newest first", () => {
    const dates = CHANGELOG.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("have a title and the same number of short items in every language", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const counts = locales.map((l) => entry.items[l].length);
      expect(new Set(counts).size).toBe(1);
      expect(counts[0]).toBeGreaterThan(0);
      for (const locale of locales) {
        expect(entry.title[locale].trim()).not.toBe("");
        for (const item of entry.items[locale]) {
          expect(item.trim()).not.toBe("");
          expect(item.length).toBeLessThan(260);
        }
      }
    }
  });
});
