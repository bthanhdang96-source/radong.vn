import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { crawlBanggianongsan } from './crawlers/banggianongsanCrawler.js'
import { crawlCongthuong } from './crawlers/congthuongCrawler.js'
import { crawlNongnghiep } from './crawlers/nongnghiepCrawler.js'
import { crawlVietnambiz } from './crawlers/vietnambizCrawler.js'
import type { CrawledPriceItem, CrawlerResult, SourceId, SourceSnapshot } from './crawlers/types.js'
import { foldText } from './crawlers/common.js'
import { getProvinceCodeFromRegion, SOURCE_BASE_CONFIDENCE } from './marketDataMappings.js'
import { getSupabaseAdminClient } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export type DomesticCoffeePriceFlag =
  | 'ok'
  | 'missing_domestic_price'
  | 'missing_fx_rate'
  | 'invalid_domestic_price'
  | 'invalid_fx_rate'
  | 'suspicious_price_unit'
  | 'fx_filled_previous_available'

export type FxRateType = 'cash_buy' | 'transfer_buy' | 'sell' | 'central_rate'

export type RawDomesticCoffeePriceRow = {
  dedupe_key: string
  source_name: string
  source_url: string | null
  fetched_at: string
  price_date: string
  commodity_group: 'coffee'
  commodity_slug: 'ca-phe-robusta'
  location_name: string | null
  province: string | null
  province_code: string | null
  district: string | null
  price_type: 'domestic_farmgate_or_local'
  price_raw: string | null
  price_value: number | null
  currency: 'VND'
  unit: 'kg'
  change_raw: string | null
  change_value: number | null
  confidence_score: number | null
  raw_payload: Record<string, unknown>
  notes: string | null
}

export type RawFxUsdVndRow = {
  source_name: string
  source_url: string | null
  fetched_at: string
  rate_date: string
  currency_pair: 'USD/VND'
  rate_type: FxRateType
  rate_value: number
  raw_payload: Record<string, unknown>
  notes: string | null
}

export type DomesticCoffeePriceUsdRow = {
  price_date: string
  commodity_group: 'coffee'
  commodity_slug: 'ca-phe-robusta'
  location_name: string | null
  province: string | null
  province_code: string | null
  district: string | null
  price_type: 'domestic_farmgate_or_local'
  price_vnd_per_kg: number | null
  price_vnd_per_ton: number | null
  fx_source_name: string | null
  fx_rate_type: FxRateType | null
  fx_rate_date: string | null
  usd_vnd_rate: number | null
  domestic_price_usd_per_ton: number | null
  source_name: string
  source_url: string | null
  fetched_at: string
  data_quality_flag: DomesticCoffeePriceFlag
  confidence_score: number
  notes: string
}

export type DomesticCoffeePriceFxQcReport = {
  rawPriceRows: number
  rawFxRows: number
  factRows: number
  flagCounts: Record<DomesticCoffeePriceFlag, number>
  sourceCoverage: Record<string, number>
  latestPriceDate: string | null
  provinceCoverageLatestDate: Array<{ provinceCode: string | null; province: string | null; sourceCount: number }>
  suspiciousFxRows: RawFxUsdVndRow[]
  suspiciousConvertedRows: DomesticCoffeePriceUsdRow[]
  dailyJumpsAbove10Pct: Array<{
    priceDate: string
    provinceCode: string | null
    province: string | null
    sourceName: string
    priceVndPerKg: number
    previousPriceVndPerKg: number
    dailyChangePct: number
  }>
}

export type DomesticCoffeePriceFxTransformResult = {
  rows: DomesticCoffeePriceUsdRow[]
  qc: DomesticCoffeePriceFxQcReport
}

export type DomesticCoffeePriceFxSyncOptions = {
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  sourcePriceRows?: RawDomesticCoffeePriceRow[]
  sourceFxRows?: RawFxUsdVndRow[]
  fetchedAt?: string
}

export type DomesticCoffeePriceFxSyncResult = DomesticCoffeePriceFxTransformResult & {
  rawPriceRows: RawDomesticCoffeePriceRow[]
  rawFxRows: RawFxUsdVndRow[]
  rawPriceRowsPersisted: number
  rawFxRowsPersisted: number
  factRowsPersisted: number
  artifacts: {
    rawPriceCsvPath: string | null
    rawFxCsvPath: string | null
    factCsvPath: string | null
    qcReportPath: string | null
    sourceResearchPath: string | null
    methodologyPath: string | null
  }
}

type SourceCrawler = {
  sourceId: SourceId
  crawl: () => Promise<CrawlerResult>
}

const COMMODITY_SLUG = 'ca-phe-robusta'
const COMMODITY_GROUP = 'coffee'
const PRICE_TYPE = 'domestic_farmgate_or_local'
const TARGET_PROVINCE_CODES = new Set(['DLK', 'LDO', 'GLA', 'DNO'])
const VIETCOMBANK_SOURCE_NAME = 'Vietcombank'
const VIETCOMBANK_FX_URL = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10'
const DEFAULT_FX_RATE_TYPE: FxRateType = 'transfer_buy'
const FX_LOOKBACK_DAYS = 3
const DOMESTIC_PRICE_MIN_VND_PER_KG = 1_000
const DOMESTIC_PRICE_MAX_VND_PER_KG = 300_000
const FX_MIN_USD_VND = 15_000
const FX_MAX_USD_VND = 40_000
const CONVERTED_MIN_USD_PER_TON = 1_000
const CONVERTED_MAX_USD_PER_TON = 10_000

const SOURCE_PRIORITY: Record<string, number> = {
  congthuong: 100,
  nongnghiep: 90,
  vietnambiz: 80,
  banggianongsan: 70,
}

const SOURCE_CRAWLERS: SourceCrawler[] = [
  { sourceId: 'congthuong', crawl: crawlCongthuong },
  { sourceId: 'nongnghiep', crawl: crawlNongnghiep },
  { sourceId: 'vietnambiz', crawl: crawlVietnambiz },
  { sourceId: 'banggianongsan', crawl: crawlBanggianongsan },
]

const OUTPUT_COLUMNS: Array<keyof DomesticCoffeePriceUsdRow> = [
  'price_date',
  'commodity_group',
  'commodity_slug',
  'location_name',
  'province',
  'province_code',
  'district',
  'price_type',
  'price_vnd_per_kg',
  'price_vnd_per_ton',
  'fx_source_name',
  'fx_rate_type',
  'fx_rate_date',
  'usd_vnd_rate',
  'domestic_price_usd_per_ton',
  'source_name',
  'source_url',
  'fetched_at',
  'data_quality_flag',
  'confidence_score',
  'notes',
]

function roundNumber(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10)
  }

  const vietnamDate = new Date(parsed.getTime() + 7 * 60 * 60 * 1000)
  return vietnamDate.toISOString().slice(0, 10)
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function normalizeProvince(region: string) {
  const folded = foldText(region)
  if (folded.includes('dak lak')) {
    return { code: 'DLK', name: 'Dak Lak' }
  }
  if (folded.includes('dak nong')) {
    return { code: 'DNO', name: 'Dak Nong' }
  }
  if (folded.includes('lam dong')) {
    return { code: 'LDO', name: 'Lam Dong' }
  }
  if (folded.includes('gia lai')) {
    return { code: 'GLA', name: 'Gia Lai' }
  }

  const code = getProvinceCodeFromRegion(region)
  return {
    code,
    name: code ? region : null,
  }
}

function buildPriceDedupeKey(input: Pick<RawDomesticCoffeePriceRow, 'source_name' | 'price_date' | 'province_code' | 'district' | 'price_type'>) {
  return [input.source_name, input.price_date, input.province_code ?? 'na', input.district ?? 'na', input.price_type].join('|')
}

function pickSourceSnapshot(sourceId: string, sources: SourceSnapshot[]) {
  return (
    sources.find(source => source.id === sourceId && source.coverage.includes(COMMODITY_SLUG) && source.success) ??
    sources.find(source => source.id === sourceId && source.coverage.includes(COMMODITY_SLUG)) ??
    sources.find(source => source.id === sourceId) ??
    null
  )
}

function itemToRawPriceRow(item: CrawledPriceItem, sourceUrl: string | null, fetchedAt: string): RawDomesticCoffeePriceRow | null {
  if (item.commodity !== COMMODITY_SLUG) {
    return null
  }

  const province = normalizeProvince(item.region)
  if (!province.code || !TARGET_PROVINCE_CODES.has(province.code)) {
    return null
  }

  const priceDate = toIsoDate(item.timestamp || fetchedAt)
  const row: RawDomesticCoffeePriceRow = {
    dedupe_key: '',
    source_name: item.source,
    source_url: sourceUrl,
    fetched_at: fetchedAt,
    price_date: priceDate,
    commodity_group: COMMODITY_GROUP,
    commodity_slug: COMMODITY_SLUG,
    location_name: item.region,
    province: province.name,
    province_code: province.code,
    district: null,
    price_type: PRICE_TYPE,
    price_raw: item.price === null || item.price === undefined ? null : String(item.price),
    price_value: Number.isFinite(item.price) ? item.price : null,
    currency: 'VND',
    unit: 'kg',
    change_raw: item.change === null || item.change === undefined ? null : String(item.change),
    change_value: item.change,
    confidence_score: SOURCE_BASE_CONFIDENCE[item.source] ?? 0.65,
    raw_payload: {
      ...item,
      sourcePriority: SOURCE_PRIORITY[item.source] ?? 50,
      normalizedProvinceCode: province.code,
      sourceUrl,
    },
    notes: 'Domestic coffee price normalized to VND/kg from public Vietnamese price source.',
  }
  row.dedupe_key = buildPriceDedupeKey(row)
  return row
}

export function normalizeCrawledDomesticCoffeePrices(results: CrawlerResult[], fetchedAt = new Date().toISOString()) {
  const rows = new Map<string, RawDomesticCoffeePriceRow>()

  for (const result of results) {
    for (const item of result.items) {
      const source = pickSourceSnapshot(item.source, result.sources)
      const sourceUrl = source?.latestArticleUrl ?? source?.url ?? null
      const row = itemToRawPriceRow(item, sourceUrl, fetchedAt)
      if (!row) {
        continue
      }
      rows.set(row.dedupe_key, row)
    }
  }

  return [...rows.values()].sort((left, right) => {
    const priorityDelta = (SOURCE_PRIORITY[right.source_name] ?? 50) - (SOURCE_PRIORITY[left.source_name] ?? 50)
    if (priorityDelta !== 0) {
      return priorityDelta
    }
    return `${left.price_date}|${left.province_code}`.localeCompare(`${right.price_date}|${right.province_code}`)
  })
}

export async function fetchDomesticCoffeePriceRows(fetchedAt = new Date().toISOString()) {
  const results = await Promise.all(
    SOURCE_CRAWLERS.map(async crawler => {
      try {
        return await crawler.crawl()
      } catch (error) {
        return {
          items: [],
          sources: [
            {
              id: crawler.sourceId,
              label: crawler.sourceId,
              url: '',
              fetchedAt,
              success: false,
              itemCount: 0,
              priority: SOURCE_PRIORITY[crawler.sourceId] ?? 50,
              coverage: [COMMODITY_SLUG],
              error: error instanceof Error ? error.message : String(error),
            },
          ],
        } satisfies CrawlerResult
      }
    }),
  )
  return normalizeCrawledDomesticCoffeePrices(results, fetchedAt)
}

function parseVietcombankDate(value: string | undefined, fallbackDate: string) {
  if (!value) {
    return fallbackDate
  }

  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) {
    return fallbackDate
  }

  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `${match[3]}-${month}-${day}`
}

function parseRateValue(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }
  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parseVietcombankUsdVndXml(xml: string, options: { fetchedAt?: string; sourceUrl?: string } = {}) {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
  })
  const payload = parser.parse(xml) as {
    ExrateList?: {
      DateTime?: string
      Exrate?: Array<Record<string, unknown>> | Record<string, unknown>
    }
  }
  const list = payload.ExrateList
  const rates = Array.isArray(list?.Exrate) ? list.Exrate : list?.Exrate ? [list.Exrate] : []
  const usd = rates.find(rate => String(rate.CurrencyCode ?? '').toUpperCase() === 'USD')
  if (!usd) {
    throw new Error('Vietcombank XML does not contain USD rate')
  }

  const rateDate = parseVietcombankDate(list?.DateTime, toIsoDate(fetchedAt))
  const rawRows: Array<{ rateType: FxRateType; rawValue: unknown }> = [
    { rateType: 'cash_buy', rawValue: usd.Buy },
    { rateType: 'transfer_buy', rawValue: usd.Transfer },
    { rateType: 'sell', rawValue: usd.Sell },
  ]

  return rawRows.flatMap(({ rateType, rawValue }) => {
    const rateValue = parseRateValue(rawValue)
    if (!rateValue) {
      return []
    }

    return [
      {
        source_name: VIETCOMBANK_SOURCE_NAME,
        source_url: options.sourceUrl ?? VIETCOMBANK_FX_URL,
        fetched_at: fetchedAt,
        rate_date: rateDate,
        currency_pair: 'USD/VND',
        rate_type: rateType,
        rate_value: rateValue,
        raw_payload: {
          dateTime: list?.DateTime ?? null,
          usd,
        },
        notes: 'Vietcombank published reference exchange rate; transfer_buy is used for domestic coffee conversion by default.',
      } satisfies RawFxUsdVndRow,
    ]
  })
}

export async function fetchVietcombankUsdVndRows(fetchedAt = new Date().toISOString()) {
  const xml = await retryTransient(async () => {
    const response = await fetch(VIETCOMBANK_FX_URL, {
      headers: {
        accept: 'application/xml,text/xml,*/*;q=0.8',
        'user-agent': 'nongsanvn-domestic-coffee-fx/1.0 (+https://nongsanvn.vn)',
      },
    })
    if (!response.ok) {
      throw new Error(`Vietcombank FX request failed with ${response.status}`)
    }
    return response.text()
  })
  return parseVietcombankUsdVndXml(xml, { fetchedAt, sourceUrl: VIETCOMBANK_FX_URL })
}

function selectFxForPriceDate(priceDate: string, fxRows: RawFxUsdVndRow[]) {
  const minDate = addDays(priceDate, -FX_LOOKBACK_DAYS)
  const candidates = fxRows
    .filter(row => row.currency_pair === 'USD/VND')
    .filter(row => row.source_name === VIETCOMBANK_SOURCE_NAME)
    .filter(row => row.rate_type === DEFAULT_FX_RATE_TYPE)
    .filter(row => row.rate_date <= priceDate && row.rate_date >= minDate)
    .sort((left, right) => right.rate_date.localeCompare(left.rate_date))

  return candidates[0] ?? null
}

function flagFor(price: RawDomesticCoffeePriceRow, fx: RawFxUsdVndRow | null): DomesticCoffeePriceFlag {
  if (price.price_value === null) {
    return 'missing_domestic_price'
  }
  if (price.price_value <= 0) {
    return 'invalid_domestic_price'
  }
  if (price.price_value < DOMESTIC_PRICE_MIN_VND_PER_KG || price.price_value > DOMESTIC_PRICE_MAX_VND_PER_KG) {
    return 'suspicious_price_unit'
  }
  if (!fx) {
    return 'missing_fx_rate'
  }
  if (fx.rate_value <= 0) {
    return 'invalid_fx_rate'
  }
  if (fx.rate_date < price.price_date) {
    return 'fx_filled_previous_available'
  }
  return 'ok'
}

function confidenceFor(flag: DomesticCoffeePriceFlag, sourceConfidence: number | null) {
  const stepConfidence = (() => {
    switch (flag) {
      case 'ok':
        return 0.75
      case 'fx_filled_previous_available':
        return 0.7
      case 'suspicious_price_unit':
        return 0.45
      case 'missing_domestic_price':
      case 'missing_fx_rate':
        return 0.35
      case 'invalid_domestic_price':
      case 'invalid_fx_rate':
        return 0.2
      default:
        return 0.35
    }
  })()

  return roundNumber(Math.min(sourceConfidence ?? stepConfidence, stepConfidence), 3)
}

export function buildDomesticCoffeePriceUsdRows(
  priceRows: RawDomesticCoffeePriceRow[],
  fxRows: RawFxUsdVndRow[],
): DomesticCoffeePriceFxTransformResult {
  const rows = priceRows.map(price => {
    const fx = selectFxForPriceDate(price.price_date, fxRows)
    const flag = flagFor(price, fx)
    const priceVndPerTon = price.price_value !== null && price.price_value > 0 ? roundNumber(price.price_value * 1000, 2) : null
    const usdVndRate = fx?.rate_value ?? null
    const domesticPriceUsdPerTon =
      priceVndPerTon !== null && usdVndRate !== null && usdVndRate > 0 ? roundNumber(priceVndPerTon / usdVndRate, 6) : null

    return {
      price_date: price.price_date,
      commodity_group: COMMODITY_GROUP,
      commodity_slug: COMMODITY_SLUG,
      location_name: price.location_name,
      province: price.province,
      province_code: price.province_code,
      district: price.district,
      price_type: PRICE_TYPE,
      price_vnd_per_kg: price.price_value,
      price_vnd_per_ton: priceVndPerTon,
      fx_source_name: fx?.source_name ?? null,
      fx_rate_type: fx?.rate_type ?? DEFAULT_FX_RATE_TYPE,
      fx_rate_date: fx?.rate_date ?? null,
      usd_vnd_rate: usdVndRate,
      domestic_price_usd_per_ton: domesticPriceUsdPerTon,
      source_name: price.source_name,
      source_url: price.source_url,
      fetched_at: price.fetched_at,
      data_quality_flag: flag,
      confidence_score: confidenceFor(flag, price.confidence_score),
      notes:
        'Domestic coffee price converted from VND/kg to USD/ton using selected USD/VND rate. This is not FOB, CIF, transaction price, margin, or profit.',
    } satisfies DomesticCoffeePriceUsdRow
  })

  return {
    rows,
    qc: buildQcReport(priceRows, fxRows, rows),
  }
}

export function getPreferredLatestDomesticCoffeeRows(rows: DomesticCoffeePriceUsdRow[]) {
  const usable = rows
    .filter(row => row.data_quality_flag === 'ok' || row.data_quality_flag === 'fx_filled_previous_available')
    .sort((left, right) => {
      const provinceDelta = String(left.province_code ?? '').localeCompare(String(right.province_code ?? ''))
      if (provinceDelta !== 0) {
        return provinceDelta
      }
      const dateDelta = right.price_date.localeCompare(left.price_date)
      if (dateDelta !== 0) {
        return dateDelta
      }
      return (SOURCE_PRIORITY[right.source_name] ?? 50) - (SOURCE_PRIORITY[left.source_name] ?? 50)
    })
  const preferred = new Map<string, DomesticCoffeePriceUsdRow>()
  for (const row of usable) {
    const key = row.province_code ?? row.province ?? 'unknown'
    if (!preferred.has(key)) {
      preferred.set(key, row)
    }
  }
  return [...preferred.values()]
}

function buildFlagCounts(rows: DomesticCoffeePriceUsdRow[]) {
  const counts = {
    ok: 0,
    missing_domestic_price: 0,
    missing_fx_rate: 0,
    invalid_domestic_price: 0,
    invalid_fx_rate: 0,
    suspicious_price_unit: 0,
    fx_filled_previous_available: 0,
  } satisfies Record<DomesticCoffeePriceFlag, number>
  for (const row of rows) {
    counts[row.data_quality_flag] += 1
  }
  return counts
}

function buildDailyJumpRows(rows: DomesticCoffeePriceUsdRow[]) {
  const groups = new Map<string, DomesticCoffeePriceUsdRow[]>()
  for (const row of rows) {
    if (row.price_vnd_per_kg === null || row.price_vnd_per_kg <= 0) {
      continue
    }
    const key = [row.province_code ?? row.province ?? 'unknown', row.source_name].join('|')
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const jumps: DomesticCoffeePriceFxQcReport['dailyJumpsAbove10Pct'] = []
  for (const groupRows of groups.values()) {
    const sorted = groupRows.sort((left, right) => left.price_date.localeCompare(right.price_date))
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (!previous.price_vnd_per_kg || !current.price_vnd_per_kg) {
        continue
      }
      const dailyChangePct = roundNumber((current.price_vnd_per_kg / previous.price_vnd_per_kg - 1) * 100, 4)
      if (Math.abs(dailyChangePct) > 10) {
        jumps.push({
          priceDate: current.price_date,
          provinceCode: current.province_code,
          province: current.province,
          sourceName: current.source_name,
          priceVndPerKg: current.price_vnd_per_kg,
          previousPriceVndPerKg: previous.price_vnd_per_kg,
          dailyChangePct,
        })
      }
    }
  }
  return jumps
}

function buildQcReport(
  priceRows: RawDomesticCoffeePriceRow[],
  fxRows: RawFxUsdVndRow[],
  rows: DomesticCoffeePriceUsdRow[],
): DomesticCoffeePriceFxQcReport {
  const sourceCoverage = priceRows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.source_name] = (accumulator[row.source_name] ?? 0) + 1
    return accumulator
  }, {})
  const latestPriceDate = rows.reduce<string | null>((latest, row) => (!latest || row.price_date > latest ? row.price_date : latest), null)
  const latestRows = latestPriceDate ? rows.filter(row => row.price_date === latestPriceDate) : []
  const provinceCoverage = new Map<string, { provinceCode: string | null; province: string | null; sourceCount: number }>()
  for (const row of latestRows) {
    const key = row.province_code ?? row.province ?? 'unknown'
    const current = provinceCoverage.get(key) ?? {
      provinceCode: row.province_code,
      province: row.province,
      sourceCount: 0,
    }
    current.sourceCount += 1
    provinceCoverage.set(key, current)
  }

  return {
    rawPriceRows: priceRows.length,
    rawFxRows: fxRows.length,
    factRows: rows.length,
    flagCounts: buildFlagCounts(rows),
    sourceCoverage,
    latestPriceDate,
    provinceCoverageLatestDate: [...provinceCoverage.values()].sort((left, right) =>
      String(left.provinceCode ?? '').localeCompare(String(right.provinceCode ?? '')),
    ),
    suspiciousFxRows: fxRows.filter(row => row.rate_value < FX_MIN_USD_VND || row.rate_value > FX_MAX_USD_VND),
    suspiciousConvertedRows: rows.filter(
      row =>
        row.domestic_price_usd_per_ton !== null &&
        (row.domestic_price_usd_per_ton < CONVERTED_MIN_USD_PER_TON || row.domestic_price_usd_per_ton > CONVERTED_MAX_USD_PER_TON),
    ),
    dailyJumpsAbove10Pct: buildDailyJumpRows(rows),
  }
}

function formatCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<keyof T>) {
  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => formatCsvValue(row[column])).join(',')),
  ].join('\n')
}

function rawPriceToCsv(rows: RawDomesticCoffeePriceRow[]) {
  const columns: Array<keyof RawDomesticCoffeePriceRow> = [
    'dedupe_key',
    'source_name',
    'source_url',
    'fetched_at',
    'price_date',
    'commodity_group',
    'commodity_slug',
    'location_name',
    'province',
    'province_code',
    'district',
    'price_type',
    'price_raw',
    'price_value',
    'currency',
    'unit',
    'change_raw',
    'change_value',
    'confidence_score',
    'raw_payload',
    'notes',
  ]
  return toCsv(rows, columns)
}

function rawFxToCsv(rows: RawFxUsdVndRow[]) {
  const columns: Array<keyof RawFxUsdVndRow> = [
    'source_name',
    'source_url',
    'fetched_at',
    'rate_date',
    'currency_pair',
    'rate_type',
    'rate_value',
    'raw_payload',
    'notes',
  ]
  return toCsv(rows, columns)
}

export function renderDomesticCoffeePriceFxQcMarkdown(report: DomesticCoffeePriceFxQcReport, options: { generatedAt: string }) {
  const rows = [
    '# QC Report - Domestic Coffee Price + USD/VND',
    '',
    `Generated at: ${options.generatedAt}`,
    '',
    '## Row Counts',
    '',
    `- Raw domestic price rows: ${report.rawPriceRows}`,
    `- Raw FX rows: ${report.rawFxRows}`,
    `- Fact rows: ${report.factRows}`,
    '',
    '## Data Quality Flags',
    '',
  ]

  for (const [flag, count] of Object.entries(report.flagCounts)) {
    rows.push(`- ${flag}: ${count}`)
  }

  rows.push('', '## Source Coverage', '')
  for (const [source, count] of Object.entries(report.sourceCoverage)) {
    rows.push(`- ${source}: ${count}`)
  }

  rows.push('', '## Province Coverage', '')
  rows.push(`Latest price date: ${report.latestPriceDate ?? 'n/a'}`, '')
  for (const row of report.provinceCoverageLatestDate) {
    rows.push(`- ${row.province ?? 'n/a'} (${row.provinceCode ?? 'n/a'}): ${row.sourceCount} source rows`)
  }

  rows.push('', '## Suspicious FX Values', '')
  if (report.suspiciousFxRows.length === 0) {
    rows.push('- None')
  } else {
    for (const row of report.suspiciousFxRows) {
      rows.push(`- ${row.rate_date} | ${row.source_name} | ${row.rate_type} | ${row.rate_value}`)
    }
  }

  rows.push('', '## Suspicious Converted USD/Ton Values', '')
  if (report.suspiciousConvertedRows.length === 0) {
    rows.push('- None')
  } else {
    for (const row of report.suspiciousConvertedRows) {
      rows.push(`- ${row.price_date} | ${row.province ?? 'n/a'} | ${row.source_name} | ${row.domestic_price_usd_per_ton}`)
    }
  }

  rows.push('', '## Daily Jumps Above 10%', '')
  if (report.dailyJumpsAbove10Pct.length === 0) {
    rows.push('- None')
  } else {
    for (const row of report.dailyJumpsAbove10Pct) {
      rows.push(
        `- ${row.priceDate} | ${row.province ?? 'n/a'} (${row.provinceCode ?? 'n/a'}) | ${row.sourceName} | ${row.previousPriceVndPerKg} -> ${row.priceVndPerKg} | ${row.dailyChangePct}%`,
      )
    }
  }

  rows.push(
    '',
    '## Methodology Warning',
    '',
    '- Domestic coffee price converted to USD/ton is not FOB, CIF, transaction export price, margin, or profit.',
    '- The domestic-vs-export gap is a directional benchmark only.',
    '',
  )

  return rows.join('\n')
}

export function renderDomesticCoffeePriceFxSourceResearch() {
  return [
    '# Source Research - Domestic Coffee Price + USD/VND',
    '',
    '## Domestic Coffee Price Sources',
    '',
    '- Vietnambiz: public Vietnamese commodity news pages; current crawler returns Dak Lak, Lam Dong, Gia Lai, and Dak Nong rows in VND/kg. Reliability is medium because it is a news source, not an official statistical API.',
    '- Nong nghiep & Moi truong: public agriculture news source; current crawler returns Central Highlands coffee rows in VND/kg. Reliability is medium-high for agricultural market reporting, but format can change.',
    '- Cong Thuong: public trade/industry news source; existing crawler can parse province-level coffee prices from coffee price articles. Reliability is medium-high, but parser depends on article wording.',
    '- Giacafe.vn: coffee-specific public page with province rows, VND/kg unit, and Vietcombank FX note. It is documented as a candidate and cross-check source, but not added as a new crawler in this MVP.',
    '- Agroinfo-style weekly PDFs: government/quasi-government market bulletin PDFs can provide weekly province averages and source references. They are useful for audit/cross-check, not daily MVP ingestion.',
    '',
    '## FX Sources',
    '',
    '- Vietcombank XML endpoint provides current rates with Buy, Transfer, and Sell fields. This MVP stores cash_buy, transfer_buy, and sell, and uses transfer_buy for conversion.',
    '- The Vietcombank XML response includes a reference-only note and should not be polled aggressively. The sync checks same-day rows before fetching.',
    '- Existing generic exchange_rate_observations are not used for Step 4 MVP because they do not represent Vietcombank rate_type.',
    '',
    '## Default Rule',
    '',
    '- Convert VND/kg to USD/ton with Vietcombank USD/VND transfer_buy.',
    '- If exact date FX is missing, use previous available Vietcombank transfer_buy within 3 calendar days.',
    '- Never use future FX rates.',
    '',
  ].join('\n')
}

export function renderDomesticCoffeePriceFxMethodology() {
  return [
    '# Domestic Coffee Price + USD/VND Methodology',
    '',
    '## Scope',
    '',
    '- Commodity: Vietnam domestic Robusta coffee benchmark',
    '- Provinces: Dak Lak, Lam Dong, Gia Lai, Dak Nong',
    '- Domestic unit: VND/kg',
    '- FX pair: USD/VND',
    '- Default FX source and type: Vietcombank transfer_buy',
    '',
    '## Formula',
    '',
    '`price_vnd_per_ton = price_vnd_per_kg * 1000`',
    '',
    '`domestic_price_usd_per_ton = price_vnd_per_kg * 1000 / usd_vnd_rate`',
    '',
    '## FX Matching',
    '',
    '- Use exact-date Vietcombank transfer_buy when available.',
    '- If exact-date FX is missing, use the nearest previous Vietcombank transfer_buy within 3 calendar days.',
    '- Do not use future FX rates.',
    '',
    '## Interpretation',
    '',
    'Domestic coffee price converted to USD/ton is not FOB price, CIF price, actual export transaction price, margin, or profit. Export unit value from trade data is also not an actual transaction price. The gap between domestic USD/ton and export unit value is only a directional benchmark and should be interpreted with caution.',
    '',
  ].join('\n')
}

async function writeArtifactFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function getExistingVietcombankFxRows(rateDate: string) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('raw_fx_usd_vnd')
    .select('source_name,source_url,fetched_at,rate_date,currency_pair,rate_type,rate_value,raw_payload,notes')
    .eq('source_name', VIETCOMBANK_SOURCE_NAME)
    .eq('currency_pair', 'USD/VND')
    .eq('rate_date', rateDate)

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205') {
      return null
    }
    throw error
  }

  const rows = (data ?? []) as RawFxUsdVndRow[]
  return rows.some(row => row.rate_type === DEFAULT_FX_RATE_TYPE) ? rows : null
}

async function loadOrFetchVietcombankFxRows(fetchedAt: string) {
  const existing = await getExistingVietcombankFxRows(toIsoDate(fetchedAt))
  if (existing && existing.length > 0) {
    return existing
  }
  return fetchVietcombankUsdVndRows(fetchedAt)
}

async function upsertRawPriceRows(rows: RawDomesticCoffeePriceRow[], chunkSize = 500) {
  if (rows.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await client.from('raw_domestic_coffee_prices').upsert(rows.slice(index, index + chunkSize), {
      onConflict: 'dedupe_key',
    })
    if (error) {
      throw error
    }
  }
  return rows.length
}

async function upsertRawFxRows(rows: RawFxUsdVndRow[], chunkSize = 500) {
  if (rows.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await client.from('raw_fx_usd_vnd').upsert(rows.slice(index, index + chunkSize), {
      onConflict: 'rate_date,currency_pair,rate_type,source_name',
    })
    if (error) {
      throw error
    }
  }
  return rows.length
}

async function upsertFactRows(rows: DomesticCoffeePriceUsdRow[], chunkSize = 500) {
  if (rows.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await client.from('fact_domestic_coffee_price_usd').upsert(rows.slice(index, index + chunkSize), {
      onConflict: 'price_date,province_code,district,source_name,fx_rate_type',
    })
    if (error) {
      throw error
    }
  }
  return rows.length
}

export async function syncDomesticCoffeePriceFx(options: DomesticCoffeePriceFxSyncOptions = {}): Promise<DomesticCoffeePriceFxSyncResult> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const rawPriceRows = options.sourcePriceRows ?? (await fetchDomesticCoffeePriceRows(fetchedAt))
  const rawFxRows = options.sourceFxRows ?? (await loadOrFetchVietcombankFxRows(fetchedAt))
  const transformed = buildDomesticCoffeePriceUsdRows(rawPriceRows, rawFxRows)

  const rawPriceCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'raw', 'domestic_coffee_prices.csv') : null
  const rawFxCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'raw', 'fx_usd_vnd.csv') : null
  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'fact_domestic_coffee_price_usd.csv') : null
  const qcReportPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'domestic_price_fx_qc.md') : null
  const sourceResearchPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'domestic_price_fx_source_research.md') : null
  const methodologyPath = writeArtifacts ? resolve(workspaceRoot, 'docs', 'methodology', 'domestic_price_fx_methodology.md') : null

  if (rawPriceCsvPath) {
    await writeArtifactFile(rawPriceCsvPath, rawPriceToCsv(rawPriceRows))
  }
  if (rawFxCsvPath) {
    await writeArtifactFile(rawFxCsvPath, rawFxToCsv(rawFxRows))
  }
  if (factCsvPath) {
    await writeArtifactFile(factCsvPath, toCsv(transformed.rows, OUTPUT_COLUMNS))
  }
  if (qcReportPath) {
    await writeArtifactFile(qcReportPath, renderDomesticCoffeePriceFxQcMarkdown(transformed.qc, { generatedAt: new Date().toISOString() }))
  }
  if (sourceResearchPath) {
    await writeArtifactFile(sourceResearchPath, renderDomesticCoffeePriceFxSourceResearch())
  }
  if (methodologyPath) {
    await writeArtifactFile(methodologyPath, renderDomesticCoffeePriceFxMethodology())
  }

  const rawPriceRowsPersisted = dryRun ? 0 : await upsertRawPriceRows(rawPriceRows)
  const rawFxRowsPersisted = dryRun ? 0 : await upsertRawFxRows(rawFxRows)
  const factRowsPersisted = dryRun ? 0 : await upsertFactRows(transformed.rows)

  return {
    ...transformed,
    rawPriceRows,
    rawFxRows,
    rawPriceRowsPersisted,
    rawFxRowsPersisted,
    factRowsPersisted,
    artifacts: {
      rawPriceCsvPath,
      rawFxCsvPath,
      factCsvPath,
      qcReportPath,
      sourceResearchPath,
      methodologyPath,
    },
  }
}
