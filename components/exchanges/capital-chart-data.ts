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
  points.forEach((point, index) => {
    const previous = points[index - 1];
    // Break the line BETWEEN observations, never discard the new source's value.
    if (previous && previous.sourceSet !== point.sourceSet) {
      chart.push({
        timestamp: (previous.timestamp + point.timestamp) / 2,
        wallets: null,
        exchanges: null,
      });
    }
    chart.push({
      timestamp: point.timestamp,
      wallets: Number(point.walletsUsd),
      exchanges: Number(point.exchangesUsd),
    });
  });
  return chart;
}
