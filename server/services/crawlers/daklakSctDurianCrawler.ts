import { load } from 'cheerio';
import { parseLooseDate } from '../news/common.js';
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

const BASE_URL = 'https://socongthuong.daklak.gov.vn';
const CATEGORY_URL = `${BASE_URL}/vi/news/thong-tin-gia-ca-thi-truong/`;

function extractLatestArticleUrl(categoryHtml: string) {
  const urls = [...categoryHtml.matchAll(/href="([^"]*\/vi\/news\/thong-tin-gia-ca-thi-truong\/[^"]+\.html)"/g)]
    .map((match) => new URL(match[1], BASE_URL).toString());

  return [...new Set(urls)][0] ?? null;
}

function extractArticleTitle(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('h1').first().text() ??
    $('title').text() ??
    'Bang gia nong san Dak Lak';

  return title.replace(/\s+/g, ' ').trim();
}

function extractArticleTimestamp(html: string, fallback: string) {
  const $ = load(html);
  return parseLooseDate(
    $('meta[property="article:published_time"]').attr('content') ??
      $('time').first().attr('datetime') ??
      $('.time, .news-date, .date').first().text() ??
      fallback,
    fallback,
  );
}

function findDurianTable(html: string) {
  return (
    extractTables(html).find((tableHtml) => {
      const rows = extractRows(tableHtml);
      if (rows.length < 2) {
        return false;
      }

      return rows.some((cells) => isDurianPriceLabel(cells[0] ?? ''));
    }) ?? null
  );
}

function isDurianPriceLabel(label: string) {
  const folded = foldText(label);
  return (
    folded.includes('sau rieng') ||
    folded.includes('sau thai') ||
    /\bri\s*6\b/.test(folded) ||
    folded.includes('musang king') ||
    folded.includes('black thorn') ||
    folded.includes('dona')
  );
}

export function parseDaklakSctDurianHtml(html: string, fallbackTimestamp: string) {
  const articleTitle = extractArticleTitle(html);
  const timestamp = extractArticleTimestamp(html, fallbackTimestamp);
  const tableHtml = findDurianTable(html);

  if (!tableHtml) {
    return {
      articleTitle,
      timestamp,
      items: [] as CrawledPriceItem[],
    };
  }

  const rows = extractRows(tableHtml);
  const dataRows = rows.slice(1);
  const hasExplicitDakLakRows = dataRows.some((cells) => {
    const label = cells[0] ?? '';
    return isDurianPriceLabel(label) && foldText(label).includes('dak lak');
  });
  const items = rows
    .slice(1)
    .flatMap((cells) => {
      const rawLabel = cells[0]?.replace(/\s+/g, ' ').trim() ?? '';
      const priceText = cells[1]?.replace(/\s+/g, ' ').trim() ?? '';
      const foldedLabel = foldText(rawLabel);
      if (!rawLabel || !isDurianPriceLabel(rawLabel)) {
        return [];
      }

      if (hasExplicitDakLakRows && !foldedLabel.includes('dak lak')) {
        return [];
      }

      const price = parseRangeAverage(priceText);
      if (!Number.isFinite(price) || price <= 0) {
        return [];
      }

      const durianLabel = parseDurianLabel(rawLabel);
      return [
        {
          commodity: 'sau-rieng',
          commodityName: 'Sầu riêng',
          category: 'Trái cây',
          region: 'Dak Lak',
          price,
          unit: 'VND/kg',
          change: null,
          changePct: null,
          timestamp,
          source: 'daklak_sct' as const,
          priceType: 'wholesale' as const,
          variety: durianLabel.variety,
          qualityGrade: durianLabel.qualityGrade,
          marketName: 'Dak Lak farmgate board',
          articleTitle,
          countryCode: 'VNM',
          previousPrice: null,
          extra: {
            rawLabel,
            rawPriceText: priceText,
            sourceFormat: 'html_table',
            provinceCode: 'DLK',
          },
        } satisfies CrawledPriceItem,
      ];
    });

  return {
    articleTitle,
    timestamp,
    items,
  };
}

export async function crawlDaklakSctDurian(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const categoryHtml = await fetchUtf8(CATEGORY_URL);
    const articleUrl = extractLatestArticleUrl(categoryHtml);
    if (!articleUrl) {
      throw new Error('No Dak Lak SCT durian article found on category page');
    }

    const articleHtml = await fetchUtf8(articleUrl);
    const parsed = parseDaklakSctDurianHtml(articleHtml, fetchedAt);
    return finalizeSourceBatch(
      'daklak_sct',
      'So Cong Thuong Dak Lak - Gia sau rieng',
      CATEGORY_URL,
      fetchedAt,
      ['sau-rieng'],
      parsed.items,
      articleUrl,
      {
        sourceFormat: 'html_table',
        provinceCode: 'DLK',
      },
    );
  } catch (error) {
    return failedSource(
      'daklak_sct',
      'So Cong Thuong Dak Lak - Gia sau rieng',
      CATEGORY_URL,
      fetchedAt,
      ['sau-rieng'],
      error,
      CATEGORY_URL,
      {
        sourceFormat: 'html_table',
        provinceCode: 'DLK',
      },
    );
  }
}
