import * as cheerio from 'cheerio';
import type { CrawledPriceItem, SourceSnapshot } from './types.js';

const BASE_URL = 'https://nongnghiepmoitruong.vn';
const USER_AGENT = 'NongSanVN/0.5 (+https://github.com/bthanhdang96-source/radong.vn)';

type CommodityConfig = {
  commodityName: string;
  tagUrl: string;
  titlePattern: RegExp;
  parser: (html: string, timestamp: string) => CrawledPriceItem[];
};

function toBodyText(html: string): string {
  const $ = cheerio.load(html);
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function parseNumber(value: string): number {
  return Number(value.replace(/[^\d-]/g, ''));
}

function parseRangeAverage(value: string): number {
  const parts = value.split(/\s*[–-]\s*/).map((part) => parseNumber(part));
  const valid = parts.filter((part) => Number.isFinite(part) && part > 0);

  if (valid.length === 0) {
    return 0;
  }

  if (valid.length === 1) {
    return valid[0];
  }

  return Math.round(valid.reduce((sum, item) => sum + item, 0) / valid.length);
}

function extractLatestArticleUrl(html: string, titlePattern: RegExp): string | null {
  const matches = [...html.matchAll(/https:\/\/nongnghiepmoitruong\.vn\/[^"'\s<>]+d\d+\.html/g)].map((match) => match[0]);
  const unique = [...new Set(matches)];

  return unique.find((url) => titlePattern.test(url)) ?? unique[0] ?? null;
}

function extractTableTexts(html: string): string[] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((match) =>
    match[0].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
  );
}

function createItem(
  commodity: string,
  commodityName: string,
  category: string,
  region: string,
  price: number,
  change: number | null,
  timestamp: string,
  previousPrice?: number | null,
): CrawledPriceItem {
  const safePreviousPrice = previousPrice ?? (change !== null ? price - change : null);

  return {
    commodity,
    commodityName,
    category,
    region,
    price,
    unit: 'VND/kg',
    change,
    changePct:
      change !== null && safePreviousPrice && safePreviousPrice > 0
        ? Number(((change / safePreviousPrice) * 100).toFixed(2))
        : null,
    timestamp,
    source: 'nongnghiep',
    previousPrice: safePreviousPrice,
  };
}

function parseCoffee(html: string, timestamp: string): CrawledPriceItem[] {
  const text = toBodyText(html);
  const snippet = text.match(/Địa phương Giá cà phê hôm nay.*?Giá cà phê hôm nay ở trong nước hôm nay/u)?.[0] ?? text;
  const rowPattern = /(Đắk Lắk|Đắk Nông|Gia Lai|Lâm Đồng)\s+(\d{1,3}(?:\.\d{3})+)\s+([+-]?\d{1,4}(?:\.\d{3})*)/g;
  const items: CrawledPriceItem[] = [];

  for (const match of snippet.matchAll(rowPattern)) {
    const region = match[1]
      .replace('Đắk Lắk', 'Dak Lak')
      .replace('Đắk Nông', 'Dak Nong')
      .replace('Lâm Đồng', 'Lam Dong');
    items.push(createItem('ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', region, parseNumber(match[2]), parseNumber(match[3]), timestamp));
  }

  return items;
}

function parsePepper(html: string, timestamp: string): CrawledPriceItem[] {
  const text = toBodyText(html);
  const snippet =
    text.match(/Thay đổi so với ngày hôm trước \(Đơn vị: VNĐ\/kg\)\s*(.*?)Bảng giá hồ tiêu trong nước ngày/u)?.[1] ??
    text.match(/Bảng giá hồ tiêu.*?Bảng giá hồ tiêu trong nước ngày/u)?.[0] ??
    text;
  const rowPattern = /(Đắk Lắk|Gia Lai|Đắk Nông|Bà Rịa[^0-9]+|Bình Phước)\s+(\d{1,3}(?:\.\d{3})+)/g;
  const items: CrawledPriceItem[] = [];

  for (const match of snippet.matchAll(rowPattern)) {
    const region = match[1]
      .replace('Đắk Lắk', 'Dak Lak')
      .replace('Đắk Nông', 'Dak Nong')
      .replace('Bà Rịa – Vũng Tàu', 'Ba Ria - Vung Tau');
    const price = parseNumber(match[2]);
    items.push(createItem('ho-tieu', 'Ho tieu', 'Cay cong nghiep', region, price, 0, timestamp, price));
  }

  return items;
}

function parsePork(html: string, timestamp: string): CrawledPriceItem[] {
  const text = toBodyText(html);
  const regions = [
    {
      region: 'Mien Bac',
      pattern: /Giá heo hơi hôm nay .*? tại miền Bắc(.*?)Giá heo hơi hôm nay .*? ở miền Trung/u,
    },
    {
      region: 'Mien Trung - Tay Nguyen',
      pattern: /Giá heo hơi hôm nay .*? miền Trung và Tây Nguyên(.*?)Giá heo hơi hôm nay .*? tại miền Nam/u,
    },
    {
      region: 'Mien Nam',
      pattern: /Giá heo hơi hôm nay .*? tại miền Nam.*?(Địa phương Giá .*?kg\.)/u,
    },
  ] as const;

  return regions.flatMap((section) => {
    const segment = text.match(section.pattern)?.[1] ?? '';
    const values = [...segment.matchAll(/\b(\d{2}\.\d{3})\b/g)]
      .map((match) => parseNumber(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (values.length === 0) {
      return [];
    }

    const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return [createItem('heo-hoi', 'Heo hoi', 'Chan nuoi', section.region, average, 0, timestamp, average)];
  });
}

function parseRice(html: string, timestamp: string): CrawledPriceItem[] {
  const snippet =
    extractTableTexts(html).find((table) => table.includes('Loại gạo Giá hôm qua')) ??
    toBodyText(html);
  const rowPattern =
    /(IR 50404|IR 504|OM 18|CL 555|OM 5451|Đài Thơm 8|OM 380|Sóc thơm|Tấm thơm 504|Cám)\s+(\d{1,3}(?:\.\d{3})?\s*[–-]\s*\d{1,3}(?:\.\d{3})?)\s+(\d{1,3}(?:\.\d{3})?\s*[–-]\s*\d{1,3}(?:\.\d{3})?)\s+([+-]?\d+)/g;
  const items: CrawledPriceItem[] = [];

  for (const match of snippet.matchAll(rowPattern)) {
    const region = match[1].replace('Đài Thơm 8', 'Dai Thom 8').replace('Sóc thơm', 'Soc thom');
    const previousPrice = parseRangeAverage(match[2]);
    const price = parseRangeAverage(match[3]);
    const change = parseNumber(match[4]) !== 0 ? parseNumber(match[4]) : price - previousPrice;
    items.push(createItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', region, price, change, timestamp, previousPrice));
  }

  return items;
}

const COMMODITIES: CommodityConfig[] = [
  {
    commodityName: 'Ca phe Robusta',
    tagUrl: `${BASE_URL}/gia-ca-phe-tag67989/`,
    titlePattern: /gia-ca-phe-hom-nay/i,
    parser: parseCoffee,
  },
  {
    commodityName: 'Ho tieu',
    tagUrl: `${BASE_URL}/ho-tieu-tag75944/`,
    titlePattern: /gia-tieu-hom-nay/i,
    parser: parsePepper,
  },
  {
    commodityName: 'Heo hoi',
    tagUrl: `${BASE_URL}/gia-heo-hoi-hom-nay-tag90954/`,
    titlePattern: /gia-heo-hoi-hom-nay/i,
    parser: parsePork,
  },
  {
    commodityName: 'Lua gao DBSCL',
    tagUrl: `${BASE_URL}/gia-lua-tag49512/`,
    titlePattern: /gia-lua-gao-hom-nay/i,
    parser: parseRice,
  },
];

export async function crawlNongnghiep(): Promise<{ items: CrawledPriceItem[]; sources: SourceSnapshot[] }> {
  const fetchedAt = new Date().toISOString();
  const items: CrawledPriceItem[] = [];
  const sources: SourceSnapshot[] = [];

  for (const commodity of COMMODITIES) {
    try {
      const listingResponse = await fetch(commodity.tagUrl, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });
      const listingHtml = await listingResponse.text();

      if (!listingResponse.ok) {
        throw new Error(`Listing request failed with ${listingResponse.status}`);
      }

      const articleUrl = extractLatestArticleUrl(listingHtml, commodity.titlePattern);
      if (!articleUrl) {
        throw new Error('No article URL found on listing page');
      }

      const articleResponse = await fetch(articleUrl, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });
      const articleHtml = await articleResponse.text();

      if (!articleResponse.ok) {
        throw new Error(`Article request failed with ${articleResponse.status}`);
      }

      const parsedItems = commodity.parser(articleHtml, fetchedAt);
      items.push(...parsedItems);
      sources.push({
        id: 'nongnghiep',
        label: `nongnghiepmoitruong.vn - ${commodity.commodityName}`,
        url: commodity.tagUrl,
        latestArticleUrl: articleUrl,
        fetchedAt,
        success: parsedItems.length > 0,
        itemCount: parsedItems.length,
        error: parsedItems.length > 0 ? undefined : 'No rows parsed from latest article',
      });
    } catch (error) {
      sources.push({
        id: 'nongnghiep',
        label: `nongnghiepmoitruong.vn - ${commodity.commodityName}`,
        url: commodity.tagUrl,
        fetchedAt,
        success: false,
        itemCount: 0,
        error: error instanceof Error ? error.message : 'Unknown crawler error',
      });
    }
  }

  return { items, sources };
}
