import { describe, it, expect } from "vitest";
import { capitalChartData } from "../../components/exchanges/capital-chart-data";

describe("capital history source transitions", () => {
  it("preserves the latest value when a new exchange has only one observation", () => {
    const points = capitalChartData([
      {
        timestamp: 0,
        sourceSet: "wallet",
        walletsUsd: "1277",
        exchangesUsd: "0",
      },
      {
        timestamp: 300000,
        sourceSet: "wallet+bybit",
        walletsUsd: "1277",
        exchangesUsd: "3883",
      },
    ]);
    expect(points.at(-1)).toEqual({
      timestamp: 300000,
      wallets: 1277,
      exchanges: 3883,
    });
    expect(points).toHaveLength(2);
    expect(
      points.every(
        (point) => point.wallets !== null && point.exchanges !== null,
      ),
    ).toBe(true);
  });
  it("keeps stable observations connected and supports a single initial point", () => {
    const point = {
      timestamp: 0,
      sourceSet: "wallet",
      walletsUsd: "12",
      exchangesUsd: "0",
    };
    expect(capitalChartData([point])).toHaveLength(1);
    expect(
      capitalChartData([point, { ...point, timestamp: 300000 }]),
    ).toHaveLength(2);
    expect(capitalChartData([])).toEqual([]);
  });
});
