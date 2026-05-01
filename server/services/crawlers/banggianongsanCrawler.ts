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
} from './common.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

type CommodityConfig = {
  commodity: string
  commodityName: string
  category: string
  url: string
  parser: (html: string, timestamp: string) => CrawledPriceItem[]
}

function parsePriceDelta(value: string): number {
  const normalized = foldText(value)
  if (!value || normalized.includes('khong doi') || normalized.includes('moi cap nhat') || value.trim() === '-') {
    return 0
  }

  const match = value.match(/[+-]?\s*\d{1,3}(?:\.\d{3})*|[+-]?\s*\d+/)
  if (!match) {
    return 0
  }

  const amount = parseNumber(match[0])
  if (!Number.isFinite(amount)) {
    return 0
  }

  return match[0].includes('-') ? -amount : amount
}

function parseCoffee(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html)[0]
  if (!table) {
    return []
  }

  return extractRows(table)
    .slice(1)
    .map(cells => {
      const match = (cells[0] ?? '').match(/Cà phê\s+(.+?)\s+\(/i)
      const price = parseNumber(cells[2] ?? '')
      if (!match || !Number.isFinite(price) || price <= 0) {
        return null
      }

      return createItem(
        'banggianongsan',
        'ca-phe-robusta',
        'Ca phe Robusta',
        'Cay cong nghiep',
        match[1],
        price,
        parsePriceDelta(cells[3] ?? '0'),
        timestamp,
      )
    })
    .filter((item): item is CrawledPriceItem => item !== null)
}

function parsePepper(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html)[0]
  if (!table) {
    return []
  }

  return extractRows(table)
    .slice(1)
    .map(cells => {
      const match = (cells[0] ?? '').match(/Hồ tiêu\s+(.+?)\s+\(/i)
      const price = parseNumber(cells[2] ?? '')
      if (!match || !Number.isFinite(price) || price <= 0) {
        return null
      }

      return createItem(
        'banggianongsan',
        'ho-tieu',
        'Ho tieu',
        'Cay cong nghiep',
        match[1],
        price,
        parsePriceDelta(cells[3] ?? '0'),
        timestamp,
      )
    })
    .filter((item): item is CrawledPriceItem => item !== null)
}

function parseCashew(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html)[0]
  if (!table) {
    return []
  }

  return extractRows(table)
    .slice(2)
    .map(cells => {
      const region = cells[0] ?? ''
      const price = parseNumber(cells[1] ?? '')
      if (!region || !Number.isFinite(price) || price <= 0 || foldText(region).includes('phan loai')) {
        return null
      }

      return createItem(
        'banggianongsan',
        'cashew',
        'Hat dieu',
        'Cay cong nghiep',
        region,
        price,
        parsePriceDelta(cells[2] ?? '0'),
        timestamp,
      )
    })
    .filter((item): item is CrawledPriceItem => item !== null)
}

function parseCocoa(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html)[0]
  if (!table) {
    return []
  }

  const row = extractRows(table).find(cells => foldText(cells[0] ?? '').includes('hat cacao xo'))
  if (!row) {
    return []
  }

  const price = parseRangeAverage(row[1] ?? '')
  if (!Number.isFinite(price) || price <= 0) {
    return []
  }

  return [createItem('banggianongsan', 'cocoa', 'Ca cao', 'Cay cong nghiep', 'Viet Nam', price, parsePriceDelta(row[2] ?? '0'), timestamp)]
}

const COMMODITIES: CommodityConfig[] = [
  {
    commodity: 'ca-phe-robusta',
    commodityName: 'Ca phe Robusta',
    category: 'Cay cong nghiep',
    url: 'https://banggianongsan.com/bang-gia-ca-phe/',
    parser: parseCoffee,
  },
  {
    commodity: 'ho-tieu',
    commodityName: 'Ho tieu',
    category: 'Cay cong nghiep',
    url: 'https://banggianongsan.com/bang-gia-tieu/',
    parser: parsePepper,
  },
  {
    commodity: 'cashew',
    commodityName: 'Hat dieu',
    category: 'Cay cong nghiep',
    url: 'https://banggianongsan.com/bang-gia-hat-dieu/',
    parser: parseCashew,
  },
  {
    commodity: 'cocoa',
    commodityName: 'Ca cao',
    category: 'Cay cong nghiep',
    url: 'https://banggianongsan.com/bang-gia-cacao-hom-nay/',
    parser: parseCocoa,
  },
]

export async function crawlBanggianongsan(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()

  const results = await Promise.all(
    COMMODITIES.map(async commodity => {
      try {
        const html = await fetchUtf8(commodity.url)
        const items = commodity.parser(html, fetchedAt)
        return finalizeSourceBatch(
          'banggianongsan',
          `banggianongsan.com - ${commodity.commodityName}`,
          commodity.url,
          fetchedAt,
          [commodity.commodity],
          items,
          commodity.url,
        )
      } catch (error) {
        return failedSource(
          'banggianongsan',
          `banggianongsan.com - ${commodity.commodityName}`,
          commodity.url,
          fetchedAt,
          [commodity.commodity],
          error,
          commodity.url,
        )
      }
    }),
  )

  return {
    items: results.flatMap(result => result.items),
    sources: results.flatMap(result => result.sources),
  }
}
