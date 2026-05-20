import { load } from 'cheerio';
import { extractRows, extractTables, failedSource, fetchUtf8, finalizeSourceBatch, foldText, parseRangeAverage } from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const PAGE_URL = 'https://kimhungmarket.com/gia-che-hom-nay-bao-nhieu-1kg';

function extractArticleTitle(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('h1').first().text() ??
    $('title').text() ??
    'Gia che hom nay';

  return title.replace(/\s+/g, ' ').trim();
}

function isFreshTeaTable(rows: string[][]) {
  const folded = foldText(rows.flat().join(' '));
  return folded.includes('che bup tuoi') || folded.includes('cup che');
}

function isDryTeaTable(rows: string[][]) {
  const folded = foldText(rows.flat().join(' '));
  return folded.includes('tra moc cau') || folded.includes('tra dinh') || folded.includes('tra thai nguyen');
}

function parseTeaRow(
  label: string,
  priceText: string,
  fallbackTimestamp: string,
  articleTitle: string,
  priceType: 'farm_gate' | 'wholesale',
): CrawledPriceItem | null {
  const price = parseRangeAverage(priceText);
  if (!label || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    commodity: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    region: 'Viet Nam',
    price,
    unit: 'VND/kg',
    change: null,
    changePct: null,
    timestamp: fallbackTimestamp,
    source: 'kimhungmarket',
    priceType,
    marketName: label,
    articleTitle,
    countryCode: 'VNM',
    previousPrice: null,
    extra: {
      sourceFormat: 'html_table',
      sourceLabel: label,
      detailOnly: priceType === 'wholesale' && price >= 1_500_000,
    },
  };
}

export function parseKimhungTeaHtml(html: string, fallbackTimestamp: string) {
  const articleTitle = extractArticleTitle(html);
  const tables = extractTables(html);
  const items: CrawledPriceItem[] = [];

  for (const tableHtml of tables) {
    const rows = extractRows(tableHtml);
    if (rows.length < 2) {
      continue;
    }

    const priceType = isFreshTeaTable(rows) ? 'farm_gate' : isDryTeaTable(rows) ? 'wholesale' : null;
    if (!priceType) {
      continue;
    }

    for (const cells of rows.slice(1)) {
      const label = cells[0]?.replace(/\s+/g, ' ').trim() ?? '';
      const priceText = cells[1] ?? '';
      const item = parseTeaRow(label, priceText, fallbackTimestamp, articleTitle, priceType);
      if (item) {
        items.push(item);
      }
    }
  }

  return {
    articleTitle,
    items,
  };
}

export async function crawlKimhungTea(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchUtf8(PAGE_URL);
    const parsed = parseKimhungTeaHtml(html, fetchedAt);
    return finalizeSourceBatch(
      'kimhungmarket',
      'kimhungmarket.com - Gia che',
      PAGE_URL,
      fetchedAt,
      ['tea-avg'],
      parsed.items,
      PAGE_URL,
      {
        sourceFormat: 'html_table',
      },
    );
  } catch (error) {
    return failedSource(
      'kimhungmarket',
      'kimhungmarket.com - Gia che',
      PAGE_URL,
      fetchedAt,
      ['tea-avg'],
      error,
      PAGE_URL,
      {
        sourceFormat: 'html_table',
      },
    );
  }
}
