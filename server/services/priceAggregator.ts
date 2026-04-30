import { appendHistory, getCached, getCacheEntry, getHistory, listHistoryDates, setCache } from './cacheService.js';
import { crawlCongthuong } from './crawlers/congthuongCrawler.js';
import { crawlNongnghiep } from './crawlers/nongnghiepCrawler.js';
import { crawlVietnambiz } from './crawlers/vietnambizCrawler.js';
import type {
  CommoditySummary,
  CrawledDayData,
  CrawledPriceItem,
  RegionPrice,
  SourceSnapshot,
  VnPricesResponse,
} from './crawlers/types.js';
import { buildFallbackDayData } from './fallbackVnPrices.js';

const CACHE_KEY = 'vn-prices';
const CACHE_TTL_MS = 60 * 60 * 1000;

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function getRecommendation(changePct: number): 'Mua' | 'Ban' | 'Giu' {
  if (changePct >= 1) {
    return 'Mua';
  }
  if (changePct <= -1) {
    return 'Ban';
  }
  return 'Giu';
}

function buildSummaries(items: CrawledPriceItem[], historicalRanges?: Map<string, { low: number; high: number }>): CommoditySummary[] {
  const groups = new Map<string, CrawledPriceItem[]>();

  for (const item of items) {
    const existing = groups.get(item.commodity) ?? [];
    existing.push(item);
    groups.set(item.commodity, existing);
  }

  return [...groups.entries()]
    .map(([commodity, commodityItems]) => {
      const prices = commodityItems.map((item) => item.price);
      const changeValues = commodityItems.map((item) => item.change ?? 0);
      const avg = roundNumber(prices.reduce((sum, price) => sum + price, 0) / prices.length);
      const avgChange = roundNumber(changeValues.reduce((sum, value) => sum + value, 0) / changeValues.length);
      const previousAverage = avg - avgChange;
      const avgChangePct = previousAverage > 0 ? roundNumber((avgChange / previousAverage) * 100) : 0;
      const byRegion = new Map<string, CrawledPriceItem[]>();

      for (const item of commodityItems) {
        const entries = byRegion.get(item.region) ?? [];
        entries.push(item);
        byRegion.set(item.region, entries);
      }

      const regions: RegionPrice[] = commodityItems.map((item) => {
        const siblings = byRegion.get(item.region) ?? [item];
        const peerPrices = siblings.map((peer) => peer.price);
        const highest = Math.max(...peerPrices);
        const lowest = Math.min(...peerPrices);
        const conflictPct = lowest > 0 ? roundNumber(((highest - lowest) / lowest) * 100) : null;

        return {
          region: item.region,
          price: item.price,
          change: item.change,
          changePct: item.changePct,
          source: item.source,
          hasConflict: siblings.length > 1 && conflictPct !== null && conflictPct > 2,
          conflictPct: siblings.length > 1 ? conflictPct : null,
        };
      });

      const range = historicalRanges?.get(commodity);
      const low52w = range ? range.low : Math.min(...prices);
      const high52w = range ? range.high : Math.max(...prices);

      return {
        commodity,
        commodityName: commodityItems[0].commodityName,
        category: commodityItems[0].category,
        unit: commodityItems[0].unit,
        priceHigh: Math.max(...prices),
        priceLow: Math.min(...prices),
        priceAvg: avg,
        change: avgChange,
        changePct: avgChangePct,
        low52w,
        high52w: Math.max(high52w, avg),
        regions,
        sources: [...new Set(commodityItems.map((item) => item.source))],
        recommendation: getRecommendation(avgChangePct),
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

    for (const summary of buildSummaries(snapshot.items)) {
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
  const summaries = buildSummaries(dayData.items, historicalRanges);
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

async function fetchLiveDayData(): Promise<{ dayData: CrawledDayData | null; errors: string[] }> {
  const timestamp = new Date().toISOString();
  const date = timestamp.slice(0, 10);
  const errors: string[] = [];

  const [nongnghiep, vietnambiz, congthuong] = await Promise.all([crawlNongnghiep(), crawlVietnambiz(), crawlCongthuong()]);
  const items = [...nongnghiep.items, ...vietnambiz.items, ...congthuong.items];
  const sources: SourceSnapshot[] = [...nongnghiep.sources, ...vietnambiz.sources, ...congthuong.sources];

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
    if (cached) {
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
  if (cachedEntry) {
    return {
      ...cachedEntry.data,
      status: 'cached',
      fetchedAt: new Date().toISOString(),
      errors: live.errors.length > 0 ? live.errors : cachedEntry.data.errors,
    };
  }

  const fallback = buildFallbackDayData();
  appendHistory(fallback.date, fallback);
  const response = toResponse(fallback, 'fallback', live.errors.length > 0 ? live.errors : ['Using bundled fallback data']);
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
