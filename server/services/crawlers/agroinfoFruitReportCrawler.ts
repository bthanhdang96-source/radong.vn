import { PDFParse } from 'pdf-parse';
import { failedSource, finalizeSourceBatch, foldText } from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const DEFAULT_REPORT_URL =
  'https://thitruongnongsan.gov.vn/images/2013/DANGNHAP/VnSAT_Rau%20qua/2025/Tu%E1%BA%A7n/B%C3%A1o%20c%C3%A1o%20Rau%20qu%E1%BA%A3%20s%E1%BB%91%2017_2025.pdf';
const SITE_URL = 'https://thitruongnongsan.gov.vn/';

export type CrawlAgroinfoFruitReportOptions = {
  reportUrl?: string | null;
  enabledSlugs?: string[] | null;
};

function getReportUrl(options: CrawlAgroinfoFruitReportOptions) {
  return options.reportUrl?.trim() || process.env.AGROINFO_FRUIT_REPORT_URL?.trim() || DEFAULT_REPORT_URL;
}

function getEnabledSlugs(options: CrawlAgroinfoFruitReportOptions) {
  const enabled = options.enabledSlugs?.filter(Boolean);
  return enabled && enabled.length > 0 ? enabled : ['thanh-long', 'dua-tuoi'];
}

async function downloadPdf(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'NongSanVN/0.6 (+https://github.com/bthanhdang96-source/radong.vn)',
      accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = result.text.replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Error('AGROINFO PDF text extraction returned empty content');
  }

  return text;
}

function parseLocalizedNumber(value: string) {
  return Number(value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
}

function extractReportTitle(text: string) {
  const match = text.match(/Bao cao Rau qua[^.\n]+/i);
  return match?.[0]?.replace(/\s+/g, ' ').trim() ?? 'Bao cao rau qua AGROINFO';
}

export function parseAgroinfoFruitReportText(rawText: string, fallbackTimestamp: string, enabledSlugs: string[] = ['thanh-long', 'dua-tuoi']) {
  const text = rawText.replace(/\s+/g, ' ').trim();
  const folded = foldText(text);
  const articleTitle = extractReportTitle(text);
  const items: CrawledPriceItem[] = [];

  if (enabledSlugs.includes('thanh-long')) {
    const whiteDragonMatch = folded.match(
      /gia thanh long ruot trang[^.]{0,120}?dat\s+(\d{1,3}(?:[.,]\d{3})*)\s*vnd\/kg/i,
    );
    if (whiteDragonMatch) {
      items.push({
        commodity: 'thanh-long',
        commodityName: 'Thanh long',
        category: 'Trai cay',
        region: 'Viet Nam',
        price: parseLocalizedNumber(whiteDragonMatch[1]),
        unit: 'VND/kg',
        change: null,
        changePct: null,
        timestamp: fallbackTimestamp,
        source: 'agroinfo_fruit_report',
        priceType: 'farm_gate',
        marketName: 'Viet Nam',
        articleTitle,
        countryCode: 'VNM',
        previousPrice: null,
        extra: {
          sourceFormat: 'pdf_weekly_report',
          sourceVariety: 'thanh-long-ruot-trang',
        },
      });
    }
  }

  if (enabledSlugs.includes('dua-tuoi')) {
    const coconutMatch = folded.match(
      /gia dua tuoi[^.]{0,240}?(\d{1,3}(?:[.,]\d{3})*)\s*-\s*(\d{1,3}(?:[.,]\d{3})*)\s*vnd\/chuc/i,
    );
    if (coconutMatch) {
      const priceLow = parseLocalizedNumber(coconutMatch[1]);
      const priceHigh = parseLocalizedNumber(coconutMatch[2]);
      const coconutSentence = coconutMatch[0];
      items.push({
        commodity: 'dua-tuoi',
        commodityName: 'Dua tuoi',
        category: 'Trai cay',
        region: coconutSentence.includes('dong bang song cuu long') ? 'Dong bang song Cuu Long' : 'Viet Nam',
        price: Math.round((priceLow + priceHigh) / 2),
        unit: 'VND/chuc',
        unitRaw: 'VND/chuc',
        normalizedUnitKey: 'chuc',
        unitQuantity: 1,
        change: null,
        changePct: null,
        timestamp: fallbackTimestamp,
        source: 'agroinfo_fruit_report',
        priceType: 'farm_gate',
        marketName: 'AGROINFO fruit report',
        articleTitle,
        countryCode: 'VNM',
        previousPrice: null,
        extra: {
          sourceFormat: 'pdf_weekly_report',
          rawSentence: coconutSentence,
          rawPriceLow: priceLow,
          rawPriceHigh: priceHigh,
        },
      });
    }
  }

  return {
    articleTitle,
    items,
  };
}

export async function crawlAgroinfoFruitReport(
  options: CrawlAgroinfoFruitReportOptions = {},
): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();
  const reportUrl = getReportUrl(options);
  const enabledSlugs = getEnabledSlugs(options);

  try {
    const pdfBuffer = await downloadPdf(reportUrl);
    const reportText = await extractPdfText(pdfBuffer);
    const parsed = parseAgroinfoFruitReportText(reportText, fetchedAt, enabledSlugs);
    return finalizeSourceBatch(
      'agroinfo_fruit_report',
      'AGROINFO - Fruit report',
      SITE_URL,
      fetchedAt,
      enabledSlugs,
      parsed.items,
      reportUrl,
      {
        reportUrl,
        sourceFormat: 'pdf_weekly_report',
      },
    );
  } catch (error) {
    return failedSource(
      'agroinfo_fruit_report',
      'AGROINFO - Fruit report',
      SITE_URL,
      fetchedAt,
      enabledSlugs,
      error,
      reportUrl,
      {
        reportUrl,
        sourceFormat: 'pdf_weekly_report',
      },
    );
  }
}
