import {
  createItem,
  extractRows,
  extractTables,
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseRangeAverage,
} from './common.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

const PAGE_URL = 'https://vpsaspice.org/market-price/vietnam/'

function parseDomesticPepper(html: string, timestamp: string): CrawledPriceItem[] {
  const table = extractTables(html).find(entry => foldText(entry).includes('hat tieu den'))
  if (!table) {
    return []
  }

  const dataRows = extractRows(table).filter(
    row => row.length >= 3 && /^\d{1,2}(?:\/\d{1,2}|=>\d{1,2})/.test(row[0] ?? ''),
  )

  const latest = dataRows[0]
  if (!latest) {
    return []
  }

  const latestPrice = parseRangeAverage(latest[1] ?? '')
  if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
    return []
  }

  const previousPrice = parseRangeAverage(dataRows[1]?.[1] ?? '')
  const change = Number.isFinite(previousPrice) && previousPrice > 0 ? latestPrice - previousPrice : 0

  return [
    createItem(
      'vpsaspice',
      'ho-tieu',
      'Ho tieu',
      'Cay cong nghiep',
      'Viet Nam',
      latestPrice,
      change,
      timestamp,
      Number.isFinite(previousPrice) && previousPrice > 0 ? previousPrice : latestPrice,
    ),
  ]
}

export async function crawlVpsaspice(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()

  try {
    const html = await fetchUtf8(PAGE_URL)
    const items = parseDomesticPepper(html, fetchedAt)
    return finalizeSourceBatch(
      'vpsaspice',
      'vpsaspice.org - Ho tieu',
      PAGE_URL,
      fetchedAt,
      ['ho-tieu'],
      items,
      PAGE_URL,
    )
  } catch (error) {
    return failedSource('vpsaspice', 'vpsaspice.org - Ho tieu', PAGE_URL, fetchedAt, ['ho-tieu'], error, PAGE_URL)
  }
}
