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
} from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const BASE_URL = 'https://vietnambiz.vn';
const LISTING_URL = `${BASE_URL}/hang-hoa/nong-san.htm`;

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

      return createItem('vietnambiz', 'ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', region, price, parseNumber(changeText ?? '0'), timestamp);
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

      return createItem('vietnambiz', 'ho-tieu', 'Ho tieu', 'Cay cong nghiep', region, price, parseNumber(changeText ?? '0'), timestamp);
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

      const change = changeText && changeText !== '-' ? parseNumber(changeText) : 0;
      return createItem('vietnambiz', 'heo-hoi', 'Heo hoi', 'Chan nuoi', region, price, change, timestamp, price - change);
    })
    .filter((item): item is CrawledPriceItem => item !== null);
}

function parseRice(html: string, timestamp: string): CrawledPriceItem[] {
  const tables = extractTables(html);
  const table = tables.find((entry) => foldText(entry).includes('gia lua gao')) ?? tables[0];
  if (!table) {
    return [];
  }

  const rows = extractRows(table);
  const cells = rows.length === 1 ? rows[0] : rows.flat();
  const bodyCells = cells.slice(4);
  const items: CrawledPriceItem[] = [];

  for (let index = 0; index + 3 < bodyCells.length; index += 4) {
    const region = bodyCells[index]?.replace(/^-+\s*/, '');
    const currentText = bodyCells[index + 2];
    const changeText = bodyCells[index + 3];
    const price = parseRangeAverage(currentText ?? '');
    if (!region || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const change = changeText && changeText !== '-' ? parseNumber(changeText) : 0;
    items.push(createItem('vietnambiz', 'gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', region, price, change, timestamp, price - change));
  }

  return items;
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
