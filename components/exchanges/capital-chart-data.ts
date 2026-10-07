type Observation = {
  timestamp: number;
  sourceSet: string;
  walletsUsd: string;
  exchangesUsd: string;
};

export function capitalChartData(points: Observation[]) {
  const chart: {
    timestamp: number;
    wallets: number | null;
    exchanges: number | null;
  }[] = [];
  points.forEach((point) => {
    chart.push({
      timestamp: point.timestamp,
      wallets: Number(point.walletsUsd),
      exchanges: Number(point.exchangesUsd),
    });
  });
  return chart;
}
