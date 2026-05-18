import { PDFParse } from 'pdf-parse';
import { DURIAN_COMMODITY_SLUG } from '../durianPricing.js';
import { USD_VND_RATE } from '../marketDataMappings.js';
import { failedSource, finalizeSourceBatch, foldText, roundNumber } from './common.js';
import type { CrawledPriceItem, CrawlerResult } from './types.js';

const DEFAULT_REPORT_URL =
  'https://thitruongnongsan.gov.vn/images/2013/DANGNHAP/VnSAT_Rau%20qua/2025/Tu%E1%BA%A7n/B%C3%A1o%20c%C3%A1o%20Rau%20qu%E1%BA%A3%20s%E1%BB%91%2015_2025.pdf';
const SITE_URL = 'https://thitruongnongsan.gov.vn/';

export type DurianExportDiscoveryMode = 'pinned' | 'manual';

export type CrawlAgroinfoDurianExportOptions = {
  reportUrl?: string | null;
  discoveryMode?: DurianExportDiscoveryMode;
};

function getReportUrlOverride() {
  return process.env.DURIAN_EXPORT_REPORT_URL?.trim() || null;
}

function getDiscoveryMode(options: CrawlAgroinfoDurianExportOptions): DurianExportDiscoveryMode {
  const value = options.discoveryMode ?? process.env.DURIAN_EXPORT_DISCOVERY_MODE?.trim();
  return value === 'manual' ? 'manual' : 'pinned';
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
  const match = text.match(/Bao cao Rau qua so [^.\n]+/i);
  return match?.[0]?.replace(/\s+/g, ' ').trim() ?? 'Bao cao rau qua AGROINFO';
}

export function parseAgroinfoDurianExportText(rawText: string) {
  const text = foldText(rawText).replace(/\s+/g, ' ').trim();

  const thailandVietnamOrderedMatch = text.match(
    /thai lan va viet nam[^.]{0,240}?(\d{1,3}(?:[.,]\d{3})+)\s*usd\/tan va (\d{1,3}(?:[.,]\d{3})+)\s*usd\/tan/i,
  );
  if (thailandVietnamOrderedMatch) {
    return parseLocalizedNumber(thailandVietnamOrderedMatch[2]);
  }

  const vietnamThailandOrderedMatch = text.match(
    /viet nam va thai lan[^.]{0,240}?(\d{1,3}(?:[.,]\d{3})+)\s*usd\/tan va (\d{1,3}(?:[.,]\d{3})+)\s*usd\/tan/i,
  );
  if (vietnamThailandOrderedMatch) {
    return parseLocalizedNumber(vietnamThailandOrderedMatch[1]);
  }

  const directVietnamMatch = text.match(/gia nhap khau sau rieng binh quan[^.]{0,240}?viet nam[^.]{0,80}?(\d{1,3}(?:[.,]\d{3})+)\s*usd\/tan/i);
  if (directVietnamMatch) {
    return parseLocalizedNumber(directVietnamMatch[1]);
  }

  throw new Error('No Vietnam durian import proxy value found in AGROINFO report text');
}

function resolveReportUrl(options: CrawlAgroinfoDurianExportOptions) {
  const override = options.reportUrl ?? getReportUrlOverride();
  const discoveryMode = getDiscoveryMode(options);

  if (discoveryMode === 'manual') {
    if (!override) {
      throw new Error('DURIAN_EXPORT_REPORT_URL is required when discovery mode is manual');
    }

    return override;
  }

  return override ?? DEFAULT_REPORT_URL;
}

export async function crawlAgroinfoDurianExport(
  options: CrawlAgroinfoDurianExportOptions = {},
): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString();
  const discoveryMode = getDiscoveryMode(options);

  try {
    const reportUrl = resolveReportUrl(options);
    const pdfBuffer = await downloadPdf(reportUrl);
    const reportText = await extractPdfText(pdfBuffer);
    const priceUsdPerTon = parseAgroinfoDurianExportText(reportText);
    if (!Number.isFinite(priceUsdPerTon) || priceUsdPerTon <= 0) {
      throw new Error(`Invalid durian proxy value parsed from AGROINFO report: ${priceUsdPerTon}`);
    }

    const priceUsdPerKg = Number((priceUsdPerTon / 1000).toFixed(4));
    const priceVndPerKg = roundNumber(priceUsdPerKg * USD_VND_RATE);
    const articleTitle = extractReportTitle(reportText);
    const item: CrawledPriceItem = {
      commodity: DURIAN_COMMODITY_SLUG,
      commodityName: 'Sầu riêng',
      category: 'Trái cây',
      region: 'Viet Nam',
      price: priceVndPerKg,
      unit: 'VND/kg',
      change: null,
      changePct: null,
      timestamp: fetchedAt,
      source: 'agroinfo_fruit_report',
      priceType: 'export',
      marketName: 'China import unit value proxy',
      articleTitle,
      countryCode: 'CHN',
      exchangeRate: USD_VND_RATE,
      priceUsd: priceUsdPerKg,
      dedupeKey: `agroinfo_fruit_report:${DURIAN_COMMODITY_SLUG}:${priceUsdPerTon}`,
      previousPrice: null,
      extra: {
        sourceFormat: 'pdf_weekly_report',
        proxyType: 'china_import_unit_value',
        reportUrl,
        priceUsdPerTon: Number(priceUsdPerTon.toFixed(2)),
        priceUsdPerKg,
        exportProxy: true,
      },
    };

    return finalizeSourceBatch(
      'agroinfo_fruit_report',
      'AGROINFO - Durian export proxy',
      SITE_URL,
      fetchedAt,
      [DURIAN_COMMODITY_SLUG],
      [item],
      reportUrl,
      {
        discoveryMode,
        reportUrl,
        sourceFormat: 'pdf_weekly_report',
        exportProxy: true,
      },
    );
  } catch (error) {
    return failedSource(
      'agroinfo_fruit_report',
      'AGROINFO - Durian export proxy',
      SITE_URL,
      fetchedAt,
      [DURIAN_COMMODITY_SLUG],
      error,
      options.reportUrl ?? getReportUrlOverride() ?? DEFAULT_REPORT_URL,
      {
        discoveryMode,
        reportUrl: options.reportUrl ?? getReportUrlOverride() ?? DEFAULT_REPORT_URL,
        sourceFormat: 'pdf_weekly_report',
        exportProxy: true,
      },
    );
  }
}
