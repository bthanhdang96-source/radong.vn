import { load } from 'cheerio';
import {
  extractRows,
  extractTables,
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseRangeAverage,
  parseSignedChange,
} from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const PAGE_URL = 'https://giahotieu.com/gia-nong-san-hom-nay/';

function extractArticleTitle(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('h1').first().text() ??
    $('title').text() ??
    'Gia nong san hom nay';

  return title.replace(/\s+/g, ' ').trim();
}

function findCassavaTable(html: string) {
  return (
    extractTables(html).find((tableHtml) => {
      const rows = extractRows(tableHtml);
      if (rows.length < 2) {
        return false;
      }

      const folded = foldText(rows.flat().join(' '));
      return folded.includes('gia san tuoi hom nay') || folded.includes('gia san khoai mi');
    }) ?? null
  );
}

export function parseGiahotieuAgricultureHtml(html: string, fallbackTimestamp: string) {
  const articleTitle = extractArticleTitle(html);
  const tableHtml = findCassavaTable(html);

  if (!tableHtml) {
    return {
      articleTitle,
      items: [] as CrawledPriceItem[],
    };
  }

  const rows = extractRows(tableHtml);
  const items = rows
    .slice(1)
    .flatMap((cells) => {
      const region = cells[0]?.replace(/\s+/g, ' ').trim() ?? '';
      const priceText = cells[1] ?? '';
      const changeText = cells[2] ?? '';
      const price = parseRangeAverage(priceText);

      if (!region || !Number.isFinite(price) || price <= 0) {
        return [];
      }

      const change = parseSignedChange(changeText);
      return [
        {
          commodity: 'cassava',
          commodityName: 'San',
          category: 'Luong thuc',
          region,
          price,
          unit: 'VND/kg',
          change,
          changePct: null,
          timestamp: fallbackTimestamp,
          source: 'giahotieu',
          priceType: 'farm_gate',
          marketName: region,
          articleTitle,
          countryCode: 'VNM',
          previousPrice: change !== null ? price - change : null,
          extra: {
            rawPriceText: priceText,
            rawChangeText: changeText,
            sourceFormat: 'html_table',
          },
        } satisfies CrawledPriceItem,
      ];
    });

  return {
    articleTitle,
    items,
  };
}

export async function crawlGiahotieuAgriculture(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchUtf8(PAGE_URL);
    const parsed = parseGiahotieuAgricultureHtml(html, fetchedAt);
    return finalizeSourceBatch(
      'giahotieu',
      'giahotieu.com - Gia san',
      PAGE_URL,
      fetchedAt,
      ['cassava'],
      parsed.items,
      PAGE_URL,
      {
        sourceFormat: 'html_table',
      },
    );
  } catch (error) {
    return failedSource('giahotieu', 'giahotieu.com - Gia san', PAGE_URL, fetchedAt, ['cassava'], error, PAGE_URL, {
      sourceFormat: 'html_table',
    });
  }
}
