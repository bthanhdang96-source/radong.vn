import * as cheerio from 'cheerio'
import {
  createItem,
  extractRows,
  extractTables,
  failedSource,
  finalizeSourceBatch,
  foldText,
  HTML_HEADERS,
  parseNumber,
} from './common.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'
import { VN_COMMODITY_META } from '../marketDataMappings.js'

const POSTS_URL =
  'https://khuyennongtphcm.vn/wp-json/wp/v2/posts?categories=34&per_page=12&_fields=id,date_gmt,link,title'

const MARKET_NAMES = {
  hocMon: 'Chợ đầu mối Hóc Môn',
  thuDuc: 'Chợ đầu mối Thủ Đức',
  binhDien: 'Chợ đầu mối Bình Điền',
} as const

const COMMODITY_SLUG_BY_LABEL: Record<string, string> = {
  'cai xanh': 'cai-xanh',
  'rau muong nuoc': 'rau-muong',
  'rau muong hat': 'rau-muong',
  'bi do': 'bi-do',
  'cam sanh': 'cam-sanh',
  'buoi nam roi': 'buoi-nam-roi',
  'buoi nam roi da xanh': 'buoi-nam-roi',
  'xoai cat hoa loc': 'xoai',
  'xoai cat chu': 'xoai',
  xoai: 'xoai',
  'cu toi': 'toi',
  toi: 'toi',
  'tom su': 'shrimp',
  'tom the': 'shrimp',
}

type WpPostSummary = {
  id: number
  date_gmt: string
  link: string
  title: { rendered: string }
}

type WpPostDetail = WpPostSummary & {
  content: { rendered: string }
}

function decodeHtmlText(value: string) {
  const $ = cheerio.load(`<div>${value}</div>`)
  return $('div').text().replace(/\s+/g, ' ').trim()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...HTML_HEADERS,
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return (await response.json()) as T
}

function isTargetTitle(title: string) {
  const normalized = foldText(title)
  return normalized.startsWith('gia ca nong san tai thanh pho ho chi minh') || normalized.startsWith('gia ca nong san tai tp. ho chi minh')
}

function parseMarketName(heading: string) {
  const normalized = foldText(heading)
  if (normalized.includes('hoc mon')) {
    return MARKET_NAMES.hocMon
  }

  if (normalized.includes('thu duc')) {
    return MARKET_NAMES.thuDuc
  }

  if (normalized.includes('binh dien')) {
    return MARKET_NAMES.binhDien
  }

  return null
}

function parseDmyToIso(value: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) {
    return null
  }

  const [, day, month, year] = match
  return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T07:00:00+07:00`).toISOString()
}

function findReportTimestamp(heading: string, rows: string[][], fallbackTimestamp: string) {
  const candidates = [
    heading,
    ...rows.slice(0, 3).flat(),
  ]

  const latestDate = candidates
    .flatMap(value => [...value.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})/g)].map(match => match[1]))
    .at(-1)

  return (latestDate && parseDmyToIso(latestDate)) ?? fallbackTimestamp
}

function findCurrentAndPreviousPrices(row: string[]) {
  const numericTail = row
    .slice(3)
    .map(value => parseNumber(value))
    .filter(value => Number.isFinite(value) && value >= 0)

  if (numericTail.length === 0) {
    return null
  }

  const current = numericTail.at(-1) ?? 0
  const previous = numericTail.length >= 2 ? (numericTail.at(-2) ?? null) : null
  return { current, previous }
}

function toCommoditySlug(rawCommodity: string) {
  const normalized = foldText(rawCommodity)
  return COMMODITY_SLUG_BY_LABEL[normalized] ?? null
}

function buildWholesaleItem(
  sourceCommodity: string,
  rawCommodity: string,
  marketName: string,
  articleTitle: string,
  timestamp: string,
  currentPrice: number,
  previousPrice: number | null,
) {
  const commodityMeta = VN_COMMODITY_META[sourceCommodity]
  if (!commodityMeta) {
    return null
  }

  const change = previousPrice !== null ? currentPrice - previousPrice : 0
  const item = createItem(
    'khuyennong_tphcm',
    sourceCommodity,
    commodityMeta.commodityName,
    commodityMeta.category,
    'TP. Ho Chi Minh',
    currentPrice,
    change,
    timestamp,
    previousPrice,
  )

  item.priceType = 'wholesale'
  item.marketName = marketName
  item.articleTitle = articleTitle
  item.dedupeKey = `khuyennong_tphcm:${marketName}:${sourceCommodity}:${foldText(rawCommodity)}:${timestamp.slice(0, 10)}`
  item.extra = {
    rawCommodity,
    marketName,
  }
  return item
}

function parseMarketTables(articleHtml: string, articleTitle: string, fallbackTimestamp: string): CrawledPriceItem[] {
  const $ = cheerio.load(`<body>${articleHtml}</body>`)
  const items: CrawledPriceItem[] = []
  const tables = extractTables(articleHtml)

  tables.forEach((tableHtml, index) => {
    const rows = extractRows(tableHtml)
    if (rows.length < 2) {
      return
    }

    const heading = $('table')
      .eq(index)
      .prevAll()
      .map((_siblingIndex, sibling) => $(sibling).text().replace(/\s+/g, ' ').trim())
      .get()
      .find(Boolean)

    if (!heading) {
      return
    }

    const marketName = parseMarketName(heading)
    if (!marketName) {
      return
    }

    const timestamp = findReportTimestamp(heading, rows, fallbackTimestamp)

    for (const row of rows.slice(1)) {
      const rawCommodity = row[1] ?? ''
      const unit = row[2] ?? ''
      if (!rawCommodity || foldText(unit) !== 'kg') {
        continue
      }

      const pricePair = findCurrentAndPreviousPrices(row)
      if (!pricePair || !Number.isFinite(pricePair.current) || pricePair.current <= 0) {
        continue
      }

      const commodity = toCommoditySlug(rawCommodity)
      if (!commodity) {
        continue
      }

      const item = buildWholesaleItem(
        commodity,
        rawCommodity,
        marketName,
        articleTitle,
        timestamp,
        pricePair.current,
        pricePair.previous,
      )

      if (item) {
        items.push(item)
      }
    }
  })

  return items
}

export async function crawlKhuyennongTphcm(): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()

  try {
    const posts = await fetchJson<WpPostSummary[]>(POSTS_URL)
    const latestPost = posts
      .filter(post => isTargetTitle(decodeHtmlText(post.title.rendered)))
      .sort((left, right) => right.date_gmt.localeCompare(left.date_gmt))[0]

    if (!latestPost) {
      throw new Error('No matching wholesale market bulletin found in WordPress feed')
    }

    const detailUrl = `https://khuyennongtphcm.vn/wp-json/wp/v2/posts/${latestPost.id}`
    const detail = await fetchJson<WpPostDetail>(detailUrl)
    const articleTitle = decodeHtmlText(detail.title.rendered)
    const fallbackTimestamp = `${detail.date_gmt}Z`
    const items = parseMarketTables(detail.content.rendered, articleTitle, fallbackTimestamp)
    const coverage = [...new Set(items.map(item => `${item.marketName}:${item.commodity}`))]

    return finalizeSourceBatch(
      'khuyennong_tphcm',
      'khuyennongtphcm.vn - Chợ đầu mối TP.HCM',
      POSTS_URL,
      fetchedAt,
      coverage.length > 0 ? coverage : ['hoc-mon', 'thu-duc', 'binh-dien'],
      items,
      detail.link,
      {
        articleId: detail.id,
        articleDateGmt: detail.date_gmt,
      },
    )
  } catch (error) {
    return failedSource(
      'khuyennong_tphcm',
      'khuyennongtphcm.vn - Chợ đầu mối TP.HCM',
      POSTS_URL,
      fetchedAt,
      ['hoc-mon', 'thu-duc', 'binh-dien'],
      error,
    )
  }
}
