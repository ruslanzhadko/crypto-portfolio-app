import { expect, it } from "vitest";
import { compareMarginReturn } from "./position-sort";
it("orders margin return in both directions and keeps unavailable returns last", () => {
  const rows = [
    { id: "unknown", margin: null, unrealizedPnl: "100" },
    { id: "profit", margin: "100", unrealizedPnl: "20" },
    { id: "loss", margin: "10", unrealizedPnl: "-5" },
    { id: "zero-margin", margin: "0", unrealizedPnl: "1" },
  ];
  expect(
    [...rows].sort((a, b) => compareMarginReturn(a, b, false)).map((p) => p.id),
  ).toEqual(["profit", "loss", "unknown", "zero-margin"]);
  expect(
    [...rows].sort((a, b) => compareMarginReturn(a, b, true)).map((p) => p.id),
  ).toEqual(["loss", "profit", "unknown", "zero-margin"]);
});
