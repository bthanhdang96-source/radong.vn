import { load } from 'cheerio';
import { parseDurianLabel } from '../durianPricing.js';
import {
  extractRows,
  extractTables,
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseRangeAverage,
} from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const PAGE_URL = 'https://chogia.vn/bang-gia-sau-rieng-hom-nay-47777/';

function extractArticleTitle(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('h1').first().text() ??
    $('title').text() ??
    'Gia sau rieng hom nay';

  return title.replace(/\s+/g, ' ').trim();
}

function findDurianTable(html: string) {
  return (
    extractTables(html).find((tableHtml) => {
      const rows = extractRows(tableHtml);
      if (rows.length < 2) {
        return false;
      }

      const folded = foldText(rows.flat().join(' '));
      return folded.includes('sau rieng') && folded.includes('tay nguyen');
    }) ?? null
  );
}

export function parseChogiaDurianHtml(html: string, fallbackTimestamp: string) {
  const articleTitle = extractArticleTitle(html);
  const tableHtml = findDurianTable(html);

  if (!tableHtml) {
    return {
      articleTitle,
      items: [] as CrawledPriceItem[],
    };
  }

  const rows = extractRows(tableHtml);
  const headers = rows[0] ?? [];
  const regions = headers.slice(1).map((cell) => cell.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const timestamp = fallbackTimestamp;

  const items = rows
    .slice(1)
    .flatMap((cells) => {
      const rawLabel = cells[0]?.replace(/\s+/g, ' ').trim() ?? '';
      if (!rawLabel || !foldText(rawLabel).includes('sau rieng')) {
        return [];
      }

      const durianLabel = parseDurianLabel(rawLabel);
      return cells.slice(1).flatMap((priceText, index) => {
        const region = regions[index];
        const price = parseRangeAverage(priceText ?? '');
        if (!region || !Number.isFinite(price) || price <= 0) {
          return [];
        }

        return [
          {
            commodity: 'sau-rieng',
            commodityName: 'Sầu riêng',
            category: 'Trái cây',
            region,
            price,
            unit: 'VND/kg',
            change: null,
            changePct: null,
            timestamp,
            source: 'chogia' as const,
            priceType: 'wholesale' as const,
            variety: durianLabel.variety,
            qualityGrade: durianLabel.qualityGrade,
            marketName: 'Cho Gia reference',
            articleTitle,
            countryCode: 'VNM',
            previousPrice: null,
            extra: {
              rawLabel,
              rawPriceText: priceText,
              region,
              sourceFormat: 'html_table',
            },
          } satisfies CrawledPriceItem,
        ];
      });
    });

  return {
    articleTitle,
    items,
  };
}

export async function crawlChogiaDurian(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchUtf8(PAGE_URL);
    const parsed = parseChogiaDurianHtml(html, fetchedAt);
    return finalizeSourceBatch(
      'chogia',
      'chogia.vn - Gia sau rieng',
      PAGE_URL,
      fetchedAt,
      ['sau-rieng'],
      parsed.items,
      PAGE_URL,
      {
        sourceFormat: 'html_table',
      },
    );
  } catch (error) {
    return failedSource('chogia', 'chogia.vn - Gia sau rieng', PAGE_URL, fetchedAt, ['sau-rieng'], error, PAGE_URL, {
      sourceFormat: 'html_table',
    });
  }
}
