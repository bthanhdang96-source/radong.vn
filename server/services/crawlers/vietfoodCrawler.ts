import {
  createItem,
  extractRows,
  extractTables,
  failedSource,
  fetchUtf8,
  finalizeSourceBatch,
  foldText,
  parseNumber,
  parseSignedChange,
} from './common.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

const HOME_URL = 'https://vietfood.org.vn/'
const ARTICLE_SLUG = 'gia-lua-gao-noi-dia-ngay-'

function extractLatestArticleUrl(homeHtml: string): string | null {
  const urls = [...homeHtml.matchAll(/href="([^"]+)"/g)]
    .map(match => match[1])
    .map(href => new URL(href, HOME_URL).toString())
    .filter(url => url.includes(ARTICLE_SLUG))

  return [...new Set(urls)][0] ?? null
}

function getRicePrefix(groupLabel: string): string {
  const normalized = foldText(groupLabel)
  if (normalized.includes('lua tuoi')) {
    return 'Lua tuoi'
  }

  if (normalized.includes('gao nguyen lieu')) {
    return 'Nguyen lieu'
  }

  return ''
}

function parseRice(html: string, timestamp: string): CrawledPriceItem[] {
  const tables = extractTables(html)
  const table = tables.find(entry => {
    const rows = extractRows(entry)
    return rows[0]?.[0] === 'Loại Hàng' && rows[0]?.includes('Giá Bình Quân')
  })

  if (!table) {
    return []
  }

  const rows = extractRows(table)
  const items: CrawledPriceItem[] = []
  let currentGroup = ''

  for (const row of rows.slice(1)) {
    if (row.length === 1) {
      currentGroup = row[0] ?? ''
      continue
    }

    const name = row[0] ?? ''
    const price = parseNumber(row[2] ?? '')
    const change = parseSignedChange(row[3] ?? '0')
    if (!name || !Number.isFinite(price) || price <= 0) {
      continue
    }

    const prefix = getRicePrefix(currentGroup)
    const label = prefix ? `${prefix} ${name}` : name
    items.push(createItem('vietfood', 'gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', label, price, change, timestamp))
  }

  return items
}

export async function crawlVietfood(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()

  try {
    const homeHtml = await fetchUtf8(HOME_URL)
    const articleUrl = extractLatestArticleUrl(homeHtml)
    if (!articleUrl) {
      throw new Error('No domestic rice article found on vietfood homepage')
    }

    const articleHtml = await fetchUtf8(articleUrl)
    const items = parseRice(articleHtml, fetchedAt)
    return finalizeSourceBatch(
      'vietfood',
      'vietfood.org.vn - Lua gao noi dia',
      HOME_URL,
      fetchedAt,
      ['gao-noi-dia'],
      items,
      articleUrl,
    )
  } catch (error) {
    return failedSource('vietfood', 'vietfood.org.vn - Lua gao noi dia', HOME_URL, fetchedAt, ['gao-noi-dia'], error)
  }
}
