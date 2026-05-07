import { PDFParse } from 'pdf-parse'
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
import { VN_COMMODITY_META } from '../marketDataMappings.js'

const CATEGORY_URL = 'https://sct.dongnai.gov.vn/vi/news/Gia-ca-thi-truong/'
const FALLBACK_ARTICLE_URL =
  'https://sct.dongnai.gov.vn/vi/news/Gia-ca-thi-truong/gia-ngay-05-02-2024-26-12-am-lich-cua-mot-so-mat-hang-thiet-yeu-tren-dia-ban-tinh-dong-nai-6224.html'
const FALLBACK_PDF_URL = 'https://sct.dongnai.gov.vn/uploads/sct/news/2024/02/8-2-2024-baogia-sang29alss.pdf.pdf'
const MARKET_NAME = 'Chợ đầu mối Dầu Giây'

const COMMODITY_SLUG_BY_LABEL: Record<string, string> = {
  'cu toi': 'toi',
  toi: 'toi',
}

export type CrawlDongnaiDauGiayOptions = {
  articleUrl?: string | null
  pdfUrl?: string | null
}

function getArticleUrlOverride() {
  return process.env.DONGNAI_SCT_ARTICLE_URL?.trim() || null
}

function getPdfUrlOverride() {
  return process.env.DONGNAI_SCT_PDF_URL?.trim() || null
}

function buildWholesaleItem(
  commodity: string,
  rawCommodity: string,
  articleTitle: string,
  timestamp: string,
  currentPrice: number,
  previousPrice: number | null,
) {
  const commodityMeta = VN_COMMODITY_META[commodity]
  if (!commodityMeta) {
    return null
  }

  const change = previousPrice !== null ? currentPrice - previousPrice : 0
  const item = createItem(
    'dongnai_sct_daugiay',
    commodity,
    commodityMeta.commodityName,
    commodityMeta.category,
    'Dong Nai',
    currentPrice,
    change,
    timestamp,
    previousPrice,
  )

  item.priceType = 'wholesale'
  item.marketName = MARKET_NAME
  item.articleTitle = articleTitle
  item.dedupeKey = `dongnai_sct_daugiay:${MARKET_NAME}:${commodity}:${foldText(rawCommodity)}:${timestamp.slice(0, 10)}`
  item.extra = {
    rawCommodity,
    marketName: MARKET_NAME,
  }
  return item
}

function parseDmyToIso(value: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) {
    return null
  }

  const [, day, month, year] = match
  return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T07:00:00+07:00`).toISOString()
}

function parseReportTimestamp(text: string, fallbackTimestamp: string) {
  const matches = [...text.matchAll(/ngày\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi)]
  const latest = matches.at(-1)?.[1]
  return (latest && parseDmyToIso(latest)) ?? fallbackTimestamp
}

function parseNarrativeItems(text: string, articleTitle: string, fallbackTimestamp: string) {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  const clauseMatch = normalizedText.match(/Dầu Giây:\s*([^.]*)\./i)
  if (!clauseMatch) {
    return []
  }

  const timestamp = parseReportTimestamp(normalizedText, fallbackTimestamp)
  const items: CrawledPriceItem[] = []
  const entryPattern =
    /([A-Za-zÀ-ỹ\s]+?)\s+(tăng|giảm)\s+(\d{1,3}(?:\.\d{3})*)\s+đồng\/kg\s+\(từ\s+(\d{1,3}(?:\.\d{3})*)\s+(?:lên|xuống)\s+(\d{1,3}(?:\.\d{3})*)\)/gi

  for (const match of clauseMatch[1].matchAll(entryPattern)) {
    const rawCommodity = match[1].replace(/\s+/g, ' ').trim()
    const commodity = COMMODITY_SLUG_BY_LABEL[foldText(rawCommodity)]
    if (!commodity) {
      continue
    }

    const previousPrice = parseNumber(match[4])
    const currentPrice = parseNumber(match[5])
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      continue
    }

    const item = buildWholesaleItem(commodity, rawCommodity, articleTitle, timestamp, currentPrice, previousPrice)
    if (item) {
      items.push(item)
    }
  }

  return items
}

function parseHtmlTableItems(html: string, articleTitle: string, fallbackTimestamp: string) {
  const tables = extractTables(html)
  const items: CrawledPriceItem[] = []

  for (const table of tables) {
    const rows = extractRows(table)
    if (rows.length < 3) {
      continue
    }

    const headers = rows.slice(0, 2)
    const flattenedHeader = foldText(headers.flat().join(' '))
    if (!flattenedHeader.includes('dau giay') && !flattenedHeader.includes('thong nhat')) {
      continue
    }

    const timestamp = parseReportTimestamp(rows.flat().join(' '), fallbackTimestamp)
    const priceColumnIndex = 3
    const deltaColumnIndex = 4
    for (const row of rows.slice(2)) {
      const rawCommodity = row[1] ?? ''
      if (!rawCommodity) {
        continue
      }

      const commodity = COMMODITY_SLUG_BY_LABEL[foldText(rawCommodity)]
      if (!commodity) {
        continue
      }

      const unitText = row[2] ?? ''
      const unitMultiplier = foldText(unitText).includes('1.000') ? 1_000 : 1
      const currentPrice = parseNumber(row[priceColumnIndex] ?? '') * unitMultiplier
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        continue
      }

      const deltaValue = parseSignedChange(row[deltaColumnIndex] ?? '')
      const previousPrice = deltaValue !== null ? currentPrice - deltaValue * unitMultiplier : null

      const item = buildWholesaleItem(commodity, rawCommodity, articleTitle, timestamp, currentPrice, previousPrice)
      if (item) {
        items.push(item)
      }
    }
  }

  return items
}

function extractTitle(html: string) {
  const match = html.match(/<title>(.*?)<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : 'Báo giá mặt hàng thiết yếu Đồng Nai'
}

async function fetchPdfText(url: string) {
  const parser = new PDFParse({ url })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

async function resolveLatestArticleUrl() {
  const html = await fetchUtf8(CATEGORY_URL)
  const matches = [...html.matchAll(/href="([^"]+gia-ngay-[^"]+thiet-yeu[^"]+\.html)"/gi)]
    .map(match => new URL(match[1], CATEGORY_URL).toString())

  return matches[0] ?? FALLBACK_ARTICLE_URL
}

async function resolvePdfUrl(articleHtml: string, explicitPdfUrl: string | null) {
  if (explicitPdfUrl) {
    return explicitPdfUrl
  }

  const matches = [...articleHtml.matchAll(/href="([^"]+\.pdf(?:\.pdf)?)"/gi)]
    .map(match => new URL(match[1], CATEGORY_URL).toString())

  return matches[0] ?? FALLBACK_PDF_URL
}

export async function crawlDongnaiDauGiay(options: CrawlDongnaiDauGiayOptions = {}): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()
  const articleUrl = options.articleUrl ?? getArticleUrlOverride()
  const pdfUrlOverride = options.pdfUrl ?? getPdfUrlOverride()

  try {
    const resolvedArticleUrl = articleUrl || (await resolveLatestArticleUrl())
    const articleHtml = await fetchUtf8(resolvedArticleUrl)
    const articleTitle = extractTitle(articleHtml)
    const htmlItems = parseHtmlTableItems(articleHtml, articleTitle, fetchedAt)
    const htmlNarrativeItems = htmlItems.length > 0 ? htmlItems : parseNarrativeItems(articleHtml, articleTitle, fetchedAt)

    if (htmlNarrativeItems.length > 0) {
      return finalizeSourceBatch(
        'dongnai_sct_daugiay',
        'sct.dongnai.gov.vn - Chợ đầu mối Dầu Giây',
        CATEGORY_URL,
        fetchedAt,
        [...new Set(htmlNarrativeItems.map(item => `${item.marketName}:${item.commodity}`))],
        htmlNarrativeItems,
        resolvedArticleUrl,
        {
          parser: htmlItems.length > 0 ? 'html_table' : 'html_narrative',
        },
      )
    }

    const resolvedPdfUrl = await resolvePdfUrl(articleHtml, pdfUrlOverride)
    const pdfText = await fetchPdfText(resolvedPdfUrl)
    const pdfItems = parseNarrativeItems(pdfText, articleTitle, fetchedAt)

    return finalizeSourceBatch(
      'dongnai_sct_daugiay',
      'sct.dongnai.gov.vn - Chợ đầu mối Dầu Giây',
      CATEGORY_URL,
      fetchedAt,
      [...new Set(pdfItems.map(item => `${item.marketName}:${item.commodity}`))],
      pdfItems,
      resolvedArticleUrl,
      {
        parser: 'pdf_narrative',
        pdfUrl: resolvedPdfUrl,
      },
    )
  } catch (error) {
    return failedSource(
      'dongnai_sct_daugiay',
      'sct.dongnai.gov.vn - Chợ đầu mối Dầu Giây',
      CATEGORY_URL,
      fetchedAt,
      ['dau-giay'],
      error,
    )
  }
}
