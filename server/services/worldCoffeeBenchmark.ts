import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { getSupabaseAdminClient } from './supabaseClient.js'
import { icoCoffeeDailyProvider } from './worldPriceProviders.js'

export type WorldCoffeeBenchmarkType =
  | 'futures'
  | 'spot_benchmark'
  | 'monthly_commodity_price'
  | 'indicator_price'
  | 'proxy'

export type WorldCoffeeBenchmarkFlag =
  | 'ok'
  | 'missing_price'
  | 'missing_currency'
  | 'missing_unit'
  | 'unsupported_unit'
  | 'missing_fx_conversion'
  | 'suspicious_price_low'
  | 'suspicious_price_high'
  | 'source_unavailable'
  | 'manual_review_required'

export type RawWorldCoffeeBenchmarkRow = {
  price_date: string
  commodity_group: 'coffee'
  benchmark_name: string
  benchmark_type: WorldCoffeeBenchmarkType
  contract_code: string | null
  contract_month: string | null
  price_value: number | null
  currency: string | null
  unit: string | null
  source_name: string
  source_url: string | null
  fetched_at: string
  source_confidence_score: number
  notes: string | null
  raw_payload: Record<string, unknown>
}

export type WorldCoffeeBenchmarkRow = Omit<RawWorldCoffeeBenchmarkRow, 'source_confidence_score'> & {
  price_usd_per_ton: number | null
  data_quality_flag: WorldCoffeeBenchmarkFlag
  confidence_score: number
}

export type WorldCoffeeBenchmarkQcReport = {
  rawRows: number
  factRows: number
  sourceErrors: string[]
  flagCounts: Record<WorldCoffeeBenchmarkFlag, number>
  sourceCoverage: Record<string, number>
  dateRange: { min: string | null; max: string | null }
  missingPriceCount: number
  unsupportedUnitCount: number
  suspiciousLowCount: number
  suspiciousHighCount: number
  sourceFreshnessWarnings: string[]
  fredCrossCheck: {
    sourceUrl: string
    sourceAvailable: boolean
    comparedPeriods: number
    missingPeriods: number
    suspiciousDeltaCount: number
    maxDeltaPct: number | null
    avgDeltaPct: number | null
    flaggedPeriods: Array<{
      periodLabel: string
      worldBankUsdPerTon: number
      fredUsdPerTon: number
      deltaUsdPerTon: number
      deltaPct: number
    }>
    warning: string | null
  }
  topHighestPrices: WorldCoffeeBenchmarkRow[]
  topLowestPrices: WorldCoffeeBenchmarkRow[]
}

export type WorldCoffeeBenchmarkSyncOptions = {
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  fetchedAt?: string
  sourceRows?: RawWorldCoffeeBenchmarkRow[]
}

export type WorldCoffeeBenchmarkSyncResult = {
  rawRows: RawWorldCoffeeBenchmarkRow[]
  rows: WorldCoffeeBenchmarkRow[]
  qc: WorldCoffeeBenchmarkQcReport
  rowsPersisted: number
  artifacts: {
    rawCsvPath: string | null
    factCsvPath: string | null
    qcReportPath: string | null
    sourceResearchPath: string | null
    methodologyPath: string | null
  }
}

type WorksheetCellValue = string | number | null
type FuturesProviderAdapter = {
  id: string
  fetchRows: (fetchedAt: string) => Promise<RawWorldCoffeeBenchmarkRow[]>
}
type FredCoffeeObservation = {
  periodLabel: string
  priceDate: string
  priceValue: number
  unit: 'usc/lb'
}

const ICE_ROBUSTA_URL = 'https://www.ice.com/products/37089079'
const ICO_MARKET_INFO_URL = 'https://ico.org/resources/public-market-information/'
const ICO_I_CIP_URL = 'https://www.ico.org/documents/I-CIP.pdf'
const FRED_COFFEE_ROBUSTA_SERIES_URL = 'https://fred.stlouisfed.org/series/PCOFFROBUSDM'
const FRED_COFFEE_ROBUSTA_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCOFFROBUSDM'
const WORLD_BANK_PINK_SHEET_PAGE_URL =
  'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/world-bank-commodities-price-data-the-pink-sheet'
const WORLD_BANK_PINK_SHEET_XLSX_URLS = [
  'https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Historical-Data-Monthly.xlsx',
  'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx',
] as const

const COFFEE_PRICE_MIN_USD_PER_TON = 500
const COFFEE_PRICE_MAX_USD_PER_TON = 15_000
const FRED_VS_WORLD_BANK_ALERT_PCT = 12
const WORLD_BANK_STALE_WARNING_DAYS = 45
const FRED_STALE_WARNING_DAYS = 75
const SOURCE_FETCH_TIMEOUT_MS = 20_000
const FUTURES_PROVIDER_ENV = 'WORLD_COFFEE_FUTURES_PROVIDER'
const FUTURES_API_KEY_ENV = 'WORLD_COFFEE_FUTURES_API_KEY'

const RAW_COLUMNS: Array<keyof RawWorldCoffeeBenchmarkRow> = [
  'price_date',
  'commodity_group',
  'benchmark_name',
  'benchmark_type',
  'contract_code',
  'contract_month',
  'price_value',
  'currency',
  'unit',
  'source_name',
  'source_url',
  'fetched_at',
  'source_confidence_score',
  'notes',
  'raw_payload',
]

const FACT_COLUMNS: Array<keyof WorldCoffeeBenchmarkRow> = [
  'price_date',
  'commodity_group',
  'benchmark_name',
  'benchmark_type',
  'contract_code',
  'contract_month',
  'price_value',
  'currency',
  'unit',
  'price_usd_per_ton',
  'source_name',
  'source_url',
  'fetched_at',
  'data_quality_flag',
  'confidence_score',
  'notes',
  'raw_payload',
]

function roundNumber(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeUnit(value: string) {
  return normalizeText(value)
    .replace(/\$/g, 'usd')
    .replace(/u\.s\./g, 'us')
    .replace(/¢/g, 'cent')
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed === '...' || trimmed === '...') {
    return null
  }
  const numeric = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function toWorksheetCellValue(value: ExcelJS.CellValue | null | undefined): WorksheetCellValue {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return toWorksheetCellValue(value.result)
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      const text = value.richText
        .map(entry => entry.text)
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        .join('')
      return text || null
    }
  }
  return null
}

function getWorksheetMatrix(sheet: ExcelJS.Worksheet) {
  const matrix: WorksheetCellValue[][] = []
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const cells: WorksheetCellValue[] = []
    for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber += 1) {
      cells[columnNumber - 1] = toWorksheetCellValue(row.getCell(columnNumber).value)
    }
    matrix.push(cells)
  }
  return matrix
}

function periodToMonthEnd(period: string) {
  const match = period.match(/^(\d{4})M(\d{2})$/)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function monthStartToPeriodLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (!match) {
    return null
  }
  return `${match[1]}-${match[2]}`
}

function daysBetween(olderDate: string, newerDate: string) {
  const older = new Date(`${olderDate}T00:00:00.000Z`).getTime()
  const newer = new Date(`${newerDate}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(older) || !Number.isFinite(newer)) {
    return null
  }
  return Math.floor((newer - older) / (24 * 60 * 60 * 1000))
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = SOURCE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function normalizeToUsdPerTon(
  priceValue: number | null | undefined,
  currency: string | null | undefined,
  unit: string | null | undefined,
  fxRate?: number | null,
): { priceUsdPerTon: number | null; flag: WorldCoffeeBenchmarkFlag } {
  if (priceValue === null || priceValue === undefined || !Number.isFinite(priceValue)) {
    return { priceUsdPerTon: null, flag: 'missing_price' }
  }
  if (!currency || !currency.trim()) {
    return { priceUsdPerTon: null, flag: 'missing_currency' }
  }
  if (!unit || !unit.trim()) {
    return { priceUsdPerTon: null, flag: 'missing_unit' }
  }

  let value = priceValue
  const currencyNorm = currency.trim().toUpperCase()
  if (currencyNorm !== 'USD' && currencyNorm !== 'USX') {
    if (!fxRate || fxRate <= 0) {
      return { priceUsdPerTon: null, flag: 'missing_fx_conversion' }
    }
    value = priceValue / fxRate
  }

  const unitNorm = normalizeUnit(unit)
  if (['ton', 'tonne', 'metric ton', 'metric tonne', 'mt', 'usd/ton', 'usd/tonne', 'usd/mt'].includes(unitNorm)) {
    return { priceUsdPerTon: roundNumber(value), flag: 'ok' }
  }
  if (['kg', 'usd/kg'].includes(unitNorm)) {
    return { priceUsdPerTon: roundNumber(value * 1000), flag: 'ok' }
  }
  if (['lb', 'pound', 'usd/lb'].includes(unitNorm)) {
    return { priceUsdPerTon: roundNumber(value * 2204.62), flag: 'ok' }
  }
  if (['cent/lb', 'cents/lb', 'us cents/lb', 'usc/lb', 'us cents per lb', 'cents per pound'].includes(unitNorm)) {
    return { priceUsdPerTon: roundNumber(value * 22.0462), flag: 'ok' }
  }

  return { priceUsdPerTon: null, flag: 'unsupported_unit' }
}

function qualityFlag(row: RawWorldCoffeeBenchmarkRow, priceUsdPerTon: number | null, normalizedFlag: WorldCoffeeBenchmarkFlag) {
  if (normalizedFlag !== 'ok') {
    return normalizedFlag
  }
  if (priceUsdPerTon === null) {
    return 'missing_price'
  }
  if (priceUsdPerTon < COFFEE_PRICE_MIN_USD_PER_TON) {
    return 'suspicious_price_low'
  }
  if (priceUsdPerTon > COFFEE_PRICE_MAX_USD_PER_TON) {
    return 'suspicious_price_high'
  }
  if (!row.source_url) {
    return 'manual_review_required'
  }
  return 'ok'
}

function confidenceFor(flag: WorldCoffeeBenchmarkFlag, sourceConfidence: number) {
  const capped = flag === 'ok' ? sourceConfidence : Math.min(sourceConfidence, 0.55)
  return roundNumber(capped, 3)
}

function buildBenchmarkNote(row: RawWorldCoffeeBenchmarkRow) {
  const base = row.notes ?? 'Coffee benchmark price normalized for directional comparison.'
  return `${base} Benchmark/futures indicators are not physical transaction prices, Vietnam FOB prices, margins, or profit.`
}

export function buildWorldCoffeeBenchmarkRows(rawRows: RawWorldCoffeeBenchmarkRow[]) {
  const rows = rawRows.map(row => {
    const normalized = normalizeToUsdPerTon(row.price_value, row.currency, row.unit)
    const flag = qualityFlag(row, normalized.priceUsdPerTon, normalized.flag)
    return {
      price_date: row.price_date,
      commodity_group: row.commodity_group,
      benchmark_name: row.benchmark_name,
      benchmark_type: row.benchmark_type,
      contract_code: row.contract_code,
      contract_month: row.contract_month,
      price_value: row.price_value,
      currency: row.currency,
      unit: row.unit,
      price_usd_per_ton: normalized.priceUsdPerTon,
      source_name: row.source_name,
      source_url: row.source_url,
      fetched_at: row.fetched_at,
      data_quality_flag: flag,
      confidence_score: confidenceFor(flag, row.source_confidence_score),
      notes: buildBenchmarkNote(row),
      raw_payload: row.raw_payload,
    } satisfies WorldCoffeeBenchmarkRow
  })

  return {
    rows,
    qc: buildWorldCoffeeBenchmarkQcReport(rawRows, rows, []),
  }
}

function buildFlagCounts(rows: WorldCoffeeBenchmarkRow[]) {
  const counts: Record<WorldCoffeeBenchmarkFlag, number> = {
    ok: 0,
    missing_price: 0,
    missing_currency: 0,
    missing_unit: 0,
    unsupported_unit: 0,
    missing_fx_conversion: 0,
    suspicious_price_low: 0,
    suspicious_price_high: 0,
    source_unavailable: 0,
    manual_review_required: 0,
  }
  for (const row of rows) {
    counts[row.data_quality_flag] += 1
  }
  return counts
}

function periodLabelFromContractMonth(contractMonth: string | null) {
  if (!contractMonth) {
    return null
  }
  const match = contractMonth.match(/^(\d{4})M(\d{2})$/)
  if (!match) {
    return null
  }
  return `${match[1]}-${match[2]}`
}

function buildSourceFreshnessWarnings(
  rawRows: RawWorldCoffeeBenchmarkRow[],
  fredObservations: FredCoffeeObservation[],
  referenceDate: string,
) {
  const warnings: string[] = []

  const latestIcoDate = rawRows
    .filter(row => row.source_name === 'ICO Public Market Information' && row.price_date)
    .map(row => row.price_date)
    .sort()
    .at(-1)
  if (latestIcoDate) {
    const staleDays = daysBetween(latestIcoDate, referenceDate)
    if (staleDays !== null && staleDays > 7) {
      warnings.push(`ICO daily source appears stale by ${staleDays} day(s) as of ${referenceDate}.`)
    }
  }

  const latestWorldBankDate = rawRows
    .filter(row => row.source_name === 'World Bank Pink Sheet' && row.price_date)
    .map(row => row.price_date)
    .sort()
    .at(-1)
  if (latestWorldBankDate) {
    const staleDays = daysBetween(latestWorldBankDate, referenceDate)
    if (staleDays !== null && staleDays > WORLD_BANK_STALE_WARNING_DAYS) {
      warnings.push(`World Bank monthly source appears stale by ${staleDays} day(s) as of ${referenceDate}.`)
    }
  }

  const latestFredDate = fredObservations.map(row => row.priceDate).sort().at(-1)
  if (latestFredDate) {
    const staleDays = daysBetween(latestFredDate, referenceDate)
    if (staleDays !== null && staleDays > FRED_STALE_WARNING_DAYS) {
      warnings.push(`FRED robusta monthly source appears stale by ${staleDays} day(s) as of ${referenceDate}.`)
    }
  }

  return warnings
}

function buildFredCrossCheck(rows: WorldCoffeeBenchmarkRow[], fredObservations: FredCoffeeObservation[]) {
  const emptyResult: WorldCoffeeBenchmarkQcReport['fredCrossCheck'] = {
    sourceUrl: FRED_COFFEE_ROBUSTA_SERIES_URL,
    sourceAvailable: fredObservations.length > 0,
    comparedPeriods: 0,
    missingPeriods: 0,
    suspiciousDeltaCount: 0,
    maxDeltaPct: null,
    avgDeltaPct: null,
    flaggedPeriods: [],
    warning:
      fredObservations.length > 0
        ? 'No overlapping periods found for FRED vs World Bank robusta cross-check.'
        : 'FRED robusta cross-check data unavailable.',
  }

  if (fredObservations.length === 0) {
    return emptyResult
  }

  const fredByPeriod = new Map(
    fredObservations.map(observation => {
      const normalized = normalizeToUsdPerTon(observation.priceValue, 'USD', observation.unit)
      return [observation.periodLabel, normalized.priceUsdPerTon]
    }),
  )

  const worldBankRows = rows
    .filter(
      row =>
        row.benchmark_type === 'monthly_commodity_price' &&
        row.benchmark_name === 'World Bank Coffee Robusta' &&
        row.data_quality_flag === 'ok' &&
        row.price_usd_per_ton !== null,
    )
    .map(row => ({
      periodLabel: periodLabelFromContractMonth(row.contract_month) ?? monthStartToPeriodLabel(row.price_date),
      priceUsdPerTon: row.price_usd_per_ton ?? null,
    }))
    .filter((row): row is { periodLabel: string; priceUsdPerTon: number } => Boolean(row.periodLabel && row.priceUsdPerTon !== null))

  if (worldBankRows.length === 0) {
    return {
      ...emptyResult,
      warning: 'World Bank robusta monthly rows are unavailable for FRED cross-check.',
    }
  }

  const deltas: Array<{
    periodLabel: string
    worldBankUsdPerTon: number
    fredUsdPerTon: number
    deltaUsdPerTon: number
    deltaPct: number
  }> = []
  let missingPeriods = 0

  for (const worldBankRow of worldBankRows) {
    const fredValue = fredByPeriod.get(worldBankRow.periodLabel)
    if (fredValue === null || fredValue === undefined || !Number.isFinite(fredValue) || fredValue <= 0) {
      missingPeriods += 1
      continue
    }

    const deltaUsdPerTon = roundNumber(worldBankRow.priceUsdPerTon - fredValue, 6)
    const deltaPct = roundNumber(((worldBankRow.priceUsdPerTon / fredValue) - 1) * 100, 6)
    deltas.push({
      periodLabel: worldBankRow.periodLabel,
      worldBankUsdPerTon: worldBankRow.priceUsdPerTon,
      fredUsdPerTon: fredValue,
      deltaUsdPerTon,
      deltaPct,
    })
  }

  if (deltas.length === 0) {
    return {
      ...emptyResult,
      missingPeriods,
      warning: 'FRED robusta source is available but no overlapping comparable period values were found.',
    }
  }

  const absDeltaPcts = deltas.map(row => Math.abs(row.deltaPct))
  const avgDeltaPct = roundNumber(absDeltaPcts.reduce((sum, value) => sum + value, 0) / absDeltaPcts.length, 6)
  const maxDeltaPct = roundNumber(Math.max(...absDeltaPcts), 6)
  const flaggedPeriods = deltas
    .filter(row => Math.abs(row.deltaPct) > FRED_VS_WORLD_BANK_ALERT_PCT)
    .sort((left, right) => Math.abs(right.deltaPct) - Math.abs(left.deltaPct))
    .slice(0, 20)

  return {
    sourceUrl: FRED_COFFEE_ROBUSTA_SERIES_URL,
    sourceAvailable: true,
    comparedPeriods: deltas.length,
    missingPeriods,
    suspiciousDeltaCount: flaggedPeriods.length,
    maxDeltaPct,
    avgDeltaPct,
    flaggedPeriods,
    warning:
      flaggedPeriods.length > 0
        ? `FRED robusta cross-check flagged ${flaggedPeriods.length} period(s) over ${FRED_VS_WORLD_BANK_ALERT_PCT}% delta threshold.`
        : null,
  }
}

export function buildWorldCoffeeBenchmarkQcReport(
  rawRows: RawWorldCoffeeBenchmarkRow[],
  rows: WorldCoffeeBenchmarkRow[],
  sourceErrors: string[],
  options: { fredObservations?: FredCoffeeObservation[]; sourceFreshnessWarnings?: string[] } = {},
): WorldCoffeeBenchmarkQcReport {
  const dates = rows.map(row => row.price_date).sort()
  const sourceCoverage = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.source_name] = (accumulator[row.source_name] ?? 0) + 1
    return accumulator
  }, {})
  const pricedRows = rows.filter(row => row.price_usd_per_ton !== null)

  return {
    rawRows: rawRows.length,
    factRows: rows.length,
    sourceErrors,
    flagCounts: buildFlagCounts(rows),
    sourceCoverage,
    dateRange: {
      min: dates[0] ?? null,
      max: dates.at(-1) ?? null,
    },
    missingPriceCount: rows.filter(row => row.data_quality_flag === 'missing_price').length,
    unsupportedUnitCount: rows.filter(row => row.data_quality_flag === 'unsupported_unit').length,
    suspiciousLowCount: rows.filter(row => row.data_quality_flag === 'suspicious_price_low').length,
    suspiciousHighCount: rows.filter(row => row.data_quality_flag === 'suspicious_price_high').length,
    sourceFreshnessWarnings: options.sourceFreshnessWarnings ?? [],
    fredCrossCheck: buildFredCrossCheck(rows, options.fredObservations ?? []),
    topHighestPrices: [...pricedRows].sort((left, right) => (right.price_usd_per_ton ?? 0) - (left.price_usd_per_ton ?? 0)).slice(0, 20),
    topLowestPrices: [...pricedRows].sort((left, right) => (left.price_usd_per_ton ?? 0) - (right.price_usd_per_ton ?? 0)).slice(0, 20),
  }
}

export async function fetchIcoCoffeeBenchmarkRows(fetchedAt = new Date().toISOString()) {
  const items = await icoCoffeeDailyProvider.fetch()
  return items
    .filter(item => item.id === 'coffee-robusta' || item.id === 'coffee-arabica')
    .map(item => {
      const isRobusta = item.id === 'coffee-robusta'
      return {
        price_date: item.observedOn,
        commodity_group: 'coffee',
        benchmark_name: isRobusta ? 'ICO Robustas Indicator' : 'ICO Arabica Indicator',
        benchmark_type: 'indicator_price',
        contract_code: item.contractSymbol,
        contract_month: null,
        price_value: item.priceCurrent,
        currency: 'USD',
        unit: item.unit,
        source_name: 'ICO Public Market Information',
        source_url: item.sourceUrl || ICO_MARKET_INFO_URL,
        fetched_at: fetchedAt,
        source_confidence_score: 0.8,
        notes: 'Daily ICO coffee indicator price. It is an indicator benchmark, not a futures settlement or physical transaction price.',
        raw_payload: {
          ...item,
          sourceUrl: item.sourceUrl,
          sourceLicenseNote: item.sourceLicenseNote,
        },
      } satisfies RawWorldCoffeeBenchmarkRow
    })
}

export async function parseWorldBankCoffeeBenchmarkWorkbook(
  workbookBuffer: ArrayBuffer | Buffer,
  options: { fetchedAt?: string; sourceUrl?: string } = {},
) {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const sourceUrl = options.sourceUrl ?? WORLD_BANK_PINK_SHEET_XLSX_URLS[0]
  const workbook = new ExcelJS.Workbook()
  const loadBuffer = (
    Buffer.isBuffer(workbookBuffer) ? workbookBuffer : Buffer.from(new Uint8Array(workbookBuffer))
  ) as unknown as Parameters<typeof workbook.xlsx.load>[0]
  await workbook.xlsx.load(loadBuffer)
  const sheet =
    workbook.worksheets.find(worksheet => worksheet.name.toLowerCase().includes('monthly') && worksheet.name.toLowerCase().includes('price')) ??
    workbook.worksheets[0]
  if (!sheet) {
    return []
  }

  const matrix = getWorksheetMatrix(sheet)
  const commodityRow = matrix[4] ?? []
  const dataRows = matrix.slice(6)
  const headers = commodityRow.map(value => normalizeText(typeof value === 'string' ? value : null))
  const labelMap = new Map([
    [
      'coffee, robusta',
      {
        benchmarkName: 'World Bank Coffee Robusta',
        contractCode: 'WB_COFFEE_ROBUSTA',
      },
    ],
    [
      'coffee, arabica',
      {
        benchmarkName: 'World Bank Coffee Arabica',
        contractCode: 'WB_COFFEE_ARABICA',
      },
    ],
  ])
  const rows: RawWorldCoffeeBenchmarkRow[] = []

  for (const [rowIndex, row] of dataRows.entries()) {
    const period = typeof row[0] === 'string' ? row[0].trim() : ''
    const priceDate = periodToMonthEnd(period)
    if (!priceDate) {
      continue
    }

    for (let columnIndex = 1; columnIndex < headers.length; columnIndex += 1) {
      const mapping = labelMap.get(headers[columnIndex])
      if (!mapping) {
        continue
      }
      const priceValue = toNumber(row[columnIndex])
      rows.push({
        price_date: priceDate,
        commodity_group: 'coffee',
        benchmark_name: mapping.benchmarkName,
        benchmark_type: 'monthly_commodity_price',
        contract_code: mapping.contractCode,
        contract_month: period,
        price_value: priceValue,
        currency: 'USD',
        unit: 'USD/kg',
        source_name: 'World Bank Pink Sheet',
        source_url: sourceUrl,
        fetched_at: fetchedAt,
        source_confidence_score: 0.75,
        notes: 'World Bank monthly commodity price series for coffee. Monthly backup benchmark, not a futures settlement.',
        raw_payload: {
          period,
          workbookRowNumber: rowIndex + 7,
          workbookColumnNumber: columnIndex + 1,
          sourcePageUrl: WORLD_BANK_PINK_SHEET_PAGE_URL,
        },
      })
    }
  }

  return rows
}

async function fetchWorldBankWorkbook() {
  let lastError: unknown
  for (const url of WORLD_BANK_PINK_SHEET_XLSX_URLS) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
        headers: {
          accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8',
          'user-agent': 'nongsanvn-world-coffee-benchmark/1.0 (+https://nongsanvn.vn)',
        },
      },
        SOURCE_FETCH_TIMEOUT_MS,
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      return {
        buffer: await response.arrayBuffer(),
        sourceUrl: url,
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to fetch World Bank Pink Sheet workbook')
}

export async function fetchWorldBankCoffeeBenchmarkRows(fetchedAt = new Date().toISOString()) {
  const workbook = await fetchWorldBankWorkbook()
  return parseWorldBankCoffeeBenchmarkWorkbook(workbook.buffer, { fetchedAt, sourceUrl: workbook.sourceUrl })
}

function buildLicensedFuturesAdapters(): FuturesProviderAdapter[] {
  const provider = (process.env[FUTURES_PROVIDER_ENV] ?? '').trim()
  const apiKey = (process.env[FUTURES_API_KEY_ENV] ?? '').trim()
  if (!provider || !apiKey) {
    return []
  }

  return [
    {
      id: provider,
      async fetchRows() {
        throw new Error(
          `Licensed futures adapter "${provider}" is configured but not implemented. Add provider integration before enabling futures ingestion.`,
        )
      },
    },
  ]
}

async function fetchLicensedFuturesRows(fetchedAt = new Date().toISOString()) {
  const adapters = buildLicensedFuturesAdapters()
  if (adapters.length === 0) {
    return {
      rows: [] as RawWorldCoffeeBenchmarkRow[],
      errors: [] as string[],
    }
  }

  const rows: RawWorldCoffeeBenchmarkRow[] = []
  const errors: string[] = []
  const results = await Promise.allSettled(adapters.map(adapter => adapter.fetchRows(fetchedAt)))
  for (const [index, result] of results.entries()) {
    const adapterId = adapters[index]?.id ?? 'unknown-adapter'
    if (result.status === 'fulfilled') {
      rows.push(...result.value)
      continue
    }
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
    errors.push(`Futures adapter ${adapterId}: ${message}`)
  }

  return { rows, errors }
}

export function parseFredCoffeeRobustaCsv(csvContent: string): FredCoffeeObservation[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length <= 1) {
    return []
  }

  const observations: FredCoffeeObservation[] = []
  for (const line of lines.slice(1)) {
    const commaIndex = line.indexOf(',')
    if (commaIndex <= 0) {
      continue
    }

    const datePart = line.slice(0, commaIndex).trim()
    const valuePart = line.slice(commaIndex + 1).trim()
    if (valuePart === '.' || valuePart.length === 0) {
      continue
    }

    const value = Number(valuePart)
    if (!Number.isFinite(value)) {
      continue
    }

    const periodLabel = monthStartToPeriodLabel(datePart)
    if (!periodLabel) {
      continue
    }

    const [yearText, monthText] = periodLabel.split('-')
    const priceDate = periodToMonthEnd(`${yearText}M${monthText}`)
    if (!priceDate) {
      continue
    }

    observations.push({
      periodLabel,
      priceDate,
      priceValue: value,
      unit: 'usc/lb',
    })
  }

  return observations.sort((left, right) => left.periodLabel.localeCompare(right.periodLabel))
}

async function fetchFredCoffeeRobustaObservations() {
  const response = await fetchWithTimeout(
    FRED_COFFEE_ROBUSTA_CSV_URL,
    {
      headers: {
        accept: 'text/csv,*/*;q=0.8',
        'user-agent': 'nongsanvn-world-coffee-benchmark/1.0 (+https://nongsanvn.vn)',
      },
    },
    SOURCE_FETCH_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw new Error(`FRED robusta CSV HTTP ${response.status} ${response.statusText}`)
  }
  return parseFredCoffeeRobustaCsv(await response.text())
}

export async function fetchWorldCoffeeBenchmarkRows(fetchedAt = new Date().toISOString()) {
  const rawRows: RawWorldCoffeeBenchmarkRow[] = []
  const sourceErrors: string[] = []
  const results = await Promise.allSettled([
    fetchIcoCoffeeBenchmarkRows(fetchedAt),
    fetchWorldBankCoffeeBenchmarkRows(fetchedAt),
    fetchLicensedFuturesRows(fetchedAt).then(result => {
      if (result.errors.length > 0) {
        sourceErrors.push(...result.errors)
      }
      return result.rows
    }),
  ])

  for (const result of results) {
    if (result.status === 'fulfilled') {
      rawRows.push(...result.value)
    } else {
      sourceErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
  }

  rawRows.sort((left, right) => {
    const dateSort = left.price_date.localeCompare(right.price_date)
    if (dateSort !== 0) {
      return dateSort
    }
    if (left.benchmark_name.includes('Robusta') && !right.benchmark_name.includes('Robusta')) {
      return -1
    }
    if (!left.benchmark_name.includes('Robusta') && right.benchmark_name.includes('Robusta')) {
      return 1
    }
    return left.benchmark_name.localeCompare(right.benchmark_name)
  })

  return { rawRows, sourceErrors }
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
  return [columns.join(','), ...rows.map(row => columns.map(column => formatCsvValue(row[column])).join(','))].join('\n')
}

export function renderWorldCoffeeBenchmarkSourceResearch() {
  return [
    '# Source Research - World Coffee Benchmark',
    '',
    '## Selected Sources',
    '',
    `- ICO Public Market Information: selected as the primary daily coffee indicator source. The pipeline uses the public Robustas indicator in US cents/lb and converts it to USD/ton. Sources: ${ICO_MARKET_INFO_URL} and ${ICO_I_CIP_URL}`,
    `- World Bank Pink Sheet: selected as the monthly official backup and historical backfill. The pipeline uses Coffee, Robusta and Coffee, Arabica series in USD/kg and converts them to USD/ton. Source: ${WORLD_BANK_PINK_SHEET_PAGE_URL}`,
    `- FRED robusta monthly series (PCOFFROBUSDM): used only for QC cross-check against World Bank robusta monthly levels. The series is in US cents/lb and is normalized to USD/ton for delta checks. Source: ${FRED_COFFEE_ROBUSTA_SERIES_URL}`,
    `- ICE Robusta Coffee Futures: recorded as the official London Robusta futures reference. ICE contract code RC is quoted in USD per metric tonne, but this MVP does not scrape or store ICE prices without a licensed data feed. Source: ${ICE_ROBUSTA_URL}`,
    '',
    '## Rejected Or Deferred Sources',
    '',
    '- Yahoo Finance, Barchart, Investing.com, and similar charting sites are not used because public reuse and automated extraction rights are unclear.',
    '- Nasdaq Data Link or other licensed futures APIs are deferred until an API key, dataset symbol, and license scope are available.',
    '- If WORLD_COFFEE_FUTURES_PROVIDER/WORLD_COFFEE_FUTURES_API_KEY are set, the system expects a licensed futures adapter implementation before enabling ingestion.',
    '',
    '## Licensing Warning',
    '',
    '- This dataset is suitable for internal MVP analytics with source attribution and licensing review notes.',
    '- Do not redistribute futures/indicator data commercially or present it as a real-time trading feed without reviewing source licenses.',
    '',
  ].join('\n')
}

export function renderWorldCoffeeBenchmarkMethodology() {
  return [
    '# World Coffee Benchmark Methodology',
    '',
    '## Scope',
    '',
    '- Commodity group: coffee',
    '- Primary focus: Robusta',
    '- Primary daily source: ICO Robustas indicator',
    '- Monthly backup source: World Bank Pink Sheet Coffee, Robusta',
    '- Monthly QC cross-check source: FRED PCOFFROBUSDM (not persisted into fact table)',
    '- Target normalized unit: USD/metric ton',
    '',
    '## Conversion Rules',
    '',
    '- USD/ton: unchanged',
    '- USD/kg: multiply by 1000',
    '- USD/lb: multiply by 2204.62',
    '- US cents/lb: multiply by 22.0462',
    '',
    '## Interpretation',
    '',
    'Benchmark and futures indicators are directional comparison references. They are not Vietnam physical transaction prices, FOB prices, exporter margins, or profit estimates.',
    '',
    '## Futures Note',
    '',
    `ICE Robusta Coffee Futures contract code RC is the official London Robusta futures reference and is quoted in USD per metric tonne. The MVP stores this as methodology context only until a licensed daily futures data source is configured. Source: ${ICE_ROBUSTA_URL}`,
    '',
  ].join('\n')
}

export function renderWorldCoffeeBenchmarkQcMarkdown(report: WorldCoffeeBenchmarkQcReport, options: { generatedAt: string }) {
  const rows = [
    '# QC Report - World Coffee Benchmark',
    '',
    `Generated at: ${options.generatedAt}`,
    '',
    '## Row Counts',
    '',
    `- Raw rows fetched: ${report.rawRows}`,
    `- Fact rows generated: ${report.factRows}`,
    `- Date range: ${report.dateRange.min ?? 'n/a'} to ${report.dateRange.max ?? 'n/a'}`,
    '',
    '## Source Coverage',
    '',
  ]

  for (const [source, count] of Object.entries(report.sourceCoverage)) {
    rows.push(`- ${source}: ${count}`)
  }

  rows.push('', '## Data Quality Flags', '')
  for (const [flag, count] of Object.entries(report.flagCounts)) {
    rows.push(`- ${flag}: ${count}`)
  }

  rows.push(
    '',
    '## Required QC Counts',
    '',
    `- Missing price count: ${report.missingPriceCount}`,
    `- Unsupported unit count: ${report.unsupportedUnitCount}`,
    `- Suspicious low price count: ${report.suspiciousLowCount}`,
    `- Suspicious high price count: ${report.suspiciousHighCount}`,
    '',
    '## Source Errors',
    '',
  )
  if (report.sourceErrors.length === 0) {
    rows.push('- None')
  } else {
    for (const error of report.sourceErrors) {
      rows.push(`- ${error}`)
    }
  }

  rows.push('', '## Source Freshness Warnings', '')
  if (report.sourceFreshnessWarnings.length === 0) {
    rows.push('- None')
  } else {
    for (const warning of report.sourceFreshnessWarnings) {
      rows.push(`- ${warning}`)
    }
  }

  rows.push(
    '',
    '## FRED Cross-Check (World Bank Robusta Monthly)',
    '',
    `- Source URL: ${report.fredCrossCheck.sourceUrl}`,
    `- Source available: ${report.fredCrossCheck.sourceAvailable ? 'yes' : 'no'}`,
    `- Compared periods: ${report.fredCrossCheck.comparedPeriods}`,
    `- Missing periods: ${report.fredCrossCheck.missingPeriods}`,
    `- Suspicious delta count (>${FRED_VS_WORLD_BANK_ALERT_PCT}%): ${report.fredCrossCheck.suspiciousDeltaCount}`,
    `- Max abs delta pct: ${report.fredCrossCheck.maxDeltaPct ?? 'n/a'}`,
    `- Avg abs delta pct: ${report.fredCrossCheck.avgDeltaPct ?? 'n/a'}`,
  )
  if (report.fredCrossCheck.warning) {
    rows.push(`- Warning: ${report.fredCrossCheck.warning}`)
  } else {
    rows.push('- Warning: none')
  }

  rows.push('', '### FRED Flagged Periods', '')
  if (report.fredCrossCheck.flaggedPeriods.length === 0) {
    rows.push('- None')
  } else {
    for (const item of report.fredCrossCheck.flaggedPeriods) {
      rows.push(
        `- ${item.periodLabel} | WB=${item.worldBankUsdPerTon} | FRED=${item.fredUsdPerTon} | delta=${item.deltaUsdPerTon} | delta_pct=${item.deltaPct}%`,
      )
    }
  }

  rows.push('', '## Top 20 Highest USD/Ton Rows', '')
  for (const row of report.topHighestPrices) {
    rows.push(`- ${row.price_date} | ${row.benchmark_name} | ${row.price_usd_per_ton} | ${row.source_name} | ${row.data_quality_flag}`)
  }

  rows.push('', '## Top 20 Lowest USD/Ton Rows', '')
  for (const row of report.topLowestPrices) {
    rows.push(`- ${row.price_date} | ${row.benchmark_name} | ${row.price_usd_per_ton} | ${row.source_name} | ${row.data_quality_flag}`)
  }

  rows.push(
    '',
    '## Licensing And Use',
    '',
    '- Suitable for internal MVP analytics with source attribution.',
    '- Needs licensing review before public/commercial redistribution.',
    '- Benchmark comparisons are directional only and do not represent physical transaction price, FOB price, margin, or profit.',
    '',
  )

  return rows.join('\n')
}

async function writeArtifactFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function upsertFactRows(rows: WorldCoffeeBenchmarkRow[], chunkSize = 500) {
  if (rows.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await client.from('fact_world_coffee_benchmark').upsert(rows.slice(index, index + chunkSize), {
      onConflict: 'price_date,benchmark_name,benchmark_type,contract_code,contract_month,source_name',
    })
    if (error) {
      throw error
    }
  }
  return rows.length
}

export async function syncWorldCoffeeBenchmark(options: WorldCoffeeBenchmarkSyncOptions = {}): Promise<WorldCoffeeBenchmarkSyncResult> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const writeArtifacts = options.writeArtifacts ?? true
  const dryRun = options.dryRun ?? false
  const fetched = options.sourceRows ? { rawRows: options.sourceRows, sourceErrors: [] } : await fetchWorldCoffeeBenchmarkRows(fetchedAt)
  const transformed = buildWorldCoffeeBenchmarkRows(fetched.rawRows)
  const sourceErrors = [...fetched.sourceErrors]
  let fredObservations: FredCoffeeObservation[] = []

  if (!options.sourceRows) {
    try {
      fredObservations = await fetchFredCoffeeRobustaObservations()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sourceErrors.push(`FRED robusta cross-check fetch failed: ${message}`)
    }
  }

  const sourceFreshnessWarnings = buildSourceFreshnessWarnings(
    fetched.rawRows,
    fredObservations,
    fetchedAt.slice(0, 10),
  )
  const qc = buildWorldCoffeeBenchmarkQcReport(fetched.rawRows, transformed.rows, sourceErrors, {
    fredObservations,
    sourceFreshnessWarnings,
  })

  const rawCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'raw', 'world_coffee_benchmark_raw.csv') : null
  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'fact_world_coffee_benchmark.csv') : null
  const qcReportPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'world_coffee_benchmark_qc.md') : null
  const sourceResearchPath = writeArtifacts
    ? resolve(workspaceRoot, 'reports', 'data_quality', 'world_coffee_benchmark_source_research.md')
    : null
  const methodologyPath = writeArtifacts ? resolve(workspaceRoot, 'docs', 'methodology', 'world_coffee_benchmark_methodology.md') : null

  if (rawCsvPath) {
    await writeArtifactFile(rawCsvPath, toCsv(fetched.rawRows, RAW_COLUMNS))
  }
  if (factCsvPath) {
    await writeArtifactFile(factCsvPath, toCsv(transformed.rows, FACT_COLUMNS))
  }
  if (qcReportPath) {
    await writeArtifactFile(qcReportPath, renderWorldCoffeeBenchmarkQcMarkdown(qc, { generatedAt: new Date().toISOString() }))
  }
  if (sourceResearchPath) {
    await writeArtifactFile(sourceResearchPath, renderWorldCoffeeBenchmarkSourceResearch())
  }
  if (methodologyPath) {
    await writeArtifactFile(methodologyPath, renderWorldCoffeeBenchmarkMethodology())
  }

  const rowsPersisted = dryRun ? 0 : await upsertFactRows(transformed.rows)

  return {
    rawRows: fetched.rawRows,
    rows: transformed.rows,
    qc,
    rowsPersisted,
    artifacts: {
      rawCsvPath,
      factCsvPath,
      qcReportPath,
      sourceResearchPath,
      methodologyPath,
    },
  }
}
