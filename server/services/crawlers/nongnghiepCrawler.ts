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

const BASE_URL = 'https://nongnghiepmoitruong.vn';

type CommodityConfig = {
  commodity: string;
  commodityName: string;
  category: string;
  listingUrl: string;
  titlePattern: RegExp;
  parser: (html: string, timestamp: string) => CrawledPriceItem[];
};

function extractLatestArticleUrl(listingHtml: string, titlePattern: RegExp): string | null {
  const urls = [...listingHtml.matchAll(/href="([^"]+d\d+\.html)"/g)]
    .map((match) => match[1])
    .map((href) => new URL(href, BASE_URL).toString());

  return [...new Set(urls)].find((url) => titlePattern.test(url)) ?? null;
}

function parseCoffee(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html).find((entry) => foldText(entry).includes('gia ca phe'));
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

      return createItem('nongnghiep', 'ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', region, price, parseSignedChange(changeText ?? '0'), timestamp);
    })
    .filter((item): item is CrawledPriceItem => item !== null);
}

function parsePepper(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html).find((entry) => foldText(entry).includes('gia thu mua'));
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

      const change = parseSignedChange(changeText ?? '0');
      const previousPrice = change === null ? price : price - change;
      return createItem('nongnghiep', 'ho-tieu', 'Ho tieu', 'Cay cong nghiep', region, price, change, timestamp, previousPrice);
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
      return createItem('nongnghiep', 'heo-hoi', 'Heo hoi', 'Chan nuoi', region, price, change, timestamp, previousPrice);
    })
    .filter((item): item is CrawledPriceItem => item !== null);
}

function parseRiceRow(region: string, previousText: string, currentText: string, changeText: string, timestamp: string): CrawledPriceItem | null {
  const previousPrice = parseRangeAverage(previousText ?? '');
  const price = parseRangeAverage(currentText ?? '');
  if (!region || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const parsedChange = parseSignedChange(changeText ?? '0') ?? 0;
  const change = parsedChange !== 0 ? parsedChange : price - previousPrice;
  return createItem('nongnghiep', 'gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', region, price, change, timestamp, previousPrice || price - change);
}

function parseRice(html: string, timestamp: string): CrawledPriceItem[] {
  const items: CrawledPriceItem[] = [];

  for (const table of extractTables(html)) {
    const rows = extractRows(table);
    if (rows.length < 2) {
      continue;
    }

    const header = foldText(rows[0].join(' '));
    if (!header.includes('gia hom qua') || !header.includes('gia hom nay')) {
      continue;
    }

    for (const cells of rows.slice(1)) {
      const [region, previousText, currentText, changeText] = cells;
      const item = parseRiceRow(region ?? '', previousText ?? '', currentText ?? '', changeText ?? '0', timestamp);
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

const COMMODITIES: CommodityConfig[] = [
  {
    commodity: 'ca-phe-robusta',
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
    listingUrl: `${BASE_URL}/gia-ca-phe-tag67989/`,
    titlePattern: /gia-ca-phe-hom-nay/i,
    parser: parseCoffee,
  },
  {
    commodity: 'ho-tieu',
    commodityName: 'Ho tieu',
    category: 'Cay cong nghiep',
    listingUrl: `${BASE_URL}/ho-tieu-tag75944/`,
    titlePattern: /gia-tieu-hom-nay/i,
    parser: parsePepper,
  },
  {
    commodity: 'heo-hoi',
    commodityName: 'Heo hoi',
    category: 'Chan nuoi',
    listingUrl: `${BASE_URL}/gia-heo-hoi-hom-nay-tag90954/`,
    titlePattern: /gia-heo-hoi-hom-nay/i,
    parser: parsePork,
  },
  {
    commodity: 'gao-noi-dia',
    commodityName: 'Lua gao DBSCL',
    category: 'Luong thuc',
    listingUrl: `${BASE_URL}/gia-lua-tag49512/`,
    titlePattern: /gia-lua-gao-hom-nay/i,
    parser: parseRice,
  },
];

export async function crawlNongnghiep(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(
    COMMODITIES.map(async (commodity) => {
      try {
        const listingHtml = await fetchUtf8(commodity.listingUrl);
        const articleUrl = extractLatestArticleUrl(listingHtml, commodity.titlePattern);
        if (!articleUrl) {
          throw new Error('No article URL found on listing page');
        }

        const articleHtml = await fetchUtf8(articleUrl);
        const items = commodity.parser(articleHtml, fetchedAt);
        return finalizeSourceBatch(
          'nongnghiep',
          `nongnghiepmoitruong.vn - ${commodity.commodityName}`,
          commodity.listingUrl,
          fetchedAt,
          [commodity.commodity],
          items,
          articleUrl,
        );
      } catch (error) {
        return failedSource(
          'nongnghiep',
          `nongnghiepmoitruong.vn - ${commodity.commodityName}`,
          commodity.listingUrl,
          fetchedAt,
          [commodity.commodity],
          error,
        );
      }
    }),
  );

  return {
    items: results.flatMap((result) => result.items),
    sources: results.flatMap((result) => result.sources),
  };
}
