import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangesEnabled } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("exchangesEnabled", () => {
  it("follows the pilot list and always includes the demo account", () => {
    vi.stubEnv("EXCHANGES_ENABLED", "true");
    vi.stubEnv("EXCHANGES_PILOT_USER_IDS", "owner");
    vi.stubEnv("DEMO_USER_ID", "demo");
    expect(exchangesEnabled("owner")).toBe(true);
    expect(exchangesEnabled("demo")).toBe(true);
    expect(exchangesEnabled("someone")).toBe(false);
    expect(exchangesEnabled()).toBe(false);
  });

  it("stays off for everyone, the demo included, while exchanges are disabled", () => {
    vi.stubEnv("EXCHANGES_ENABLED", "false");
    vi.stubEnv("DEMO_USER_ID", "demo");
    expect(exchangesEnabled("demo")).toBe(false);
  });
});
