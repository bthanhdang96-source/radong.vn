import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import { chromium, type Page } from 'playwright'
import type { ExportRegistryCrawlResult, ExportRegistryEntry, ExportRegistryPeriod, ExportRegistryType } from './types.js'

const SOURCE_BASE_URL = 'https://sansangxuatkhau.ppd.gov.vn'

export const EXPORT_REGISTRY_SOURCES: Record<ExportRegistryType, { label: string; url: string }> = {
  production_area: {
    label: 'Thông tin vùng trồng',
    url: `${SOURCE_BASE_URL}/thong-tin-vung-trong`,
  },
  packing_facility: {
    label: 'Thông tin cơ sở đóng gói',
    url: `${SOURCE_BASE_URL}/thong-tin-co-so-dong-goi`,
  },
}

type CrawlOptions = {
  registryTypes?: ExportRegistryType[]
  maxPagesPerType?: number
  timeoutMs?: number
}

function cleanText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function foldText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function cleanAddressLabel(value: string) {
  return cleanText(value.replace(/^dia chi\s*:/i, '').replace(/^địa chỉ\s*:/i, ''))
}

function parseViDate(value: string | null) {
  if (!value) {
    return null
  }

  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) {
    return null
  }

  const [, day, month, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function extractAddressParts(address: string | null) {
  if (!address) {
    return { province: null, district: null, commune: null }
  }

  const parts = address.split(',').map(part => cleanText(part)).filter(Boolean)
  const findByPrefixes = (prefixes: string[]) => {
    const foldedPrefixes = prefixes.map(prefix => foldText(prefix))
    return parts.find(part => foldedPrefixes.some(prefix => foldText(part).startsWith(prefix))) ?? null
  }

  return {
    province: findByPrefixes(['Tỉnh', 'Thành phố', 'TP.']),
    district: findByPrefixes(['Huyện', 'Quận', 'Thị xã', 'Thành phố', 'TP.']),
    commune: findByPrefixes(['Xã', 'Phường', 'Thị trấn']),
  }
}

function extractRegistryCode(name: string) {
  const match = name.match(/m[ãa]\s*s[ốo]\s*([^)]+)/i)
  return match ? cleanText(match[1]) : null
}

function parseApprovalPeriods(cellHtml: string): ExportRegistryPeriod[] {
  const $ = cheerio.load(cellHtml)
  const periods = new Map<number, ExportRegistryPeriod>()

  $('p').each((_index, element) => {
    const text = cleanText($(element).text())
    const match = text.match(/^(Bắt đầu|Kết thúc)\s*\(đợt\s*(\d+)\)\s*:\s*(.+)$/i)
    if (!match) {
      return
    }

    const [, label, roundValue, rawDate] = match
    const round = Number(roundValue)
    if (!Number.isFinite(round)) {
      return
    }

    const current = periods.get(round) ?? {
      round,
      startsOn: null,
      endsOn: null,
      startRaw: null,
      endRaw: null,
    }

    if (foldText(label).includes('bat dau')) {
      current.startRaw = cleanText(rawDate)
      current.startsOn = parseViDate(rawDate)
    } else {
      current.endRaw = cleanText(rawDate)
      current.endsOn = parseViDate(rawDate)
    }

    periods.set(round, current)
  })

  return [...periods.values()].sort((left, right) => left.round - right.round)
}

function buildContentHash(entry: Omit<ExportRegistryEntry, 'contentHash'>) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        registryType: entry.registryType,
        name: foldText(entry.name),
        address: foldText(entry.address ?? ''),
        phone: foldText(entry.phone ?? ''),
        market: foldText(entry.market ?? ''),
        approvalPeriods: entry.approvalPeriods,
      }),
    )
    .digest('hex')
}

export function parseExportRegistryRows(
  html: string,
  registryType: ExportRegistryType,
  sourceUrl: string,
  sourcePage: number,
  crawledAt: string,
): ExportRegistryEntry[] {
  const $ = cheerio.load(html)
  const rows: ExportRegistryEntry[] = []

  $('table.rgMasterTable tbody tr.rgRow, table.rgMasterTable tbody tr.rgAltRow').each((index, row) => {
    const cells = $(row).children('td').toArray()
    if (cells.length < 4) {
      return
    }

    const sourceRowNumber = Number(cleanText($(cells[0]).text()))
    const nameCell = $(cells[1])
    const name = cleanText(nameCell.find('p strong').first().text()) || cleanText(nameCell.text()).split(' Địa chỉ:')[0]
    if (!name) {
      return
    }

    const addressText = nameCell
      .find('p')
      .toArray()
      .map(element => cleanText($(element).text()))
      .find(text => foldText(text).startsWith('dia chi:'))
    const address = addressText ? cleanAddressLabel(addressText) : null
    const addressParts = extractAddressParts(address)
    const phone = cleanText($(cells[2]).text()) || null
    const market = cleanText($(cells[3]).text()) || null
    const approvalPeriods = registryType === 'production_area' && cells[4] ? parseApprovalPeriods($.html(cells[4]) ?? '') : []
    const rawPayload = {
      cells: cells.map(cell => cleanText($(cell).text())),
      registryCode: extractRegistryCode(name),
    }

    const withoutHash: Omit<ExportRegistryEntry, 'contentHash'> = {
      registryType,
      sourceUrl,
      sourcePage,
      sourcePosition: index + 1,
      sourceRowNumber: Number.isFinite(sourceRowNumber) ? sourceRowNumber : null,
      name,
      address,
      phone,
      market,
      ...addressParts,
      approvalPeriods,
      rawPayload,
      crawledAt,
    }

    rows.push({
      ...withoutHash,
      contentHash: buildContentHash(withoutHash),
    })
  })

  return rows
}

async function getCurrentPageNumber(page: Page) {
  const text = await page.locator('.rgCurrentPage').first().textContent().catch(() => null)
  const pageNumber = Number(cleanText(text))
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1
}

async function clickNextPage(page: Page, timeoutMs: number) {
  const nextLink = page.locator('a[title="Next Page"]').first()
  if ((await nextLink.count()) === 0) {
    return false
  }

  const previousPage = await getCurrentPageNumber(page)
  await page.waitForFunction(() => typeof (window as unknown as { __doPostBack?: unknown }).__doPostBack === 'function', {
    timeout: timeoutMs,
  })
  await nextLink.click()
  await page
    .waitForFunction(
      current => document.querySelector('.rgCurrentPage')?.textContent?.trim() !== String(current),
      previousPage,
      { timeout: timeoutMs },
    )
    .catch(() => null)

  const nextPage = await getCurrentPageNumber(page)
  return nextPage !== previousPage
}

async function crawlRegistryType(
  page: Page,
  registryType: ExportRegistryType,
  options: Required<Pick<CrawlOptions, 'timeoutMs' | 'maxPagesPerType'>>,
) {
  const source = EXPORT_REGISTRY_SOURCES[registryType]
  const crawledAt = new Date().toISOString()
  const items: ExportRegistryEntry[] = []
  const errors: string[] = []
  let pageCount = 0

  await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs })
  await page.waitForLoadState('networkidle', { timeout: options.timeoutMs }).catch(() => null)
  await page.waitForSelector('table.rgMasterTable tbody tr.rgRow, table.rgMasterTable tbody tr.rgAltRow', {
    timeout: options.timeoutMs,
  })

  while (true) {
    const sourcePage = await getCurrentPageNumber(page)
    pageCount = Math.max(pageCount, sourcePage)
    const html = await page.content()
    items.push(...parseExportRegistryRows(html, registryType, source.url, sourcePage, crawledAt))

    if (sourcePage >= options.maxPagesPerType) {
      break
    }

    const moved = await clickNextPage(page, options.timeoutMs)
    if (!moved) {
      break
    }
  }

  return {
    registryType,
    sourceUrl: source.url,
    crawledAt,
    pageCount,
    items,
    errors,
  } satisfies ExportRegistryCrawlResult
}

export async function crawlExportRegistry(options: CrawlOptions = {}) {
  const registryTypes = options.registryTypes ?? ['production_area', 'packing_facility']
  const timeoutMs = options.timeoutMs ?? 60000
  const maxPagesPerType = options.maxPagesPerType ?? Number.POSITIVE_INFINITY
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    const results: ExportRegistryCrawlResult[] = []

    for (const registryType of registryTypes) {
      results.push(await crawlRegistryType(page, registryType, { timeoutMs, maxPagesPerType }))
    }

    return results
  } finally {
    await browser.close()
  }
}
