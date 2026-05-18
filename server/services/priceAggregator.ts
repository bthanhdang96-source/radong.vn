import { appendHistory, getCached, getCacheEntry, getHistory, listHistoryDates, setCache } from './cacheService.js';
import { crawlBanggianongsan } from './crawlers/banggianongsanCrawler.js';
import { crawlChogiaDurian } from './crawlers/chogiaDurianCrawler.js';
import { crawlCongthuong } from './crawlers/congthuongCrawler.js';
import { crawlDaklakSctDurian } from './crawlers/daklakSctDurianCrawler.js';
import { crawlDongnaiDauGiay } from './crawlers/dongnaiDauGiayCrawler.js';
import { crawlGiacaNsvl } from './crawlers/giacaNsvlCrawler.js';
import { crawlNongnghiep } from './crawlers/nongnghiepCrawler.js';
import { crawlVietnambiz } from './crawlers/vietnambizCrawler.js';
import { crawlVietnambizDurianFromRss } from './crawlers/vietnambizDurianCrawler.js';
import { crawlVietfood } from './crawlers/vietfoodCrawler.js';
import { crawlVpsaspice } from './crawlers/vpsaspiceCrawler.js';
import { retryCrawlerResult } from './crawlers/common.js';
import type {
  CommoditySummary,
  CrawledDayData,
  CrawledPriceItem,
  SourceSnapshot,
  VnPricesResponse,
} from './crawlers/types.js';
import { buildFallbackDayData } from './fallbackVnPrices.js';
import { normalizeDisplayRegion, VN_COMMODITY_META } from './marketDataMappings.js';
import {
  buildCanonicalRegionSelections,
  buildSourcePriorityLookup,
  createRankedRegionCandidate,
  pickSummaryRegionSelections,
  toRegionPrices,
} from './priceQuality.js';
import { calculateTrend7dPct, getTrendDirection, roundTrendNumber, type CommoditySparkPoint } from './trendUtils.js';

const CACHE_KEY = 'vn-prices';
const CACHE_TTL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_SPARKLINE_VALUES: Record<string, number[]> = {
  'ho-tieu': [138400, 138900, 139500, 140100, 140200, 141100, 140200],
  'ca-phe-robusta': [88200, 87950, 87700, 87580, 87320, 87040, 86875],
  'heo-hoi': [66400, 66550, 66620, 66780, 66810, 66860, 66833],
  'gao-noi-dia': [8340, 8385, 8425, 8480, 8510, 8550, 8575],
};

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getRecommendation(changePct: number): 'Mua' | 'Bán' | 'Giữ' {
  if (changePct >= 1) {
    return 'Mua';
  }
  if (changePct <= -1) {
    return 'Bán';
  }
  return 'Giữ';
}

function buildFallbackSparkline(values: number[], endDate = new Date()): CommoditySparkPoint[] {
  return values.map((priceAvg, index) => {
    const date = new Date(endDate.getTime() - (values.length - 1 - index) * DAY_MS);

    return {
      date: date.toISOString().slice(0, 10),
      priceAvg: roundNumber(priceAvg),
    };
  });
}

function getRecommendationLabel(changePct: number): CommoditySummary['recommendation'] {
  const legacyRecommendation = getRecommendation(changePct);

  if (legacyRecommendation === 'Mua') {
    return 'Mua';
  }

  if (changePct <= -1) {
    return 'Bán';
  }

  return 'Giữ';
}

function getFallbackSparkline30d(commodity: string, currentPriceAvg: number): CommoditySparkPoint[] {
  const values = FALLBACK_SPARKLINE_VALUES[commodity];
  if (!values || values.length === 0) {
    return [
      {
        date: new Date().toISOString().slice(0, 10),
        priceAvg: roundNumber(currentPriceAvg),
      },
    ];
  }

  return buildFallbackSparkline(values);
}

function buildHistoricalSeries(limit = 30): Map<string, CommoditySparkPoint[]> {
  const byCommodity = new Map<string, CommoditySparkPoint[]>();

  for (const date of listHistoryDates(limit)) {
    const snapshot = getHistory<CrawledDayData>(date);
    if (!snapshot) {
      continue;
    }

    const summaries = buildSummaries(snapshot.items, undefined, snapshot.sources, undefined, false);
    for (const summary of summaries) {
      const series = byCommodity.get(summary.commodity) ?? [];
      series.push({
        date,
        priceAvg: roundNumber(summary.priceAvg),
      });
      byCommodity.set(summary.commodity, series);
    }
  }

  return byCommodity;
}

function hasEnhancedTrendData(response: VnPricesResponse): boolean {
  return response.data.every(
    (item) =>
      typeof item.trendDirection === 'string' &&
      Array.isArray(item.sparkline30d) &&
      'trend7dPct' in item,
  );
}

function buildSummaries(
  items: CrawledPriceItem[],
  historicalRanges?: Map<string, { low: number; high: number }>,
  sourceSnapshots?: SourceSnapshot[],
  historicalSeries?: Map<string, CommoditySparkPoint[]>,
  useFallbackSparkline = true,
): CommoditySummary[] {
  const groups = new Map<string, CrawledPriceItem[]>();
  const sourcePriorityLookup = buildSourcePriorityLookup(sourceSnapshots);

  for (const item of items) {
    const existing = groups.get(item.commodity) ?? [];
    existing.push(item);
    groups.set(item.commodity, existing);
  }

  return [...groups.entries()]
    .map(([commodity, commodityItems]) => {
      const meta = VN_COMMODITY_META[commodity] ?? {
        commodityName: commodityItems[0].commodityName,
        category: commodityItems[0].category,
        unit: commodityItems[0].unit,
      };

      const regionSelections = pickSummaryRegionSelections(
        buildCanonicalRegionSelections(
          commodityItems.map((item) =>
            createRankedRegionCandidate({
              region: normalizeDisplayRegion(item.region),
              price: item.price,
              change: item.change,
              changePct: item.changePct,
              source: item.source,
              timestamp: item.timestamp,
              sourcePriority: sourcePriorityLookup.get(item.source),
            }),
          ),
        ),
      );
      const summaryCandidates = regionSelections.map((selection) => selection.primary);
      const prices = summaryCandidates.map((item) => item.price);
      const changeEntries = summaryCandidates.filter((item) => item.change !== null);
      const changeValues =
        changeEntries.length > 0 ? changeEntries.map((item) => finiteOrZero(item.change)) : [0];
      const avg = roundNumber(prices.reduce((sum, price) => sum + price, 0) / prices.length);
      const avgChange = roundNumber(changeValues.reduce((sum, value) => sum + value, 0) / changeValues.length);
      const previousAverage = avg - avgChange;
      const avgChangePct = previousAverage > 0 ? roundNumber((avgChange / previousAverage) * 100) : 0;
      const regions = toRegionPrices(regionSelections);
      const historyPoints = historicalSeries?.get(commodity) ?? [];
      const sparkline30d =
        historyPoints.length > 0
          ? historyPoints
          : useFallbackSparkline
            ? getFallbackSparkline30d(commodity, avg)
            : [
                {
                  date: commodityItems[0].timestamp.slice(0, 10),
                  priceAvg: avg,
                },
              ];
      const trend7dPct = calculateTrend7dPct(sparkline30d, roundTrendNumber(avgChangePct));

      const range = historicalRanges?.get(commodity);
      const low52w = range ? range.low : Math.min(...prices);
      const high52w = range ? range.high : Math.max(...prices);

      return {
        commodity,
        commodityName: meta.commodityName,
        category: meta.category,
        unit: meta.unit,
        priceHigh: Math.max(...prices),
        priceLow: Math.min(...prices),
        priceAvg: avg,
        change: avgChange,
        changePct: avgChangePct,
        low52w,
        high52w: Math.max(high52w, avg),
        regions,
        sources: [...new Set(commodityItems.map((item) => item.source))],
        recommendation: getRecommendationLabel(avgChangePct),
        trend7dPct,
        trendDirection: getTrendDirection(trend7dPct),
        sparkline30d,
        lastUpdated: commodityItems.reduce((latest, item) => (item.timestamp > latest ? item.timestamp : latest), commodityItems[0].timestamp),
      };
    })
    .sort((a, b) => b.priceAvg - a.priceAvg);
}

function buildHistoricalRanges(): Map<string, { low: number; high: number }> {
  const ranges = new Map<string, { low: number; high: number }>();

  for (const date of listHistoryDates(90)) {
    const snapshot = getHistory<CrawledDayData>(date);
    if (!snapshot) {
      continue;
    }

    for (const summary of buildSummaries(snapshot.items, undefined, snapshot.sources)) {
      const current = ranges.get(summary.commodity);
      if (!current) {
        ranges.set(summary.commodity, { low: summary.priceAvg, high: summary.priceAvg });
        continue;
      }

      current.low = Math.min(current.low, summary.priceAvg);
      current.high = Math.max(current.high, summary.priceAvg);
    }
  }

  return ranges;
}

function toResponse(dayData: CrawledDayData, status: VnPricesResponse['status'], errors: string[] = []): VnPricesResponse {
  const historicalRanges = buildHistoricalRanges();
  const historicalSeries = buildHistoricalSeries(30);
  const summaries = buildSummaries(dayData.items, historicalRanges, dayData.sources, historicalSeries);
  const lastUpdated =
    summaries.reduce((latest, item) => (item.lastUpdated > latest ? item.lastUpdated : latest), dayData.items[0]?.timestamp ?? new Date().toISOString());

  return {
    status,
    fetchedAt: new Date().toISOString(),
    lastUpdated,
    data: summaries,
    sources: dayData.sources,
    errors,
  };
}

export async function fetchLiveDayData(): Promise<{ dayData: CrawledDayData | null; errors: string[] }> {
  const timestamp = new Date().toISOString();
  const date = timestamp.slice(0, 10);
  const errors: string[] = [];

  const [nongnghiep, vietnambiz, vietnambizDurian, congthuong, chogiaDurian, daklakSctDurian, dongnaiDauGiay, vpsaspice, banggianongsan, vietfood, giacaNsvl] = await Promise.all([
    retryCrawlerResult(() => crawlNongnghiep()),
    retryCrawlerResult(() => crawlVietnambiz()),
    retryCrawlerResult(() => crawlVietnambizDurianFromRss()),
    retryCrawlerResult(() => crawlCongthuong()),
    retryCrawlerResult(() => crawlChogiaDurian()),
    retryCrawlerResult(() => crawlDaklakSctDurian()),
    retryCrawlerResult(() => crawlDongnaiDauGiay()),
    retryCrawlerResult(() => crawlVpsaspice()),
    retryCrawlerResult(() => crawlBanggianongsan()),
    retryCrawlerResult(() => crawlVietfood()),
    retryCrawlerResult(() => crawlGiacaNsvl()),
  ]);
  const items = [
    ...nongnghiep.items,
    ...vietnambiz.items,
    ...vietnambizDurian.items,
    ...congthuong.items,
    ...chogiaDurian.items,
    ...daklakSctDurian.items,
    ...dongnaiDauGiay.items,
    ...vpsaspice.items,
    ...banggianongsan.items,
    ...vietfood.items,
    ...giacaNsvl.items,
  ];
  const sources: SourceSnapshot[] = [
    ...nongnghiep.sources,
    ...vietnambiz.sources,
    ...vietnambizDurian.sources,
    ...congthuong.sources,
    ...chogiaDurian.sources,
    ...daklakSctDurian.sources,
    ...dongnaiDauGiay.sources,
    ...vpsaspice.sources,
    ...banggianongsan.sources,
    ...vietfood.sources,
    ...giacaNsvl.sources,
  ];

  for (const source of sources) {
    if (!source.success && source.error) {
      errors.push(`${source.label}: ${source.error}`);
    }
  }

  if (items.length === 0) {
    return { dayData: null, errors };
  }

  return {
    dayData: {
      date,
      items,
      sources,
    },
    errors,
  };
}

export async function getVnPrices(forceRefresh = false): Promise<VnPricesResponse> {
  if (!forceRefresh) {
    const cached = getCached<VnPricesResponse>(CACHE_KEY);
    if (cached && hasEnhancedTrendData(cached)) {
      return cached;
    }
  }

  const live = await fetchLiveDayData();
  if (live.dayData) {
    appendHistory(live.dayData.date, live.dayData);
    const response = toResponse(live.dayData, 'live', live.errors);
    setCache(CACHE_KEY, response, CACHE_TTL_MS);
    return response;
  }

  const cachedEntry = getCacheEntry<VnPricesResponse>(CACHE_KEY);
  if (cachedEntry && hasEnhancedTrendData(cachedEntry.data)) {
    return {
      ...cachedEntry.data,
      status: 'cached',
      fetchedAt: new Date().toISOString(),
      errors: live.errors.length > 0 ? live.errors : cachedEntry.data.errors,
    };
  }

  const fallback = buildFallbackDayData();
  appendHistory(fallback.date, fallback);
  const response = toResponse(
    fallback,
    'fallback',
    live.errors.length > 0 ? live.errors : ['Đang sử dụng dữ liệu dự phòng tích hợp'],
  );
  setCache(CACHE_KEY, response, 15 * 60 * 1000);
  return response;
}

export function getVnPricesHistory(date: string): CrawledDayData | null {
  return getHistory<CrawledDayData>(date);
}

export async function getVnPriceSourceStatus(): Promise<SourceSnapshot[]> {
  const cached = getCached<VnPricesResponse>(CACHE_KEY) ?? getCacheEntry<VnPricesResponse>(CACHE_KEY)?.data;
  if (cached) {
    return cached.sources;
  }

  return (await getVnPrices(false)).sources;
}
