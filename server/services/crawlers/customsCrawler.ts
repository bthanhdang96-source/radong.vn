import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { access, constants as fsConstants } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { failedSource, finalizeSourceBatch, foldText, roundNumber } from './common.js'
import type { CrawledPriceItem, CrawlerResult } from './types.js'

const CUSTOMS_REPORT_ROOT = 'https://files.customs.gov.vn/CustomsCMS/TONG_CUC'
const CUSTOMS_SITE_URL = 'https://www.customs.gov.vn/'
const VIETCOMBANK_EXCHANGE_URL = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10'
const PDFTOTEXT_FALLBACK_PATH = 'C:\\Users\\84965\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64\\pdftotext.exe'

type CustomsCommodityTarget = {
  slug: string
  commodityName: string
  category: string
  matchers: RegExp[]
}

type CustomsReportInfo = {
  code: string
  title: string
  periodNumber: number
  reportMonth: number
  reportYear: number
}

type CustomsAggregateRow = {
  commoditySlug: string
  commodityName: string
  category: string
  sourceLabel: string
  quantityTon: number
  valueUsd: number
  cumulativeQuantityTon: number | null
  cumulativeValueUsd: number | null
}

type CustomsRowTarget = CustomsCommodityTarget & {
  rowNumber?: number
}

export type CrawlCustomsOptions = {
  reportUrl?: string | null
  maxLookbackDays?: number
  discoveryMode?: 'manual' | 'pattern'
  enabledSlugs?: string[] | null
  parserPreference?: 'auto' | 'pdftotext' | 'js'
}

const CUSTOMS_COMMODITY_TARGETS: CustomsRowTarget[] = [
  {
    slug: 'cashew',
    commodityName: 'Hat dieu',
    category: 'Cay cong nghiep',
    rowNumber: 3,
    matchers: [/^hat dieu$/],
  },
  {
    slug: 'ca-phe-robusta',
    commodityName: 'Ca phe',
    category: 'Cay cong nghiep',
    rowNumber: 4,
    matchers: [/^ca phe$/],
  },
  {
    slug: 'ho-tieu',
    commodityName: 'Ho tieu',
    category: 'Cay cong nghiep',
    rowNumber: 6,
    matchers: [/^hat tieu$/],
  },
  {
    slug: 'rice-5pct',
    commodityName: 'Gao xuat khau',
    category: 'Luong thuc',
    rowNumber: 7,
    matchers: [/^gao$/],
  },
  {
    slug: 'cassava',
    commodityName: 'San xuat khau',
    category: 'Luong thuc',
    rowNumber: 8,
    matchers: [/^san va cac san pham tu san$/, /^san$/],
  },
  {
    slug: 'rubber-rss3',
    commodityName: 'Cao su',
    category: 'Cay cong nghiep',
    rowNumber: 21,
    matchers: [/^cao su$/],
  },
  {
    slug: 'tea-avg',
    commodityName: 'Che',
    category: 'Cay cong nghiep',
    rowNumber: 5,
    matchers: [/^che$/],
  },
]

function getPdftotextBinary() {
  return process.env.PDFTOTEXT_PATH?.trim() || PDFTOTEXT_FALLBACK_PATH
}

function getCustomsReportUrlOverride() {
  return process.env.CUSTOMS_REPORT_URL?.trim() || null
}

function getDiscoveryMode(options: CrawlCustomsOptions) {
  const value = options.discoveryMode ?? process.env.CUSTOMS_REPORT_DISCOVERY_MODE?.trim() ?? 'pattern'
  return value === 'manual' ? 'manual' : 'pattern'
}

function getParserPreference(options: CrawlCustomsOptions) {
  const value = options.parserPreference ?? process.env.CUSTOMS_PDF_PARSER?.trim() ?? 'auto'
  if (value === 'pdftotext' || value === 'js') {
    return value
  }

  return 'auto'
}

function getEnabledSlugs(options: CrawlCustomsOptions) {
  const explicit = options.enabledSlugs?.filter(Boolean)
  if (explicit && explicit.length > 0) {
    return new Set(explicit)
  }

  const value = process.env.CUSTOMS_ENABLED_SLUGS?.trim()
  if (!value) {
    return new Set(CUSTOMS_COMMODITY_TARGETS.map(target => target.slug))
  }

  return new Set(
    value
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean),
  )
}

function normalizeMonthYear(date: Date, monthOffset = 0) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1))
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
  }
}

function buildReportCode(reportYear: number, reportMonth: number, periodNumber: number) {
  return `${reportYear}-T${reportMonth}K${periodNumber}-1X(VN-SB).pdf`
}

function buildCustomsPdfCandidates(now = new Date(), maxLookbackDays = 45) {
  const candidates: string[] = []
  const seen = new Set<string>()

  for (let dayOffset = 0; dayOffset <= maxLookbackDays; dayOffset += 1) {
    const publishDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    publishDate.setUTCDate(publishDate.getUTCDate() - dayOffset)

    const publishYear = publishDate.getUTCFullYear()
    const publishMonth = publishDate.getUTCMonth() + 1
    const publishDay = publishDate.getUTCDate()

    for (const reportOffset of [0, -1]) {
      const reportPeriod = normalizeMonthYear(publishDate, reportOffset)
      for (const periodNumber of [2, 1]) {
        const reportCode = buildReportCode(reportPeriod.year, reportPeriod.month, periodNumber)
        const url = `${CUSTOMS_REPORT_ROOT}/${publishYear}/${publishMonth}/${publishDay}/${encodeURIComponent(reportCode)}`
        if (seen.has(url)) {
          continue
        }

        seen.add(url)
        candidates.push(url)
      }
    }
  }

  return candidates
}

async function fetchUsdExchangeRate() {
  try {
    const response = await fetch(VIETCOMBANK_EXCHANGE_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' },
    })
    if (!response.ok) {
      throw new Error(`Exchange rate request failed with ${response.status}`)
    }

    const xml = await response.text()
    const usdMatch = xml.match(/<Exrate[^>]*CurrencyCode="USD"[^>]*Sell="([^"]+)"/i)
    if (!usdMatch) {
      throw new Error('USD sell rate was not found in Vietcombank XML')
    }

    const parsed = Number(usdMatch[1].replace(/,/g, '').trim())
    if (Number.isFinite(parsed) && parsed > 20_000) {
      return parsed
    }
  } catch (error) {
    console.warn('[Customs Crawler] Falling back to default USD/VND rate:', error)
  }

  return 25_850
}

function isPdfResponse(response: Response, payload: Buffer) {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('pdf') || payload.subarray(0, 4).toString('utf8') === '%PDF'
}

async function downloadCustomsPdf(reportUrl: string) {
  const response = await fetch(reportUrl, {
    headers: {
      accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Customs report request failed with ${response.status}`)
  }

  const payload = Buffer.from(await response.arrayBuffer())
  if (!isPdfResponse(response, payload) || payload.length < 10_000) {
    throw new Error('Customs report response is not a valid PDF payload')
  }

  return payload
}

async function resolveCustomsReportUrl(options: CrawlCustomsOptions = {}) {
  const reportUrlOverride = options.reportUrl ?? getCustomsReportUrlOverride()
  const discoveryMode = getDiscoveryMode(options)

  if (reportUrlOverride) {
    return {
      url: reportUrlOverride,
      discoveryMode: 'manual' as const,
      candidateCount: 1,
    }
  }

  if (discoveryMode === 'manual') {
    throw new Error('CUSTOMS_REPORT_DISCOVERY_MODE=manual requires CUSTOMS_REPORT_URL or --url')
  }

  const candidates = buildCustomsPdfCandidates(new Date(), options.maxLookbackDays ?? 45)
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0',
        },
      })

      if (!response.ok) {
        continue
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
        return {
          url,
          discoveryMode,
          candidateCount: candidates.length,
        }
      }
    } catch {
      continue
    }
  }

  throw new Error(`No customs export PDF was found after probing ${candidates.length} candidate URLs`)
}

async function canUsePdftotext(binaryPath: string) {
  try {
    await access(binaryPath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function extractPdfTextWithPdftotext(buffer: Buffer, binaryPath: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'customs-pdf-'))
  const pdfPath = join(tempDir, 'report.pdf')
  const textPath = join(tempDir, 'report.txt')

  try {
    await writeFile(pdfPath, buffer)

    await new Promise<void>((resolve, reject) => {
      const child = spawn(binaryPath, ['-layout', '-enc', 'UTF-8', pdfPath, textPath], {
        stdio: 'ignore',
      })

      child.on('error', reject)
      child.on('exit', code => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(`pdftotext exited with code ${code ?? 'unknown'}`))
      })
    })

    return await readFile(textPath, 'utf8')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function extractPdfTextWithJs(buffer: Buffer) {
  const module = await import('pdf-parse')
  const parser = new module.PDFParse({ data: buffer })

  try {
    const parsed = await parser.getText()
    if (!parsed.text || parsed.text.trim().length === 0) {
      throw new Error('pdf-parse returned empty text')
    }

    return parsed.text
  } finally {
    await parser.destroy()
  }
}

async function extractPdfText(buffer: Buffer, options: CrawlCustomsOptions = {}) {
  const parserPreference = getParserPreference(options)
  const pdftotextBinary = getPdftotextBinary()
  const pdftotextAvailable = await canUsePdftotext(pdftotextBinary)

  if (parserPreference === 'pdftotext') {
    if (!pdftotextAvailable) {
      throw new Error(`pdftotext binary is not available at ${pdftotextBinary}`)
    }

    return {
      text: await extractPdfTextWithPdftotext(buffer, pdftotextBinary),
      parserBackend: 'pdftotext',
    }
  }

  if (parserPreference === 'js') {
    return {
      text: await extractPdfTextWithJs(buffer),
      parserBackend: 'pdf-parse',
    }
  }

  if (pdftotextAvailable) {
    try {
      return {
        text: await extractPdfTextWithPdftotext(buffer, pdftotextBinary),
        parserBackend: 'pdftotext',
      }
    } catch (error) {
      console.warn('[Customs Crawler] pdftotext failed, falling back to pdf-parse:', error)
    }
  }

  return {
    text: await extractPdfTextWithJs(buffer),
    parserBackend: 'pdf-parse',
  }
}

function parseVietnameseInteger(value: string | null | undefined) {
  if (!value) {
    return 0
  }

  const normalized = value.replace(/[^\d]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseReportInfo(text: string): CustomsReportInfo {
  const periodMatch = text.match(/Kỳ\s+(\d+)\s+tháng\s+(\d+)\s+năm\s+(\d{4})/i)
  if (!periodMatch) {
    throw new Error('Could not determine customs report period from PDF text')
  }

  const periodNumber = Number(periodMatch[1])
  const reportMonth = Number(periodMatch[2])
  const reportYear = Number(periodMatch[3])

  return {
    code: `${reportYear}-t${reportMonth}-k${periodNumber}`,
    title: `Xuat khau hang hoa theo ky ${periodNumber} thang ${reportMonth} nam ${reportYear}`,
    periodNumber,
    reportMonth,
    reportYear,
  }
}

function findCommodityTarget(sourceLabel: string) {
  const folded = foldText(sourceLabel)
  return CUSTOMS_COMMODITY_TARGETS.find(target => target.matchers.some(matcher => matcher.test(folded))) ?? null
}

function findCommodityTargetByRowNumber(rowNumber: number | null | undefined) {
  if (!rowNumber || !Number.isFinite(rowNumber)) {
    return null
  }

  return CUSTOMS_COMMODITY_TARGETS.find(target => target.rowNumber === rowNumber) ?? null
}

function parseFlatPdfLine(line: string) {
  const tabTokens = line
    .split(/\t+/)
    .map(entry => entry.trim())
    .filter(Boolean)
  if (
    tabTokens.length >= 7 &&
    /^\d{1,3}(?:\.\d{3})+$/.test(tabTokens[0] ?? '') &&
    /^\d{1,3}(?:\.\d{3})+$/.test(tabTokens[1] ?? '') &&
    /^\d{1,3}(?:\.\d{3})+$/.test(tabTokens[2] ?? '') &&
    /^\d+$/.test(tabTokens[4] ?? '') &&
    /^\d{1,3}(?:\.\d{3})+$/.test(tabTokens[6] ?? '')
  ) {
    return {
      cumulativeValueUsd: parseVietnameseInteger(tabTokens[0]),
      cumulativeQuantityTon: parseVietnameseInteger(tabTokens[1]),
      currentValueUsd: parseVietnameseInteger(tabTokens[2]),
      unit: 'tan',
      rowNumber: Number(tabTokens[4]),
      sourceLabel: tabTokens[5],
      currentQuantityTon: parseVietnameseInteger(tabTokens[6]),
    }
  }

  const match = line.match(
    /^(\d{1,3}(?:\.\d{3})+)\s+(\d{1,3}(?:\.\d{3})+)\s+(\d{1,3}(?:\.\d{3})+)\s+(Tấn|USD)\s+(\d+)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})+)$/i,
  )
  if (!match) {
    return null
  }

  return {
    cumulativeValueUsd: parseVietnameseInteger(match[1]),
    cumulativeQuantityTon: parseVietnameseInteger(match[2]),
    currentValueUsd: parseVietnameseInteger(match[3]),
    unit: foldText(match[4]),
    rowNumber: Number(match[5]),
    sourceLabel: match[6].trim(),
    currentQuantityTon: parseVietnameseInteger(match[7]),
  }
}

export function parseCustomsPdfText(text: string) {
  const report = parseReportInfo(text)
  const rows: CustomsAggregateRow[] = []
  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!/^\d+\s+/.test(line) || line.startsWith('-')) {
      continue
    }

    const flatLine = parseFlatPdfLine(line)
    if (flatLine) {
      const flatTarget = findCommodityTarget(flatLine.sourceLabel) ?? findCommodityTargetByRowNumber(flatLine.rowNumber)
      if (flatTarget && flatLine.unit === 'tan' && flatLine.currentQuantityTon > 0 && flatLine.currentValueUsd > 0) {
        rows.push({
          commoditySlug: flatTarget.slug,
          commodityName: flatTarget.commodityName,
          category: flatTarget.category,
          sourceLabel: flatLine.sourceLabel,
          quantityTon: flatLine.currentQuantityTon,
          valueUsd: flatLine.currentValueUsd,
          cumulativeQuantityTon: flatLine.cumulativeQuantityTon || null,
          cumulativeValueUsd: flatLine.cumulativeValueUsd || null,
        })
        continue
      }
    }

    const columns = line.split(/\s{2,}/).map(entry => entry.trim()).filter(Boolean)
    if (columns.length < 5) {
      continue
    }

    const unitIndex = columns.findIndex(column => {
      const normalized = foldText(column)
      return normalized === 'tan' || normalized === 'usd'
    })
    if (unitIndex < 1) {
      continue
    }

    let sourceLabel = columns.slice(1, unitIndex).join(' ')
    if (!sourceLabel && unitIndex === 1) {
      const fallbackMatch = columns[0]?.match(/^\d+\s+(.+)$/)
      sourceLabel = fallbackMatch?.[1]?.trim() ?? ''
    }

    const unit = foldText(columns[unitIndex] ?? '')
    const target = findCommodityTarget(sourceLabel)
    if (!target || unit !== 'tan') {
      continue
    }

    const currentQuantity = parseVietnameseInteger(columns[unitIndex + 1])
    const currentValueUsd = parseVietnameseInteger(columns[unitIndex + 2])
    const cumulativeQuantity = parseVietnameseInteger(columns[unitIndex + 3])
    const cumulativeValueUsd = parseVietnameseInteger(columns[unitIndex + 4])

    if (currentQuantity <= 0 || currentValueUsd <= 0) {
      continue
    }

    rows.push({
      commoditySlug: target.slug,
      commodityName: target.commodityName,
      category: target.category,
      sourceLabel,
      quantityTon: currentQuantity,
      valueUsd: currentValueUsd,
      cumulativeQuantityTon: cumulativeQuantity > 0 ? cumulativeQuantity : null,
      cumulativeValueUsd: cumulativeValueUsd > 0 ? cumulativeValueUsd : null,
    })
  }

  return {
    report,
    rows,
  }
}

function buildCustomsItems(
  rows: CustomsAggregateRow[],
  report: CustomsReportInfo,
  reportUrl: string,
  exchangeRate: number,
  timestamp: string,
) {
  return rows.map<CrawledPriceItem>(row => {
    const priceUsdPerTon = row.valueUsd / row.quantityTon
    const priceUsdPerKg = priceUsdPerTon / 1000
    const priceVndPerKg = priceUsdPerKg * exchangeRate
    const dedupeKey = `customs:${report.code}:${row.commoditySlug}`

    return {
      commodity: row.commoditySlug,
      commodityName: row.commodityName,
      category: row.category,
      region: 'Viet Nam',
      price: roundNumber(priceVndPerKg),
      unit: 'VND/kg',
      change: null,
      changePct: null,
      timestamp,
      source: 'customs',
      priceType: 'export',
      marketName: 'Xuat khau tong hop',
      articleTitle: report.title,
      countryCode: 'VNM',
      exchangeRate: roundNumber(exchangeRate),
      priceUsd: Number(priceUsdPerKg.toFixed(4)),
      dedupeKey,
      previousPrice: null,
      extra: {
        reportCode: report.code,
        reportUrl,
        sourceFormat: 'pdf_aggregate',
        coverageMode: 'aggregate_pdf',
        sourceLabel: row.sourceLabel,
        quantityTon: row.quantityTon,
        valueUsd: row.valueUsd,
        cumulativeQuantityTon: row.cumulativeQuantityTon,
        cumulativeValueUsd: row.cumulativeValueUsd,
        priceUsdPerTon: Number(priceUsdPerTon.toFixed(2)),
        priceUsdPerKg: Number(priceUsdPerKg.toFixed(4)),
      },
    }
  })
}

export async function crawlCustoms(options: CrawlCustomsOptions = {}): Promise<CrawlerResult> {
  const fetchedAt = new Date().toISOString()
  const enabledSlugs = getEnabledSlugs(options)
  const discoveryMode = getDiscoveryMode(options)
  const parserPreference = getParserPreference(options)
  const reportUrlOverride = options.reportUrl ?? getCustomsReportUrlOverride()

  try {
    const resolved = await resolveCustomsReportUrl(options)
    const [exchangeRate, pdfBuffer] = await Promise.all([
      fetchUsdExchangeRate(),
      downloadCustomsPdf(resolved.url),
    ])
    const extracted = await extractPdfText(pdfBuffer, options)
    const pdfText = extracted.text
    const parsed = parseCustomsPdfText(pdfText)
    if (parsed.rows.length === 0 && extracted.parserBackend === 'pdf-parse') {
      throw new Error('pdf-parse extracted text but no aggregate rows were recognized; prefer pdftotext for customs PDF layout')
    }

    const filteredRows = parsed.rows.filter(row => enabledSlugs.has(row.commoditySlug))
    const items = buildCustomsItems(filteredRows, parsed.report, resolved.url, exchangeRate, fetchedAt)
    const metadata = {
      reportCode: parsed.report.code,
      reportTitle: parsed.report.title,
      reportUrl: resolved.url,
      reportUrlOverride,
      discoveryMode: resolved.discoveryMode,
      configuredDiscoveryMode: discoveryMode,
      parserBackend: extracted.parserBackend,
      parserPreference,
      enabledSlugs: [...enabledSlugs],
      candidateCount: resolved.candidateCount,
      coverageMode: 'aggregate_pdf',
      parsedRowCount: parsed.rows.length,
      keptRowCount: filteredRows.length,
    }

    return finalizeSourceBatch(
      'customs',
      'customs.gov.vn - Bao cao xuat khau',
      CUSTOMS_SITE_URL,
      fetchedAt,
      [...new Set(items.map(item => item.commodity))],
      items,
      resolved.url,
      metadata,
    )
  } catch (error) {
    return failedSource(
      'customs',
      'customs.gov.vn - Bao cao xuat khau',
      CUSTOMS_SITE_URL,
      fetchedAt,
      ['ca-phe-robusta', 'cashew', 'ho-tieu', 'rice-5pct', 'rubber-rss3', 'cassava', 'tea-avg'],
      error,
      reportUrlOverride ?? undefined,
      {
        reportUrlOverride,
        discoveryMode,
        parserPreference,
        enabledSlugs: [...enabledSlugs],
        coverageMode: 'aggregate_pdf',
      },
    )
  }
}
