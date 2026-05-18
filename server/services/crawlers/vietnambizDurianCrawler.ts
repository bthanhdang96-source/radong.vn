import { XMLParser } from 'fast-xml-parser';
import { load } from 'cheerio';
import { parseLooseDate } from '../news/common.js';
import { parseDurianLabel } from '../durianPricing.js';
import {
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseRangeAverage,
} from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const BASE_URL = 'https://vietnambiz.vn';
const RSS_URL = 'https://vietnambiz.vn/rss/hang-hoa.rss';
const ARTICLE_SELECTORS = ['.vnbiz-content', '.detail-content', 'article'];
const RSS_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  trimValues: true,
});

type RssItem = Record<string, unknown>;

type RegionSegment = {
  region: string;
  text: string;
};

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseRssItems(xml: string) {
  const parsed = RSS_PARSER.parse(xml) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } };
  };

  return toArray(parsed.rss?.channel?.item);
}

function getLinkValue(item: RssItem) {
  const value = item.link;
  if (typeof value === 'string') {
    return new URL(value, BASE_URL).toString();
  }

  return null;
}

function isDurianRssItem(item: RssItem) {
  const title = foldText(typeof item.title === 'string' ? item.title : '');
  const link = foldText(getLinkValue(item) ?? '');

  return (
    link.includes('gia-sau-rieng-hom-nay-') ||
    title.includes('gia sau rieng hom nay') ||
    title.includes('sau rieng')
  );
}

function extractArticleTitle(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('meta[name="twitter:title"]').attr('content') ??
    $('h1').first().text() ??
    $('title').text() ??
    'Gia sau rieng hom nay';

  return title.replace(/\s+/g, ' ').trim();
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

function extractArticleBodyText(html: string) {
  const $ = load(html);

  for (const selector of ARTICLE_SELECTORS) {
    const node = $(selector).first();
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text) {
      return text;
    }
  }

  return $('body').text().replace(/\s+/g, ' ').trim();
}

function extractRegionSegments(normalizedText: string): RegionSegment[] {
  const configs = [
    {
      region: 'Miền Tây Nam Bộ',
      markers: ['tai tay nam bo', 'tai mien tay nam bo', 'o khu vuc tay nam bo', 'o khu vuc mien tay nam bo'],
    },
    {
      region: 'Miền Đông Nam Bộ',
      markers: ['o khu vuc dong nam bo', 'tai dong nam bo', 'tai mien dong nam bo', 'doi voi dong nam bo'],
    },
    {
      region: 'Tây Nguyên',
      markers: ['doi voi tay nguyen', 'tai tay nguyen', 'o khu vuc tay nguyen'],
    },
  ];

  const starts = configs
    .map((config) => {
      const start = config.markers
        .map((marker) => normalizedText.indexOf(marker))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0];

      return start === undefined ? null : { region: config.region, start };
    })
    .filter((entry): entry is { region: string; start: number } => entry !== null)
    .sort((a, b) => a.start - b.start);

  if (starts.length === 0) {
    return [];
  }

  return starts.map((entry, index) => ({
    region: entry.region,
    text: normalizedText.slice(entry.start, starts[index + 1]?.start ?? normalizedText.length).trim(),
  }));
}

function createDurianPattern(varietyPattern: string, gradePattern: string) {
  return new RegExp(
    `(?:sau rieng\\s+)?(?:${varietyPattern})[^.]{0,120}?(?:${gradePattern})[^\\d]{0,20}([0-9]{1,3}(?:[.,][0-9]{3})+)\\s*-\\s*([0-9]{1,3}(?:[.,][0-9]{3})+)`,
    'i',
  );
}

const DURIAN_SEGMENT_PATTERNS = [
  { label: 'Sầu riêng Ri6 loại 1', regex: createDurianPattern('ri\\s*6', 'loai 1|loai a|dep') },
  { label: 'Sầu riêng Ri6 hàng xô', regex: createDurianPattern('ri\\s*6', 'hang xo|loai b|loai c|xo') },
  { label: 'Sầu riêng Thái loại tuyển', regex: createDurianPattern('thai|monthong', 'loai tuyen|loai 1|loai a|dep') },
  { label: 'Sầu riêng Thái hàng xô', regex: createDurianPattern('thai|monthong', 'hang xo|loai b|loai c|xo') },
  { label: 'Sầu riêng Dona loại 1', regex: createDurianPattern('dona', 'loai 1|loai a|dep') },
  { label: 'Sầu riêng Dona hàng xô', regex: createDurianPattern('dona', 'hang xo|loai b|loai c|xo') },
];

export function parseVietnambizDurianArticle(html: string, fallbackTimestamp: string) {
  const articleTitle = extractArticleTitle(html);
  const timestamp = extractArticleTimestamp(html, fallbackTimestamp);
  const normalizedBody = foldText(extractArticleBodyText(html));
  const segments = extractRegionSegments(normalizedBody);

  const items: CrawledPriceItem[] = [];
  for (const segment of segments) {
    const priceType = segment.text.includes('thu mua') ? 'farm_gate' : 'wholesale';
    for (const pattern of DURIAN_SEGMENT_PATTERNS) {
      const match = segment.text.match(pattern.regex);
      if (!match) {
        continue;
      }

      const price = parseRangeAverage(`${match[1]} - ${match[2]}`);
      if (!Number.isFinite(price) || price <= 0) {
        continue;
      }

      const durianLabel = parseDurianLabel(pattern.label);
      items.push({
        commodity: 'sau-rieng',
        commodityName: 'Sầu riêng',
        category: 'Trái cây',
        region: segment.region,
        price,
        unit: 'VND/kg',
        change: null,
        changePct: null,
        timestamp,
        source: 'vietnambiz',
        priceType,
        variety: durianLabel.variety,
        qualityGrade: durianLabel.qualityGrade,
        marketName: segment.region,
        articleTitle,
        countryCode: 'VNM',
        previousPrice: null,
        extra: {
          rawSegment: segment.text,
          matchedLabel: pattern.label,
          sourceFormat: 'rss_article_prose',
        },
      });
    }
  }

  return {
    articleTitle,
    timestamp,
    items,
  };
}

export async function crawlVietnambizDurianFromRss(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const rssXml = await fetchUtf8(RSS_URL);
    const item = parseRssItems(rssXml).find(isDurianRssItem);
    const articleUrl = item ? getLinkValue(item) : null;
    if (!articleUrl) {
      throw new Error('No durian article found in VietnamBiz RSS feed');
    }

    const articleHtml = await fetchUtf8(articleUrl);
    const parsed = parseVietnambizDurianArticle(articleHtml, fetchedAt);
    return finalizeSourceBatch(
      'vietnambiz',
      'vietnambiz.vn - Gia sau rieng',
      RSS_URL,
      fetchedAt,
      ['sau-rieng'],
      parsed.items,
      articleUrl,
      {
        sourceFormat: 'rss_article_prose',
      },
    );
  } catch (error) {
    return failedSource(
      'vietnambiz',
      'vietnambiz.vn - Gia sau rieng',
      RSS_URL,
      fetchedAt,
      ['sau-rieng'],
      error,
      RSS_URL,
      {
        sourceFormat: 'rss_article_prose',
      },
    );
  }
}
