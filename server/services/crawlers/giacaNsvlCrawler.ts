import {
  createItem,
  extractRows,
  extractTables,
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseNumber,
} from './common.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

const PAGE_URL = 'https://giaca.nsvl.com.vn/'

type CommodityMatch = {
  matcher: string
  commodity: string
  commodityName: string
  category: string
}

const COMMODITY_MATCHES: CommodityMatch[] = [
  {
    matcher: 'cam sanh loai 1',
    commodity: 'cam-sanh',
    commodityName: 'Cam sanh',
    category: 'Trai cay',
  },
  {
    matcher: 'buoi nam roi loai 1',
    commodity: 'buoi-nam-roi',
    commodityName: 'Buoi Nam Roi',
    category: 'Trai cay',
  },
  {
    matcher: 'ca tra',
    commodity: 'ca-tra',
    commodityName: 'Ca tra',
    category: 'Thuy san',
  },
  {
    matcher: 'heo hoi',
    commodity: 'heo-hoi',
    commodityName: 'Heo hoi',
    category: 'Chan nuoi',
  },
]

function parseHomepage(html: string, timestamp: string): CrawledPriceItem[] {
  const items: CrawledPriceItem[] = []
  const rows = extractTables(html).flatMap(table => extractRows(table).slice(1))

  for (const row of rows) {
    const name = row[0] ?? ''
    const unit = foldText(row[1] ?? '')
    const price = parseNumber(row[2] ?? '')
    if (!name || !unit.includes('kg') || !Number.isFinite(price) || price <= 0) {
      continue
    }

    const match = COMMODITY_MATCHES.find(entry => foldText(name).includes(entry.matcher))
    if (!match) {
      continue
    }

    items.push(createItem('giaca_nsvl', match.commodity, match.commodityName, match.category, 'Vinh Long', price, null, timestamp))
  }

  return items
}

export async function crawlGiacaNsvl(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()

  try {
    const html = await fetchUtf8(PAGE_URL)
    const items = parseHomepage(html, fetchedAt)
    return finalizeSourceBatch(
      'giaca_nsvl',
      'giaca.nsvl.com.vn - Vinh Long',
      PAGE_URL,
      fetchedAt,
      ['cam-sanh', 'buoi-nam-roi', 'ca-tra', 'heo-hoi'],
      items,
      PAGE_URL,
    )
  } catch (error) {
    return failedSource(
      'giaca_nsvl',
      'giaca.nsvl.com.vn - Vinh Long',
      PAGE_URL,
      fetchedAt,
      ['cam-sanh', 'buoi-nam-roi', 'ca-tra', 'heo-hoi'],
      error,
      PAGE_URL,
    )
  }
}
