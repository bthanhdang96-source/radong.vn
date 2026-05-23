import * as cheerio from 'cheerio';
import type { CrawledPriceItem, CrawlerResult, SourceId } from './types.js';
import { isTransientNetworkError, retryTransient, retryTransientResult, type RetryOptions } from '../transientNetwork.js';
import { validateAndDedupSourceBatch } from '../validators/vnPriceValidation.js';

export const USER_AGENT = 'NongSanVN/0.6 (+https://github.com/bthanhdang96-source/radong.vn)';
export const HTML_HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const SOURCE_PRIORITIES: Record<SourceId, number> = {
  nongnghiep: 100,
  vietnambiz: 95,
  congthuong: 90,
  daklak_sct: 92,
  chogia: 86,
  dongnai_sct_daugiay: 89,
  vietfood: 88,
  giaca_nsvl: 82,
  banggianongsan: 76,
  giahotieu: 77,
  kimhungmarket: 71,
  bhx: 75,
  coop: 74,
  customs: 96,
  agroinfo_fruit_report: 85,
  fallback: 0,
};

export function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

export async function fetchUtf8(url: string): Promise<string> {
  return retryTransient(async () => {
    const response = await fetch(url, { headers: HTML_HEADERS });
    const html = Buffer.from(await response.arrayBuffer()).toString('utf8');

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return html;
  });
}

function isRetryableSourceFailure(result: CrawlerResult) {
  if (result.sources.length === 0) {
    return true;
  }

  const failedSources = result.sources.filter((source) => !source.success);
  return (
    failedSources.length > 0 &&
    failedSources.length === result.sources.length &&
    failedSources.every((source) => isTransientNetworkError(new Error(source.error ?? 'Unknown crawler error')))
  );
}

export async function retryCrawlerResult(
  operation: () => Promise<CrawlerResult>,
  options: RetryOptions = {},
): Promise<CrawlerResult> {
  return retryTransientResult(operation, isRetryableSourceFailure, options);
}

export function toBodyText(html: string): string {
  const $ = cheerio.load(html);
  return $('body').text().replace(/\s+/g, ' ').trim();
}

export function extractParagraphs(html: string): string[] {
  const $ = cheerio.load(html);
  return $('p')
    .map((_index, element) => $(element).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean);
}

export function extractTables(html: string): string[] {
  const $ = cheerio.load(html);
  return $('table')
    .map((_index, element) => $.html(element) ?? '')
    .get()
    .filter(Boolean);
}

export function extractRows(tableHtml: string): string[][] {
  const $ = cheerio.load(tableHtml);
  const rows: string[][] = [];

  $('tr').each((_index, row) => {
    const cells = $(row)
      .find('th, td')
      .map((_cellIndex, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);

    if (cells.length > 0) {
      rows.push(cells);
    }
  });

  return rows;
}

export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseNumber(value: string): number {
  return Number(value.replace(/[^\d-]/g, ''));
}

export function parseSignedChange(value: string): number | null {
  const normalized = value.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const folded = foldText(normalized);
  if (!normalized || normalized === '-' || folded.includes('khong doi') || folded.includes('moi cap nhat')) {
    return 0;
  }

  const parsed = parseNumber(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (/giam/i.test(folded) && parsed > 0) {
    return -parsed;
  }

  return parsed;
}

export function parseRangeAverage(value: string): number {
  const parts = value.split(/\s*[-–—â€“â€”]\s*/).map((part) => parseNumber(part));
  const valid = parts.filter((part) => Number.isFinite(part) && part > 0);

  if (valid.length === 0) {
    return 0;
  }

  if (valid.length === 1) {
    return valid[0];
  }

  return Math.round(valid.reduce((sum, item) => sum + item, 0) / valid.length);
}

export function createItem(
  source: SourceId,
  commodity: string,
  commodityName: string,
  category: string,
  region: string,
  price: number,
  change: number | null,
  timestamp: string,
  previousPrice?: number | null,
  options?: Partial<
    Pick<
      CrawledPriceItem,
      | 'priceType'
      | 'unit'
      | 'unitRaw'
      | 'normalizedUnitKey'
      | 'unitQuantity'
      | 'variety'
      | 'qualityGrade'
      | 'marketName'
      | 'articleTitle'
      | 'countryCode'
      | 'exchangeRate'
      | 'priceUsd'
      | 'dedupeKey'
      | 'extra'
    >
  >,
): CrawledPriceItem {
  const safeChange = change !== null && Number.isFinite(change) ? change : null;
  const safePreviousPrice = previousPrice ?? (safeChange !== null ? price - safeChange : null);

  return {
    commodity,
    commodityName,
    category,
    region,
    price,
    unit: options?.unit ?? 'VND/kg',
    unitRaw: options?.unitRaw ?? options?.unit ?? 'VND/kg',
    normalizedUnitKey: options?.normalizedUnitKey ?? null,
    unitQuantity: options?.unitQuantity ?? null,
    change: safeChange,
    changePct:
      safeChange !== null && safePreviousPrice && safePreviousPrice > 0
        ? roundNumber((safeChange / safePreviousPrice) * 100)
        : null,
    timestamp,
    source,
    previousPrice: safePreviousPrice,
    priceType: options?.priceType,
    variety: options?.variety ?? null,
    qualityGrade: options?.qualityGrade ?? null,
    marketName: options?.marketName ?? null,
    articleTitle: options?.articleTitle ?? null,
    countryCode: options?.countryCode ?? null,
    exchangeRate: options?.exchangeRate ?? null,
    priceUsd: options?.priceUsd ?? null,
    dedupeKey: options?.dedupeKey ?? null,
    extra: options?.extra,
  };
}

export function finalizeSourceBatch(
  id: SourceId,
  label: string,
  url: string,
  fetchedAt: string,
  coverage: string[],
  rawItems: CrawledPriceItem[],
  latestArticleUrl?: string,
  metadata?: Record<string, unknown>,
): CrawlerResult {
  const validated = validateAndDedupSourceBatch(
    {
      id,
      label,
      url,
      fetchedAt,
      success: rawItems.length > 0,
      itemCount: rawItems.length,
      priority: SOURCE_PRIORITIES[id],
      coverage,
      latestArticleUrl,
      metadata,
      error: rawItems.length > 0 ? undefined : 'No rows parsed from latest article',
    },
    rawItems,
  );

  return {
    items: validated.items,
    sources: [validated.source],
  };
}

export function failedSource(
  id: SourceId,
  label: string,
  url: string,
  fetchedAt: string,
  coverage: string[],
  error: unknown,
  latestArticleUrl?: string,
  metadata?: Record<string, unknown>,
): CrawlerResult {
  return {
    items: [],
    sources: [
      {
        id,
        label,
        url,
        fetchedAt,
        success: false,
        itemCount: 0,
        priority: SOURCE_PRIORITIES[id],
        coverage,
        latestArticleUrl,
        metadata,
        error: error instanceof Error ? error.message : 'Unknown crawler error',
      },
    ],
  };
}
