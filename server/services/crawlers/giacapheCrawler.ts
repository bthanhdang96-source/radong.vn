import * as cheerio from 'cheerio';
import type { CrawledPriceItem, SourceSnapshot } from './types.js';

const BASE_URL = 'https://giacaphe.com';
const USER_AGENT = 'NongSanVN/0.5 (+https://github.com/bthanhdang96-source/radong.vn)';

const PROVINCES = [
  { region: 'Dak Lak', url: `${BASE_URL}/gia-ca-phe-dak-lak/` },
  { region: 'Dak Nong', url: `${BASE_URL}/gia-ca-phe-dak-nong/` },
  { region: 'Gia Lai', url: `${BASE_URL}/gia-ca-phe-gia-lai/` },
  { region: 'Lam Dong', url: `${BASE_URL}/gia-ca-phe-lam-dong/` },
] as const;

function parseNumber(value: string): number {
  return Number(value.replace(/[^\d-]/g, ''));
}

function detectChallenge(html: string): boolean {
  const text = html.toLowerCase();
  return text.includes('just a moment') || text.includes('enable javascript and cookies to continue') || text.includes('cf_chl');
}

function extractPriceData(html: string, region: string): { price: number; change: number | null; previousPrice: number | null } | null {
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  const rowPattern = new RegExp(`${region.replace(/\s+/g, '\\s+')}.*?(\\d{1,3}(?:[.,]\\d{3})+)(?:\\s+([+-]?\\d{1,4}(?:[.,]\\d{3})*))?`, 'i');
  const rowMatch = text.match(rowPattern);
  if (!rowMatch) {
    return null;
  }

  const price = parseNumber(rowMatch[1]);
  const change = rowMatch[2] ? parseNumber(rowMatch[2]) : null;
  const previousPrice = change === null ? null : price - change;

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return { price, change, previousPrice };
}

export async function crawlGiacaphe(): Promise<{ items: CrawledPriceItem[]; sources: SourceSnapshot[] }> {
  const fetchedAt = new Date().toISOString();

  try {
    const items = await Promise.all(
      PROVINCES.map(async ({ region, url }) => {
        const response = await fetch(url, {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml',
          },
        });

        const html = await response.text();
        if (!response.ok || detectChallenge(html)) {
          throw new Error(`Blocked by remote challenge at ${url}`);
        }

        const parsed = extractPriceData(html, region);
        if (!parsed) {
          throw new Error(`Could not parse ${region}`);
        }

        return {
          commodity: 'ca-phe-robusta',
          commodityName: 'Ca phe Robusta',
          category: 'Cay cong nghiep',
          region,
          price: parsed.price,
          unit: 'VND/kg',
          change: parsed.change,
          changePct:
            parsed.change !== null && parsed.previousPrice && parsed.previousPrice > 0
              ? Number(((parsed.change / parsed.previousPrice) * 100).toFixed(2))
              : null,
          timestamp: fetchedAt,
          source: 'giacaphe',
          previousPrice: parsed.previousPrice,
        } satisfies CrawledPriceItem;
      }),
    );

    return {
      items,
      sources: [
        {
          id: 'giacaphe',
          label: 'giacaphe.com',
          url: BASE_URL,
          fetchedAt,
          success: true,
          itemCount: items.length,
        },
      ],
    };
  } catch (error) {
    return {
      items: [],
      sources: [
        {
          id: 'giacaphe',
          label: 'giacaphe.com',
          url: BASE_URL,
          fetchedAt,
          success: false,
          itemCount: 0,
          error: error instanceof Error ? error.message : 'Unknown crawler error',
        },
      ],
    };
  }
}
