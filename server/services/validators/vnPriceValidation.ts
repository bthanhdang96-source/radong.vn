import type { CrawledPriceItem, SourceSnapshot } from '../crawlers/types.js';
import { PRICE_BOUNDS } from '../ingestion/pipeline.js';

const REGION_ALIASES: Record<string, string> = {
  'dak lak': 'Dak Lak',
  'dak nong': 'Dak Nong',
  'gia lai': 'Gia Lai',
  'lam dong': 'Lam Dong',
  'ba ria - vung tau': 'Ba Ria - Vung Tau',
  'binh phuoc': 'Binh Phuoc',
  'dong nai': 'Dong Nai',
  'mien bac': 'Mien Bac',
  'mien trung - tay nguyen': 'Mien Trung - Tay Nguyen',
  'mien nam': 'Mien Nam',
  'tp hcm': 'TP. Ho Chi Minh',
  'tp. ho chi minh': 'TP. Ho Chi Minh',
  'dai thom 8': 'Dai Thom 8',
  'soc thom': 'Soc Thom',
  'om 18': 'OM 18',
  'om 5451': 'OM 5451',
  'om 380': 'OM 380',
  'om 34': 'OM 34',
  'ir 504': 'IR 504',
  'ir 50404': 'IR 50404',
  'cl 555': 'CL 555',
  'tam thom 504': 'Tam thom 504',
  'cam': 'Cam',
  'lua tuoi om 18': 'Lua tuoi OM 18',
  'lua tuoi dai thom 8': 'Lua tuoi Dai Thom 8',
  'lua tuoi om 5451': 'Lua tuoi OM 5451',
  'lua tuoi ir 50404': 'Lua tuoi IR 50404',
  'lua tuoi om 34': 'Lua tuoi OM 34',
  'nguyen lieu ir 504': 'Nguyen lieu IR 504',
  'nguyen lieu cl 555': 'Nguyen lieu CL 555',
  'tam 2': 'Tam 2',
};

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
  return REGION_ALIASES[normalized] ?? toTitleCase(normalized);
}

function cloneItem(item: CrawledPriceItem): CrawledPriceItem {
  return {
    ...item,
    region: normalizeRegion(item.region),
  };
}

function isWithinBounds(item: CrawledPriceItem): boolean {
  const bounds = PRICE_BOUNDS[item.commodity];
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

    const dedupKey = [item.commodity, normalizeForLookup(item.region), item.source, item.timestamp.slice(0, 10)].join('|');
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
