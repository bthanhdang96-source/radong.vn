import { createItem, extractParagraphs, failedSource, fetchUtf8, finalizeSourceBatch, foldText, parseNumber } from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const SITEMAP_URL = 'https://congthuong.vn/news-sitemap.xml';

type CommodityConfig = {
  commodity: string;
  commodityName: string;
  category: string;
  slug: string;
  provinces: string[];
};

function extractLatestArticleUrl(sitemapXml: string, slug: string): string | null {
  const urls = [...sitemapXml.matchAll(/<loc>(https:\/\/congthuong\.vn\/[^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => url.includes(slug));

  return urls[0] ?? null;
}

function extractChange(paragraph: string): number {
  const changeMatch = paragraph.match(/(tăng|giảm)[^0-9]{0,20}(\d{1,3}(?:\.\d{3})+)/i);
  if (!changeMatch) {
    return 0;
  }

  const value = parseNumber(changeMatch[2]);
  return foldText(changeMatch[1]).includes('giam') ? -value : value;
}

function matchProvincePrice(paragraph: string, province: string): number | null {
  const escaped = province.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escaped}[\\s\\S]{0,180}?(?:mức|ngưỡng|giao dịch ở mức|đạt)\\s*(\\d{1,3}(?:\\.\\d{3})+)`, 'i'),
    new RegExp(`${escaped}[\\s\\S]{0,120}?với\\s*(\\d{1,3}(?:\\.\\d{3})+)`, 'i'),
    new RegExp(`${escaped}[\\s\\S]{0,180}?(\\d{1,3}(?:\\.\\d{3})+)\\s*đồng\\/kg`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = paragraph.match(pattern);
    if (!match) {
      continue;
    }

    const value = parseNumber(match[1]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function parseProvinceParagraphs(
  paragraphs: string[],
  sourceCommodity: CommodityConfig,
  timestamp: string,
): CrawledPriceItem[] {
  const items: CrawledPriceItem[] = [];

  for (const province of sourceCommodity.provinces) {
    const paragraph = paragraphs.find((entry) => foldText(entry).includes(foldText(province)));
    if (!paragraph) {
      continue;
    }

    const price = matchProvincePrice(paragraph, province);
    if (!price) {
      continue;
    }

    const change = extractChange(paragraph);
    items.push(
      createItem(
        'congthuong',
        sourceCommodity.commodity,
        sourceCommodity.commodityName,
        sourceCommodity.category,
        province,
        price,
        change,
        timestamp,
        price - change,
      ),
    );
  }

  return items;
}

const COMMODITIES: CommodityConfig[] = [
  {
    commodity: 'ca-phe-robusta',
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
    slug: 'gia-ca-phe-hom-nay',
    provinces: ['Đắk Lắk', 'Gia Lai', 'Lâm Đồng', 'Đắk Nông'],
  },
  {
    commodity: 'heo-hoi',
    commodityName: 'Heo hoi',
    category: 'Chan nuoi',
    slug: 'gia-heo-hoi-hom-nay',
    provinces: [
      'Hưng Yên',
      'Thái Nguyên',
      'Quảng Ninh',
      'Bắc Ninh',
      'Hà Nội',
      'Hải Phòng',
      'Lai Châu',
      'Tuyên Quang',
      'Cao Bằng',
      'Lạng Sơn',
      'Ninh Bình',
      'Lào Cai',
      'Điện Biên',
      'Phú Thọ',
      'Sơn La',
      'Lâm Đồng',
      'Đắk Lắk',
      'Thanh Hóa',
      'Nghệ An',
      'Gia Lai',
      'Khánh Hòa',
      'Hà Tĩnh',
      'Quảng Trị',
      'Huế',
      'Đà Nẵng',
      'Quảng Ngãi',
      'Cần Thơ',
      'Đồng Nai',
      'Đồng Tháp',
      'TP. Hồ Chí Minh',
      'Vĩnh Long',
      'Tây Ninh',
      'An Giang',
      'Cà Mau',
    ],
  },
];

export async function crawlCongthuong(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  let sitemapXml = '';
  try {
    sitemapXml = await fetchUtf8(SITEMAP_URL);
  } catch (error) {
    return failedSource('congthuong', 'congthuong.vn', SITEMAP_URL, fetchedAt, COMMODITIES.map((item) => item.commodity), error);
  }

  const results = await Promise.all(
    COMMODITIES.map(async (commodity) => {
      const articleUrl = extractLatestArticleUrl(sitemapXml, commodity.slug);
      if (!articleUrl) {
        return failedSource(
          'congthuong',
          `congthuong.vn - ${commodity.commodityName}`,
          SITEMAP_URL,
          fetchedAt,
          [commodity.commodity],
          new Error(`No ${commodity.slug} article found in news sitemap`),
        );
      }

      try {
        const articleHtml = await fetchUtf8(articleUrl);
        const paragraphs = extractParagraphs(articleHtml);
        const items = parseProvinceParagraphs(paragraphs, commodity, fetchedAt);
        return finalizeSourceBatch(
          'congthuong',
          `congthuong.vn - ${commodity.commodityName}`,
          SITEMAP_URL,
          fetchedAt,
          [commodity.commodity],
          items,
          articleUrl,
        );
      } catch (error) {
        return failedSource(
          'congthuong',
          `congthuong.vn - ${commodity.commodityName}`,
          SITEMAP_URL,
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
