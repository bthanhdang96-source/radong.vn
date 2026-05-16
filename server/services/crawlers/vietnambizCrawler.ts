import { load } from 'cheerio';
import { parseLooseDate } from '../news/common.js';
import {
  createItem,
  extractRows,
  extractTables,
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseNumber,
  parseRangeAverage,
  parseSignedChange,
} from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const BASE_URL = 'https://vietnambiz.vn';
const LISTING_URL = `${BASE_URL}/hang-hoa/nong-san.htm`;
const ARTICLE_SELECTORS = ['.vnbiz-content', '.detail-content', 'article'];

type CommodityConfig = {
  commodity: string;
  commodityName: string;
  category: string;
  slug: string;
  parser: (html: string, timestamp: string) => CrawledPriceItem[];
};

function extractLatestArticleUrl(listingHtml: string, slug: string): string | null {
  const urls = [...listingHtml.matchAll(/href="([^"]+\.htm)"/g)]
    .map((match) => match[1])
    .map((href) => new URL(href, BASE_URL).toString())
    .filter((url) => url.includes(slug));

  return [...new Set(urls)][0] ?? null;
}

function parseCoffee(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html).find((entry) => foldText(entry).includes('trung binh'));
  if (!table) {
    return [];
  }

  return extractRows(table)
    .slice(1)
    .map((cells) => {
      const [region, priceText, changeText] = cells;
      const price = parseNumber(priceText ?? '');
      if (!region || !Number.isFinite(price) || price <= 0 || foldText(region).includes('ty gia')) {
        return null;
      }

      return createItem('vietnambiz', 'ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', region, price, parseSignedChange(changeText ?? '0'), timestamp);
    })
    .filter((item): item is CrawledPriceItem => item !== null);
}

function parsePepper(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html).find((entry) => foldText(entry).includes('gia thu mua ngay'));
  if (!table) {
    return [];
  }

  return extractRows(table)
    .slice(1)
    .map((cells) => {
      const [region, priceText, changeText] = cells;
      const price = parseNumber(priceText ?? '');
      if (!region || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      return createItem('vietnambiz', 'ho-tieu', 'Ho tieu', 'Cay cong nghiep', region, price, parseSignedChange(changeText ?? '0'), timestamp);
    })
    .filter((item): item is CrawledPriceItem => item !== null);
}

function parsePork(html: string, timestamp: string): CrawledPriceItem[] {
  return extractTables(html)
    .flatMap((table) => extractRows(table).slice(1))
    .map((cells) => {
      const [region, priceText, changeText] = cells;
      const price = parseNumber(priceText ?? '');
      if (!region || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      const change = parseSignedChange(changeText ?? '0');
      const previousPrice = change === null ? price : price - change;
      return createItem('vietnambiz', 'heo-hoi', 'Heo hoi', 'Chan nuoi', region, price, change, timestamp, previousPrice);
    })
    .filter((item): item is CrawledPriceItem => item !== null);
}

function extractArticleBodyHtml(html: string) {
  const $ = load(html);

  for (const selector of ARTICLE_SELECTORS) {
    const node = $(selector).first();
    const bodyHtml = node.length > 0 ? $.html(node) : null;
    if (bodyHtml && foldText(node.text()).length > 0) {
      return bodyHtml;
    }
  }

  return html;
}

function extractArticleTitle(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('meta[name="twitter:title"]').attr('content') ??
    $('h1').first().text() ??
    '';

  return title.replace(/\s+/g, ' ').trim() || 'Giá lúa gạo hôm nay';
}

function extractArticleTimestamp(html: string, fallback: string) {
  const $ = load(html);
  return parseLooseDate(
    $('meta[property="article:published_time"]').attr('content') ??
      $('time').first().attr('datetime') ??
      $('time').first().text() ??
      $('.date, .time, .news-date, .article-time').first().text() ??
      fallback,
    fallback,
  );
}

function extractRicePriceTable(articleHtml: string) {
  const tables = extractTables(articleHtml);
  return (
    tables.find((entry) => {
      const header = foldText(extractRows(entry)[0]?.join(' ') ?? '');
      return header.includes('gia lua gao') && header.includes('gia tai cho');
    }) ??
    tables.find((entry) => foldText(extractRows(entry)[0]?.join(' ') ?? '').includes('gia lua gao')) ??
    null
  );
}

function normalizeRiceLabel(value: string) {
  return value.replace(/^[\s-]+/, '').replace(/\s+/g, ' ').trim();
}

function inferRicePriceType(label: string): 'farm_gate' | 'wholesale' {
  return foldText(label).startsWith('lua tuoi ') ? 'farm_gate' : 'wholesale';
}

function parseRiceRows(tableHtml: string) {
  const rows = extractRows(tableHtml);
  const structuredRows = rows
    .filter((row) => row.length >= 3)
    .map((row) => {
      const label = normalizeRiceLabel(row[0] ?? '');
      const priceText = row.length >= 4 ? row[2] ?? '' : row[row.length - 2] ?? '';
      const changeText = row[row.length - 1] ?? '0';

      if (!label || foldText(label).includes('gia lua gao')) {
        return null;
      }

      return {
        label,
        priceText,
        changeText,
      };
    })
    .filter((row): row is { label: string; priceText: string; changeText: string } => row !== null);

  if (structuredRows.length > 0) {
    return structuredRows;
  }

  const flatCells = rows.flat();
  const bodyCells = flatCells.length > 4 ? flatCells.slice(4) : flatCells;
  const fallbackRows: Array<{ label: string; priceText: string; changeText: string }> = [];

  for (let index = 0; index + 3 < bodyCells.length; index += 4) {
    const label = normalizeRiceLabel(bodyCells[index] ?? '');
    if (!label) {
      continue;
    }

    fallbackRows.push({
      label,
      priceText: bodyCells[index + 2] ?? '',
      changeText: bodyCells[index + 3] ?? '0',
    });
  }

  return fallbackRows;
}

export function parseVietnambizRiceArticle(html: string, fallbackTimestamp: string) {
  const articleBodyHtml = extractArticleBodyHtml(html);
  const table = extractRicePriceTable(articleBodyHtml) ?? extractRicePriceTable(html);
  const articleTitle = extractArticleTitle(html);
  const timestamp = extractArticleTimestamp(html, fallbackTimestamp);

  if (!table) {
    return {
      articleTitle,
      timestamp,
      items: [] as CrawledPriceItem[],
    };
  }

  const items: CrawledPriceItem[] = [];
  for (const { label, priceText, changeText } of parseRiceRows(table)) {
    const price = parseRangeAverage(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      continue;
    }

    const change = parseSignedChange(changeText);
    items.push({
      ...createItem('vietnambiz', 'gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', label, price, change, timestamp),
      priceType: inferRicePriceType(label),
      articleTitle,
    });
  }

  return {
    articleTitle,
    timestamp,
    items,
  };
}

function parseRice(html: string, timestamp: string): CrawledPriceItem[] {
  return parseVietnambizRiceArticle(html, timestamp).items;
}

const COMMODITIES: CommodityConfig[] = [
  {
    commodity: 'ca-phe-robusta',
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
    slug: 'gia-ca-phe-hom-nay',
    parser: parseCoffee,
  },
  {
    commodity: 'ho-tieu',
    commodityName: 'Ho tieu',
    category: 'Cay cong nghiep',
    slug: 'gia-tieu-hom-nay',
    parser: parsePepper,
  },
  {
    commodity: 'heo-hoi',
    commodityName: 'Heo hoi',
    category: 'Chan nuoi',
    slug: 'gia-heo-hoi-hom-nay',
    parser: parsePork,
  },
  {
    commodity: 'gao-noi-dia',
    commodityName: 'Lua gao DBSCL',
    category: 'Luong thuc',
    slug: 'gia-lua-gao-hom-nay',
    parser: parseRice,
  },
];

export async function crawlVietnambiz(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  let listingHtml = '';
  try {
    listingHtml = await fetchUtf8(LISTING_URL);
  } catch (error) {
    return failedSource('vietnambiz', 'vietnambiz.vn', LISTING_URL, fetchedAt, COMMODITIES.map((item) => item.commodity), error);
  }

  const results = await Promise.all(
    COMMODITIES.map(async (commodity) => {
      const articleUrl = extractLatestArticleUrl(listingHtml, commodity.slug);
      if (!articleUrl) {
        return failedSource(
          'vietnambiz',
          `vietnambiz.vn - ${commodity.commodityName}`,
          LISTING_URL,
          fetchedAt,
          [commodity.commodity],
          new Error(`No ${commodity.slug} article found on listing page`),
        );
      }

      try {
        const articleHtml = await fetchUtf8(articleUrl);
        const items = commodity.parser(articleHtml, fetchedAt);
        return finalizeSourceBatch(
          'vietnambiz',
          `vietnambiz.vn - ${commodity.commodityName}`,
          LISTING_URL,
          fetchedAt,
          [commodity.commodity],
          items,
          articleUrl,
        );
      } catch (error) {
        return failedSource(
          'vietnambiz',
          `vietnambiz.vn - ${commodity.commodityName}`,
          LISTING_URL,
          fetchedAt,
          [commodity.commodity],
          error,
          articleUrl,
        );
      }
    }),
  );

  return {
    items: results.flatMap((result) => result.items),
    sources: results.flatMap((result) => result.sources),
  };
}
