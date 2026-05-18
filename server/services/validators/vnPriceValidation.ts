import type { CrawledPriceItem, SourceSnapshot } from '../crawlers/types.js';
import { buildObservationDedupeKey, getValidationBounds } from '../ingestion/observationRules.js';
import { getProvinceCodeFromRegion, inferPriceType, normalizeDisplayRegion, normalizeExternalCommoditySlug } from '../marketDataMappings.js';

function normalizeForLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[đĐ]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (/^[a-z]{1,3}\d+$/i.test(part) || /^\d+$/.test(part)) {
        return part.toUpperCase();
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function normalizeRegion(region: string): string {
  const normalized = normalizeForLookup(region);
  const displayRegion = normalizeDisplayRegion(normalized);
  return displayRegion === normalized ? toTitleCase(normalized) : displayRegion;
}

function cloneItem(item: CrawledPriceItem): CrawledPriceItem {
  return {
    ...item,
    region: normalizeRegion(item.region),
  };
}

function isWithinBounds(item: CrawledPriceItem): boolean {
  const commoditySlug = normalizeExternalCommoditySlug(item.commodity);
  const priceType = inferPriceType({
    sourceId: item.source,
    articleTitle: item.articleTitle ?? null,
    declaredPriceType: item.priceType ?? null,
  });
  const bounds = getValidationBounds(commoditySlug, priceType);
  if (!bounds) {
    return true;
  }

  return item.price >= bounds.min && item.price <= bounds.max;
}

function scoreItem(item: CrawledPriceItem): number {
  let score = 0;
  if (item.change !== null) score += 2;
  if (item.changePct !== null) score += 1;
  if (item.previousPrice !== null && item.previousPrice !== undefined) score += 1;
  if (item.region.length > 0) score += 1;
  if (item.marketName) score += 1;
  if (item.dedupeKey) score += 2;
  return score;
}

export function validateAndDedupSourceBatch(
  source: SourceSnapshot,
  rawItems: CrawledPriceItem[],
): { source: SourceSnapshot; items: CrawledPriceItem[] } {
  const validationErrors: string[] = [];
  const deduped = new Map<string, CrawledPriceItem>();
  let droppedCount = 0;
  let dedupCount = 0;

  for (const rawItem of rawItems) {
    const item = cloneItem(rawItem);
    if (!isWithinBounds(item)) {
      droppedCount += 1;
      validationErrors.push(`${item.commodity}/${item.region}: ${item.price} out of bounds`);
      continue;
    }

    const commoditySlug = normalizeExternalCommoditySlug(item.commodity);
    const priceType = inferPriceType({
      sourceId: item.source,
      articleTitle: item.articleTitle ?? null,
      declaredPriceType: item.priceType ?? null,
    });
    const dedupKey = buildObservationDedupeKey({
      sourceName: item.source,
      commoditySlug,
      priceType,
      provinceCode: getProvinceCodeFromRegion(item.region),
      regionLabel: item.region,
      variety: item.variety ?? null,
      qualityGrade: item.qualityGrade ?? null,
      marketName: item.marketName ?? item.region,
      articleTitle: item.articleTitle ?? null,
      countryCode: item.countryCode ?? 'VNM',
      priceVnd: item.price,
      recordedAt: item.timestamp,
      explicitKey: item.dedupeKey ?? null,
      extra: item.extra ?? null,
    });
    const existing = deduped.get(dedupKey);

    if (!existing) {
      deduped.set(dedupKey, item);
      continue;
    }

    dedupCount += 1;
    if (scoreItem(item) >= scoreItem(existing)) {
      deduped.set(dedupKey, item);
    }
  }

  const items = [...deduped.values()];
  const success = source.success && items.length > 0 && validationErrors.length < Math.max(3, rawItems.length);

  return {
    source: {
      ...source,
      success,
      itemCount: items.length,
      droppedCount,
      dedupCount,
      validationErrors,
      error: !success && validationErrors.length > 0 ? validationErrors[0] : source.error,
    },
    items,
  };
}
