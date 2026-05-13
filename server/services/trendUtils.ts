export type TrendDirection = 'Tăng' | 'Giảm' | 'Trung tính';

export interface CommoditySparkPoint {
  date: string;
  priceAvg: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function roundTrendNumber(value: number): number {
  return Number(value.toFixed(2));
}

export function getTrendDirection(trend7dPct: number | null): TrendDirection {
  if (typeof trend7dPct !== 'number' || !Number.isFinite(trend7dPct)) {
    return 'Trung tính';
  }

  if (trend7dPct >= 1) {
    return 'Tăng';
  }

  if (trend7dPct <= -1) {
    return 'Giảm';
  }

  return 'Trung tính';
}

export function calculateTrend7dPct(points: CommoditySparkPoint[], fallbackValue: number | null = null): number | null {
  if (points.length === 0) {
    return fallbackValue;
  }

  const latest = points[points.length - 1];
  const latestTime = Date.parse(`${latest.date}T00:00:00.000Z`);
  const targetTime = latestTime - DAY_MS * 7;

  const reference = [...points]
    .reverse()
    .find((point) => Date.parse(`${point.date}T00:00:00.000Z`) <= targetTime);

  if (!reference || reference.priceAvg <= 0) {
    return fallbackValue;
  }

  return roundTrendNumber(((latest.priceAvg - reference.priceAvg) / reference.priceAvg) * 100);
}
