import { XMLParser } from 'fast-xml-parser'
import { classifyVietfoodArticle } from '../news/articleClassification.js'
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
const FEED_URL = 'https://vietfood.org.vn/feed/'
const ARTICLE_SLUG = 'gia-lua-gao-noi-dia-ngay-'
const feedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
})

type VietfoodFeedItem = {
  title: string | null
  link: string
  category: string | null
  publishedAt: string | null
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function extractLatestArticleUrl(homeHtml: string): string | null {
  const urls = [...homeHtml.matchAll(/href="([^"]+)"/g)]
    .map(match => match[1])
    .map(href => new URL(href, HOME_URL).toString())
    .filter(url => url.includes(ARTICLE_SLUG))

  return [...new Set(urls)][0] ?? null
}

function parseFeedItems(feedXml: string): VietfoodFeedItem[] {
  const parsed = feedParser.parse(feedXml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } }
  }

  return toArray(parsed.rss?.channel?.item).flatMap(item => {
    const link = typeof item.link === 'string' ? item.link : null
    if (!link) {
      return []
    }

    const categories = toArray(item.category).filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return [
      {
        title: typeof item.title === 'string' ? item.title : null,
        link: new URL(link, HOME_URL).toString(),
        category: categories[0] ?? null,
        publishedAt: typeof item.pubDate === 'string' ? item.pubDate : null,
      },
    ]
  })
}

function pickLatestDomesticPriceArticle(feedXml: string) {
  return parseFeedItems(feedXml).find(item => {
    const classification = classifyVietfoodArticle({
      title: item.title,
      category: item.category,
      canonicalUrl: item.link,
    })

    return classification.priceDataTarget === 'vn_domestic_rice'
  }) ?? null
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

function parseRice(html: string, timestamp: string, articleTitle: string): CrawledPriceItem[] {
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
    items.push({
      ...createItem('vietfood', 'gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', label, price, change, timestamp),
      priceType: prefix === 'Lua tuoi' ? 'farm_gate' : 'wholesale',
      articleTitle,
    })
  }

  return items
}

export async function crawlVietfood(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()

  try {
    let articleTitle = 'Giá lúa gạo nội địa'
    let articleUrl: string | null = null
    let recordedAt = fetchedAt

    try {
      const feedXml = await fetchUtf8(FEED_URL)
      const latestFeedItem = pickLatestDomesticPriceArticle(feedXml)
      if (latestFeedItem) {
        articleTitle = latestFeedItem.title ?? articleTitle
        articleUrl = latestFeedItem.link
        recordedAt = latestFeedItem.publishedAt ? new Date(latestFeedItem.publishedAt).toISOString() : fetchedAt
      }
    } catch {
      // Fall back to homepage discovery when the RSS feed is unavailable.
    }

    if (!articleUrl) {
      const homeHtml = await fetchUtf8(HOME_URL)
      articleUrl = extractLatestArticleUrl(homeHtml)
    }

    if (!articleUrl) {
      throw new Error('No domestic rice article found on vietfood homepage')
    }

    const articleHtml = await fetchUtf8(articleUrl)
    const items = parseRice(articleHtml, recordedAt, articleTitle)
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
