import type { CommoditySparkPoint, TrendDirection } from '../data/vnPriceTypes';

const DAY_MS = 24 * 60 * 60 * 1000;
const SPARKLINE_PADDING = 3;

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

type SparkCoordinate = {
  x: number;
  y: number;
};

function normalizePoints(points: CommoditySparkPoint[], width: number, height: number): SparkCoordinate[] {
  if (points.length === 0) {
    return [];
  }

  if (points.length === 1) {
    return [{ x: width / 2, y: height / 2 }];
  }

  const values = points.map((point) => point.priceAvg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeRange = max - min || 1;

  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const normalized = (point.priceAvg - min) / safeRange;
    const y = SPARKLINE_PADDING + (1 - normalized) * (height - SPARKLINE_PADDING * 2);

    return { x, y };
  });
}

export function buildSparklinePath(points: CommoditySparkPoint[], width: number, height: number): string {
  const normalizedPoints = normalizePoints(points, width, height);

  if (normalizedPoints.length < 2) {
    const midY = height / 2;
    return `M 0 ${midY} L ${width} ${midY}`;
  }

  return normalizedPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

export function getSparklineLastPoint(points: CommoditySparkPoint[], width: number, height: number): SparkCoordinate {
  const normalizedPoints = normalizePoints(points, width, height);

  if (normalizedPoints.length === 0) {
    return { x: width, y: height / 2 };
  }

  if (normalizedPoints.length === 1) {
    return { x: width, y: normalizedPoints[0].y };
  }

  return normalizedPoints[normalizedPoints.length - 1];
}

export function buildFallbackSparkline(values: number[], endDate = new Date()): CommoditySparkPoint[] {
  return values.map((priceAvg, index) => {
    const date = new Date(endDate.getTime() - (values.length - 1 - index) * DAY_MS);
    return {
      date: date.toISOString().slice(0, 10),
      priceAvg,
    };
  });
}
