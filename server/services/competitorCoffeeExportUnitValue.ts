import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mapHsToCommodity } from './hsMapping.js'
import { getSupabaseAdminClient } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export type CompetitorCoffeePeriodType = 'A' | 'M'
export type CompetitorCoffeeUnitValueFlag =
  | 'ok'
  | 'missing_value'
  | 'missing_quantity'
  | 'zero_quantity'
  | 'missing_or_unknown_quantity_unit'
  | 'low_volume_for_competitor_benchmark'
  | 'invalid_unit_value'

export type CompetitorCoffeeReporter = {
  iso: 'VNM' | 'BRA' | 'IDN'
  code: number
  country: string
}

type ComtradePreviewResponse = {
  count?: number
  data?: unknown[]
  error?: string
}

export type CompetitorComtradeRawRow = {
  typeCode?: string | null
  freqCode?: string | null
  refPeriodId?: number | string | null
  period?: string | null
  reporterCode?: number | string | null
  reporterISO?: string | null
  reporterDesc?: string | null
  partnerCode?: number | string | null
  partnerISO?: string | null
  partnerDesc?: string | null
  partner2Code?: number | string | null
  partner2ISO?: string | null
  partner2Desc?: string | null
  flowCode?: string | null
  flowDesc?: string | null
  classificationCode?: string | null
  cmdCode?: string | null
  cmdDesc?: string | null
  customsCode?: string | null
  customsDesc?: string | null
  motCode?: number | string | null
  motDesc?: string | null
  qtyUnitCode?: number | string | null
  qtyUnitAbbr?: string | null
  qty?: number | string | null
  netWgt?: number | string | null
  grossWgt?: number | string | null
  primaryValue?: number | string | null
  fobvalue?: number | string | null
  isOriginalClassification?: boolean | null
  isReported?: boolean | null
  isAggregate?: boolean | null
  [key: string]: unknown
}

type RawCompetitorCoffeeExportRow = {
  sync_run_id: string | null
  source_name: string
  source_url: string
  fetched_at: string
  query_params: Record<string, unknown>
  type_code: string
  freq_code: string
  ref_period_id: string | null
  period: string
  reporter_code: string
  reporter_iso: string
  reporter_desc: string
  partner_code: string
  partner_iso: string | null
  partner_desc: string
  partner2_code: string | null
  partner2_iso: string | null
  partner2_desc: string | null
  flow_code: string
  flow_desc: string
  classification_code: string | null
  cmd_code: string
  cmd_desc: string | null
  customs_code: string | null
  customs_desc: string | null
  mot_code: number | null
  mot_desc: string | null
  qty_unit_code: string | null
  qty_unit_abbr: string | null
  qty: number | null
  net_wgt_kg: number | null
  gross_wgt_kg: number | null
  trade_value_usd: number | null
  is_original_classification: boolean | null
  is_reported: boolean | null
  is_aggregate: boolean | null
  raw_payload: Record<string, unknown>
}

export type CompetitorCoffeeExportUnitValueRow = {
  period_type: CompetitorCoffeePeriodType
  period_start: string
  period_label: string
  reporter_country: string
  reporter_iso: string
  partner_country: string
  partner_iso: string | null
  flow: string
  commodity_group: string
  analysis_bucket: string
  hs6: string
  hs_description: string | null
  export_value_usd: number | null
  export_quantity_ton: number | null
  export_unit_value_usd_per_ton: number | null
  tracked_reporter_share_by_value_pct: number | null
  tracked_reporter_share_by_quantity_pct: number | null
  rank_by_value_in_partner_market: number | null
  rank_by_unit_value_in_partner_market: number | null
  data_quality_flag: Exclude<CompetitorCoffeeUnitValueFlag, 'low_volume_for_competitor_benchmark'>
  unit_value_flag: CompetitorCoffeeUnitValueFlag
  confidence_score: number
  notes: string
  source_name: string
  source_url: string
  fetched_at: string
}

export type CompetitorCoffeeBenchmarkByMarketRow = {
  period_type: CompetitorCoffeePeriodType
  period_start: string
  period_label: string
  partner_country: string
  partner_iso: string | null
  vietnam_unit_value_usd_per_ton: number | null
  brazil_unit_value_usd_per_ton: number | null
  indonesia_unit_value_usd_per_ton: number | null
  vietnam_value_usd: number | null
  brazil_value_usd: number | null
  indonesia_value_usd: number | null
  vietnam_quantity_ton: number | null
  brazil_quantity_ton: number | null
  indonesia_quantity_ton: number | null
  vietnam_unit_value_flag: CompetitorCoffeeUnitValueFlag | null
  brazil_unit_value_flag: CompetitorCoffeeUnitValueFlag | null
  indonesia_unit_value_flag: CompetitorCoffeeUnitValueFlag | null
  min_confidence_score: number | null
  vietnam_vs_brazil_gap_pct: number | null
  vietnam_vs_indonesia_gap_pct: number | null
  benchmark_quality_flag: 'ok' | 'missing_vietnam' | 'missing_competitors' | 'vietnam_low_quality' | 'competitor_low_quality'
  interpretation_note: string
}

export type CompetitorCoffeePreparedRows = {
  rawRows: RawCompetitorCoffeeExportRow[]
  factRows: CompetitorCoffeeExportUnitValueRow[]
  rawRowsFetched: number
  rawRowsPrepared: number
  factRowsPrepared: number
  excludedRows: number
  aggregatePartnerRowsExcluded: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  suppressedIncompletePeriodLabels: string[]
  suppressedIncompleteFactRows: number
  unitDistribution: Record<string, number>
  availablePeriodLabels: string[]
  qc: CompetitorCoffeeExportUnitValueQcReport
}

export type CompetitorCoffeeExportUnitValueQcReport = {
  rawRowsFetched: number
  rawRowsPrepared: number
  factRowsPrepared: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  suppressedIncompletePeriodLabels: string[]
  suppressedIncompleteFactRows: number
  aggregatePartnerRowsExcluded: number
  worldPartnerFactRows: number
  missingValueRows: number
  missingQuantityRows: number
  zeroQuantityRows: number
  unknownQuantityUnitRows: number
  invalidUnitValueRows: number
  lowVolumeRows: number
  flagCounts: Record<CompetitorCoffeeUnitValueFlag, number>
  unitDistribution: Record<string, number>
  reporterCoverage: Record<string, number>
  benchmarkCoverage: Array<{
    periodLabel: string
    vietnamMarkets: number
    marketsWithBrazil: number
    marketsWithIndonesia: number
    okBenchmarkMarkets: number
  }>
  latestPeriodLabel: string | null
  topHighestUnitValues: CompetitorCoffeeExportUnitValueRow[]
  topLowestUnitValues: CompetitorCoffeeExportUnitValueRow[]
  lowVolumeExamples: CompetitorCoffeeExportUnitValueRow[]
}

export type CompetitorCoffeeSyncOptions = {
  periodType?: CompetitorCoffeePeriodType
  fromYear?: number
  toYear?: number
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  requestChunkSize?: number
  fetchedAt?: string
  sourceRows?: CompetitorComtradeRawRow[]
  suppressIncompleteBenchmarkPeriods?: boolean
}

export type CompetitorCoffeeSyncResult = {
  periodType: CompetitorCoffeePeriodType
  requestedPeriods: string[]
  sourceName: string
  sourceUrl: string
  fetchedAt: string
  requestCount: number
  rawRowsFetched: number
  rawRowsPrepared: number
  rawRowsPersisted: number
  factRowsPrepared: number
  factRowsPersisted: number
  excludedRows: number
  aggregatePartnerRowsExcluded: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  suppressedIncompletePeriodLabels: string[]
  suppressedIncompleteFactRows: number
  availablePeriodLabels: string[]
  unitDistribution: Record<string, number>
  qc: CompetitorCoffeeExportUnitValueQcReport
  rows: CompetitorCoffeeExportUnitValueRow[]
  benchmarkRows: CompetitorCoffeeBenchmarkByMarketRow[]
  artifacts: {
    rawCsvPaths: Record<string, string> | null
    factCsvPath: string | null
    benchmarkCsvPath: string | null
    qcReportPath: string | null
    methodologyPath: string | null
  }
}

type QuantityNormalizationResult = {
  quantityTon: number | null
  quantitySource: 'net_wgt_kg' | 'qty_kg' | 'qty_ton' | 'unknown'
}

type AggregationBucket = {
  period_type: CompetitorCoffeePeriodType
  period_start: string
  period_label: string
  reporter_country: string
  reporter_iso: string
  partner_country: string
  partner_iso: string | null
  flow: string
  commodity_group: string
  analysis_bucket: string
  hs6: string
  hs_description: string | null
  source_name: string
  source_url: string
  fetched_at: string
  valueSum: number
  valueCount: number
  quantitySum: number
  quantityCount: number
  quantitySources: Set<QuantityNormalizationResult['quantitySource']>
  qualityFlags: Set<Exclude<CompetitorCoffeeUnitValueFlag, 'low_volume_for_competitor_benchmark'>>
}

const COMTRADE_PREVIEW_BASE_URL = 'https://comtradeapi.un.org/public/v1/preview'
const SOURCE_NAME = 'UN Comtrade'
const HS6_CODE = '090111'
const FLOW_CODE = 'X'
const FLOW_LABEL = 'Export'
const COMMODITY_GROUP = 'coffee'
const ANALYSIS_BUCKET = 'coffee_raw_core'
const LOW_VOLUME_TON_THRESHOLD = 50
const INTERPRETATION_NOTE =
  'Benchmark signal only; export unit values are not transaction prices, invoice prices, FOB contract prices, margins, or profit.'
const REPORTERS: CompetitorCoffeeReporter[] = [
  { iso: 'VNM', code: 704, country: 'Vietnam' },
  { iso: 'BRA', code: 76, country: 'Brazil' },
  { iso: 'IDN', code: 360, country: 'Indonesia' },
]

const RAW_COLUMNS: Array<keyof RawCompetitorCoffeeExportRow> = [
  'sync_run_id',
  'source_name',
  'source_url',
  'fetched_at',
  'query_params',
  'type_code',
  'freq_code',
  'ref_period_id',
  'period',
  'reporter_code',
  'reporter_iso',
  'reporter_desc',
  'partner_code',
  'partner_iso',
  'partner_desc',
  'partner2_code',
  'partner2_iso',
  'partner2_desc',
  'flow_code',
  'flow_desc',
  'classification_code',
  'cmd_code',
  'cmd_desc',
  'customs_code',
  'customs_desc',
  'mot_code',
  'mot_desc',
  'qty_unit_code',
  'qty_unit_abbr',
  'qty',
  'net_wgt_kg',
  'gross_wgt_kg',
  'trade_value_usd',
  'is_original_classification',
  'is_reported',
  'is_aggregate',
  'raw_payload',
]

const FACT_COLUMNS: Array<keyof CompetitorCoffeeExportUnitValueRow> = [
  'period_type',
  'period_start',
  'period_label',
  'reporter_country',
  'reporter_iso',
  'partner_country',
  'partner_iso',
  'flow',
  'commodity_group',
  'analysis_bucket',
  'hs6',
  'hs_description',
  'export_value_usd',
  'export_quantity_ton',
  'export_unit_value_usd_per_ton',
  'tracked_reporter_share_by_value_pct',
  'tracked_reporter_share_by_quantity_pct',
  'rank_by_value_in_partner_market',
  'rank_by_unit_value_in_partner_market',
  'data_quality_flag',
  'unit_value_flag',
  'confidence_score',
  'notes',
  'source_name',
  'source_url',
  'fetched_at',
]

const BENCHMARK_COLUMNS: Array<keyof CompetitorCoffeeBenchmarkByMarketRow> = [
  'period_type',
  'period_start',
  'period_label',
  'partner_country',
  'partner_iso',
  'vietnam_unit_value_usd_per_ton',
  'brazil_unit_value_usd_per_ton',
  'indonesia_unit_value_usd_per_ton',
  'vietnam_value_usd',
  'brazil_value_usd',
  'indonesia_value_usd',
  'vietnam_quantity_ton',
  'brazil_quantity_ton',
  'indonesia_quantity_ton',
  'vietnam_unit_value_flag',
  'brazil_unit_value_flag',
  'indonesia_unit_value_flag',
  'min_confidence_score',
  'vietnam_vs_brazil_gap_pct',
  'vietnam_vs_indonesia_gap_pct',
  'benchmark_quality_flag',
  'interpretation_note',
]

export const COMPETITOR_COFFEE_REPORTERS = REPORTERS

function roundNumber(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

function safeTrim(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toText(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function toInteger(value: unknown) {
  const numeric = toNumber(value)
  if (numeric === null) {
    return null
  }
  const integer = Math.trunc(numeric)
  return Number.isFinite(integer) ? integer : null
}

function normalizeHs6(value: unknown) {
  return String(value ?? '').trim().padStart(6, '0')
}

function normalizeQtyUnit(unit: string | null) {
  return unit?.trim().toLowerCase() ?? null
}

function maxFetchedAt(left: string, right: string) {
  return left >= right ? left : right
}

function getLatestCompletedYear(referenceDate = new Date()) {
  return referenceDate.getUTCFullYear() - 1
}

function buildAnnualPeriods(fromYear: number, toYear: number) {
  const periods: string[] = []
  for (let year = fromYear; year <= toYear; year += 1) {
    periods.push(String(year))
  }
  return periods
}

function parsePeriodWindow(options: Pick<CompetitorCoffeeSyncOptions, 'fromYear' | 'toYear'>) {
  const latestCompletedYear = getLatestCompletedYear()
  const fromYear = Number.isFinite(options.fromYear) ? Math.trunc(options.fromYear as number) : 2020
  const toYear = Number.isFinite(options.toYear) ? Math.trunc(options.toYear as number) : latestCompletedYear
  return {
    fromYear,
    toYear: Math.min(toYear, latestCompletedYear),
  }
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function getPeriodChunks(periods: string[], requestChunkSize?: number) {
  const size = requestChunkSize && Number.isFinite(requestChunkSize) ? Math.max(1, Math.trunc(requestChunkSize)) : 4
  return chunkValues(periods, size)
}

function toComtradePreviewUrl(periodType: CompetitorCoffeePeriodType, periods: string[], reporter: CompetitorCoffeeReporter) {
  const params = new URLSearchParams({
    reporterCode: String(reporter.code),
    flowCode: FLOW_CODE,
    cmdCode: HS6_CODE,
    period: periods.join(','),
    includeDesc: 'true',
  })
  return `${COMTRADE_PREVIEW_BASE_URL}/C/${periodType}/HS?${params.toString()}`
}

function summarizePreviewQuery(periodType: CompetitorCoffeePeriodType, periods: string[], reporter: CompetitorCoffeeReporter) {
  return {
    endpoint: `${COMTRADE_PREVIEW_BASE_URL}/C/${periodType}/HS`,
    reporterCode: reporter.code,
    reporterISO: reporter.iso,
    flowCode: FLOW_CODE,
    cmdCode: HS6_CODE,
    period: periods.join(','),
    includeDesc: true,
  }
}

async function fetchComtradePreviewChunk(
  periodType: CompetitorCoffeePeriodType,
  periods: string[],
  reporter: CompetitorCoffeeReporter,
) {
  const url = toComtradePreviewUrl(periodType, periods, reporter)
  const response = await fetch(url, {
    headers: {
      'user-agent': 'nongsanvn-competitor-coffee-export-unit-value/1.0 (+https://nongsanvn.vn)',
      accept: 'application/json',
    },
  })

  const payloadText = await response.text()
  let payload: ComtradePreviewResponse | null = null
  try {
    payload = JSON.parse(payloadText) as ComtradePreviewResponse
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message = payload?.error ?? payloadText
    throw new Error(`Request failed with ${response.status}: ${message}`)
  }

  if (!payload) {
    throw new Error('UN Comtrade response was not valid JSON')
  }

  if (payload.error) {
    throw new Error(`UN Comtrade API returned error: ${payload.error}`)
  }

  return Array.isArray(payload.data) ? payload.data : []
}

export function verifyCompetitorCoffeeReporterCodes(reporters: CompetitorCoffeeReporter[] = REPORTERS) {
  const expected = new Map([
    ['VNM', 704],
    ['BRA', 76],
    ['IDN', 360],
  ])

  return reporters.map(reporter => ({
    reporter,
    ok: expected.get(reporter.iso) === reporter.code,
    expectedCode: expected.get(reporter.iso) ?? null,
  }))
}

export function normalizeCompetitorQuantityToTon(input: {
  qty: number | null
  qtyUnitAbbr: string | null
  netWeightKg: number | null
}): QuantityNormalizationResult {
  if (typeof input.netWeightKg === 'number' && Number.isFinite(input.netWeightKg)) {
    return {
      quantityTon: roundNumber(input.netWeightKg / 1000, 6),
      quantitySource: 'net_wgt_kg',
    }
  }

  if (typeof input.qty !== 'number' || !Number.isFinite(input.qty)) {
    return {
      quantityTon: null,
      quantitySource: 'unknown',
    }
  }

  const normalizedUnit = normalizeQtyUnit(input.qtyUnitAbbr)
  const tonUnits = new Set(['t', 'ton', 'tons', 'tonne', 'tonnes', 'mt', 'metric ton', 'metric tons', 'tne'])
  if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
    return {
      quantityTon: roundNumber(input.qty / 1000, 6),
      quantitySource: 'qty_kg',
    }
  }

  if (normalizedUnit && tonUnits.has(normalizedUnit)) {
    return {
      quantityTon: roundNumber(input.qty, 6),
      quantitySource: 'qty_ton',
    }
  }

  return {
    quantityTon: null,
    quantitySource: 'unknown',
  }
}

function toFactPeriod(periodType: CompetitorCoffeePeriodType, period: string | null) {
  const text = period?.trim() ?? ''
  if (periodType === 'A') {
    if (!/^\d{4}$/.test(text)) {
      return null
    }
    return {
      periodLabel: text,
      periodStart: `${text}-01-01`,
    }
  }

  if (!/^\d{6}$/.test(text)) {
    return null
  }
  const year = text.slice(0, 4)
  const month = text.slice(4, 6)
  const monthNumber = Number(month)
  if (monthNumber < 1 || monthNumber > 12) {
    return null
  }
  return {
    periodLabel: `${year}-${month}`,
    periodStart: `${year}-${month}-01`,
  }
}

function reporterFromRow(row: CompetitorComtradeRawRow) {
  const reporterCode = toInteger(row.reporterCode)
  const reporterIso = safeTrim(row.reporterISO)?.toUpperCase()
  return REPORTERS.find(reporter => reporter.code === reporterCode || reporter.iso === reporterIso) ?? null
}

function toIsoFromPartnerCode(partnerCode: string | null) {
  if (!partnerCode) {
    return null
  }
  if (partnerCode === '0') {
    return 'W00'
  }
  return `P${partnerCode}`
}

function isAggregatePartner(partnerCode: string | null, partnerIso: string | null, partnerDesc: string | null) {
  if (partnerCode === '0') {
    return true
  }
  if (partnerIso && partnerIso.toUpperCase() === 'W00') {
    return true
  }
  const text = partnerDesc?.toLowerCase().trim() ?? ''
  return text === 'world' || text === 'all' || text.includes('world')
}

function optionalIntegerMatches(value: unknown, expected: number) {
  const integer = toInteger(value)
  return integer === null || integer === expected
}

function optionalTextMatches(value: unknown, expected: string) {
  const text = safeTrim(value)
  return text === null || text === expected
}

function isTargetComtradeRow(row: CompetitorComtradeRawRow, periodType: CompetitorCoffeePeriodType) {
  const freqCode = safeTrim(row.freqCode)?.toUpperCase()
  const reporter = reporterFromRow(row)
  const flowCode = safeTrim(row.flowCode)?.toUpperCase()
  const cmdCode = normalizeHs6(row.cmdCode)

  if (freqCode !== periodType || !reporter || flowCode !== FLOW_CODE || cmdCode !== HS6_CODE) {
    return false
  }

  if (!optionalIntegerMatches(row.motCode, 0)) {
    return false
  }

  if (!optionalIntegerMatches(row.partner2Code, 0)) {
    return false
  }

  if (!optionalTextMatches(row.customsCode, 'C00')) {
    return false
  }

  return true
}

function toRawPayload(row: CompetitorComtradeRawRow) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? null]))
}

function buildRawKey(row: RawCompetitorCoffeeExportRow) {
  return [row.freq_code, row.period, row.reporter_code, row.partner_code, row.flow_code, row.cmd_code, row.source_name].join('|')
}

function buildAggregationKey(row: RawCompetitorCoffeeExportRow) {
  return [
    row.freq_code,
    row.period,
    row.reporter_iso,
    row.partner_iso ?? '',
    row.flow_desc,
    normalizeHs6(row.cmd_code),
    row.source_name,
  ].join('|')
}

function buildPartnerMarketKey(
  row: Pick<CompetitorCoffeeExportUnitValueRow, 'period_type' | 'period_label' | 'partner_iso' | 'partner_country' | 'hs6'>,
) {
  return [row.period_type, row.period_label, row.partner_iso ?? row.partner_country, row.hs6].join('|')
}

function buildFactQualityFlag(input: {
  valueUsd: number | null
  quantityTon: number | null
  quantitySource: QuantityNormalizationResult['quantitySource']
  unitValueUsdPerTon: number | null
}): Exclude<CompetitorCoffeeUnitValueFlag, 'low_volume_for_competitor_benchmark'> {
  if (input.valueUsd === null) {
    return 'missing_value'
  }
  if (input.quantityTon === null) {
    if (input.quantitySource === 'unknown') {
      return 'missing_or_unknown_quantity_unit'
    }
    return 'missing_quantity'
  }
  if (input.quantityTon === 0) {
    return 'zero_quantity'
  }
  if (input.unitValueUsdPerTon !== null && input.unitValueUsdPerTon <= 0) {
    return 'invalid_unit_value'
  }
  return 'ok'
}

function unitValueFlagForRow(row: Pick<CompetitorCoffeeExportUnitValueRow, 'data_quality_flag' | 'export_quantity_ton'>) {
  if (row.data_quality_flag !== 'ok') {
    return row.data_quality_flag
  }
  if (row.export_quantity_ton !== null && row.export_quantity_ton > 0 && row.export_quantity_ton < LOW_VOLUME_TON_THRESHOLD) {
    return 'low_volume_for_competitor_benchmark'
  }
  return 'ok'
}

function confidenceForFlag(flag: CompetitorCoffeeUnitValueFlag) {
  switch (flag) {
    case 'ok':
      return 0.82
    case 'low_volume_for_competitor_benchmark':
      return 0.55
    case 'missing_or_unknown_quantity_unit':
      return 0.4
    case 'missing_quantity':
      return 0.45
    case 'missing_value':
      return 0.35
    case 'zero_quantity':
    case 'invalid_unit_value':
      return 0.2
    default:
      return 0.35
  }
}

function buildNotes(flag: CompetitorCoffeeUnitValueFlag) {
  const notes = [
    'Export unit value is calculated as SUM(value_usd) / SUM(quantity_ton).',
    'Use as a directional competitor benchmark only; it is not a transaction price, invoice price, FOB contract price, margin, or profit.',
    'Reporter share fields are shares within Vietnam, Brazil, and Indonesia only, not global destination-market share.',
  ]
  if (flag === 'low_volume_for_competitor_benchmark') {
    notes.push(`Low-volume destination (< ${LOW_VOLUME_TON_THRESHOLD} tons); unit value can be unstable.`)
  }
  if (flag !== 'ok' && flag !== 'low_volume_for_competitor_benchmark') {
    notes.push(`Quality flag: ${flag}.`)
  }
  return notes.join(' ')
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
    return text
  }
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv<T extends Record<string, unknown>>(rows: T[], columns: string[]) {
  const header = columns.join(',')
  const body = rows.map(row => columns.map(column => csvEscape(row[column])).join(',')).join('\n')
  return `${header}\n${body}`
}

async function writeArtifactFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function upsertRowsInChunks(tableName: string, rows: Record<string, unknown>[], onConflict: string, chunkSize = 500) {
  if (rows.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }

  for (const chunk of chunkValues(rows, chunkSize)) {
    const { error } = await client.from(tableName).upsert(chunk, { onConflict })
    if (error) {
      throw error
    }
  }
  return rows.length
}

async function deleteSuppressedFactPeriods(periodLabels: string[]) {
  if (periodLabels.length === 0) {
    return 0
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return 0
  }

  const { error, count } = await client
    .from('fact_competitor_export_unit_value')
    .delete({ count: 'exact' })
    .eq('period_type', 'A')
    .eq('source_name', SOURCE_NAME)
    .eq('hs6', HS6_CODE)
    .in('period_label', periodLabels)

  if (error) {
    throw error
  }
  return count ?? 0
}

function rankRows(
  rows: CompetitorCoffeeExportUnitValueRow[],
  valueGetter: (row: CompetitorCoffeeExportUnitValueRow) => number | null,
  setter: (row: CompetitorCoffeeExportUnitValueRow, rank: number | null) => void,
) {
  const sorted = [...rows].sort((left, right) => {
    const leftValue = valueGetter(left)
    const rightValue = valueGetter(right)
    if (leftValue === null && rightValue === null) {
      return left.reporter_iso.localeCompare(right.reporter_iso)
    }
    if (leftValue === null) {
      return 1
    }
    if (rightValue === null) {
      return -1
    }
    if (rightValue !== leftValue) {
      return rightValue - leftValue
    }
    return left.reporter_iso.localeCompare(right.reporter_iso)
  })

  let previousValue: number | null | undefined
  let previousRank: number | null = null
  for (let index = 0; index < sorted.length; index += 1) {
    const value = valueGetter(sorted[index])
    if (value === null) {
      setter(sorted[index], null)
      continue
    }
    const rank: number | null = previousValue === value ? previousRank : index + 1
    setter(sorted[index], rank)
    previousValue = value
    previousRank = rank
  }
}

export function buildCompetitorCoffeeBenchmarkRows(rows: CompetitorCoffeeExportUnitValueRow[]) {
  const byPartnerMarket = new Map<string, CompetitorCoffeeExportUnitValueRow[]>()
  for (const row of rows) {
    const bucket = byPartnerMarket.get(buildPartnerMarketKey(row)) ?? []
    bucket.push(row)
    byPartnerMarket.set(buildPartnerMarketKey(row), bucket)
  }

  const benchmarkRows: CompetitorCoffeeBenchmarkByMarketRow[] = []
  for (const bucket of byPartnerMarket.values()) {
    const vietnam = bucket.find(row => row.reporter_iso === 'VNM')
    if (!vietnam) {
      continue
    }
    const brazil = bucket.find(row => row.reporter_iso === 'BRA')
    const indonesia = bucket.find(row => row.reporter_iso === 'IDN')
    const confidences = bucket.map(row => row.confidence_score).filter((value): value is number => Number.isFinite(value))
    const vietnamVsBrazil =
      vietnam.export_unit_value_usd_per_ton !== null && brazil?.export_unit_value_usd_per_ton
        ? roundNumber(100 * (vietnam.export_unit_value_usd_per_ton / brazil.export_unit_value_usd_per_ton - 1), 6)
        : null
    const vietnamVsIndonesia =
      vietnam.export_unit_value_usd_per_ton !== null && indonesia?.export_unit_value_usd_per_ton
        ? roundNumber(100 * (vietnam.export_unit_value_usd_per_ton / indonesia.export_unit_value_usd_per_ton - 1), 6)
        : null

    let benchmarkQualityFlag: CompetitorCoffeeBenchmarkByMarketRow['benchmark_quality_flag'] = 'ok'
    if (vietnam.export_unit_value_usd_per_ton === null) {
      benchmarkQualityFlag = 'missing_vietnam'
    } else if (!brazil && !indonesia) {
      benchmarkQualityFlag = 'missing_competitors'
    } else if (vietnam.unit_value_flag !== 'ok') {
      benchmarkQualityFlag = 'vietnam_low_quality'
    } else if ((brazil && brazil.unit_value_flag !== 'ok') && (indonesia && indonesia.unit_value_flag !== 'ok')) {
      benchmarkQualityFlag = 'competitor_low_quality'
    }

    benchmarkRows.push({
      period_type: vietnam.period_type,
      period_start: vietnam.period_start,
      period_label: vietnam.period_label,
      partner_country: vietnam.partner_country,
      partner_iso: vietnam.partner_iso,
      vietnam_unit_value_usd_per_ton: vietnam.export_unit_value_usd_per_ton,
      brazil_unit_value_usd_per_ton: brazil?.export_unit_value_usd_per_ton ?? null,
      indonesia_unit_value_usd_per_ton: indonesia?.export_unit_value_usd_per_ton ?? null,
      vietnam_value_usd: vietnam.export_value_usd,
      brazil_value_usd: brazil?.export_value_usd ?? null,
      indonesia_value_usd: indonesia?.export_value_usd ?? null,
      vietnam_quantity_ton: vietnam.export_quantity_ton,
      brazil_quantity_ton: brazil?.export_quantity_ton ?? null,
      indonesia_quantity_ton: indonesia?.export_quantity_ton ?? null,
      vietnam_unit_value_flag: vietnam.unit_value_flag,
      brazil_unit_value_flag: brazil?.unit_value_flag ?? null,
      indonesia_unit_value_flag: indonesia?.unit_value_flag ?? null,
      min_confidence_score: confidences.length > 0 ? roundNumber(Math.min(...confidences), 3) : null,
      vietnam_vs_brazil_gap_pct: vietnamVsBrazil,
      vietnam_vs_indonesia_gap_pct: vietnamVsIndonesia,
      benchmark_quality_flag: benchmarkQualityFlag,
      interpretation_note: INTERPRETATION_NOTE,
    })
  }

  benchmarkRows.sort((left, right) => {
    const periodSort = left.period_start.localeCompare(right.period_start)
    if (periodSort !== 0) {
      return periodSort
    }
    return left.partner_country.localeCompare(right.partner_country)
  })

  return benchmarkRows
}

export function prepareCompetitorCoffeeExportRows(
  payloadRows: unknown[],
  options: {
    periodType: CompetitorCoffeePeriodType
    fetchedAt: string
    sourceUrl: string
    sourceName?: string
    syncRunId?: string | null
    queryParams: Record<string, unknown>
    suppressIncompleteBenchmarkPeriods?: boolean
  },
): CompetitorCoffeePreparedRows {
  const sourceName = options.sourceName ?? SOURCE_NAME
  const hsMapping = mapHsToCommodity(HS6_CODE)
  const hsDescription = hsMapping?.hsDescriptionEn ?? 'Coffee; not roasted or decaffeinated'
  const rawRowsByKey = new Map<string, RawCompetitorCoffeeExportRow>()
  const aggregations = new Map<string, AggregationBucket>()
  const unitDistribution = new Map<string, number>()
  const availablePeriodLabels = new Set<string>()
  let excludedRows = 0
  let duplicateRawRowsCollapsed = 0
  let duplicateFactRowsCollapsed = 0
  let aggregatePartnerRowsExcluded = 0

  for (const item of payloadRows) {
    if (!item || typeof item !== 'object') {
      excludedRows += 1
      continue
    }
    const row = item as CompetitorComtradeRawRow
    if (!isTargetComtradeRow(row, options.periodType)) {
      excludedRows += 1
      continue
    }

    const periodRaw = safeTrim(row.period)
    const period = toFactPeriod(options.periodType, periodRaw)
    const reporter = reporterFromRow(row)
    if (!period || !periodRaw || !reporter) {
      excludedRows += 1
      continue
    }

    const partnerCode = toText(row.partnerCode)
    const partnerIso = safeTrim(row.partnerISO) ?? toIsoFromPartnerCode(partnerCode)
    const partnerDesc = safeTrim(row.partnerDesc) ?? `Partner ${partnerCode ?? 'unknown'}`
    const qty = toNumber(row.qty)
    const netWeightKg = toNumber(row.netWgt)
    const grossWeightKg = toNumber(row.grossWgt)
    const qtyUnitAbbr = safeTrim(row.qtyUnitAbbr)
    const quantityNormalized = normalizeCompetitorQuantityToTon({ qty, qtyUnitAbbr, netWeightKg })
    const valueUsd = toNumber(row.primaryValue) ?? toNumber(row.fobvalue)
    const worldAggregate = isAggregatePartner(partnerCode, partnerIso, partnerDesc)
    const rowSourceUrl = toComtradePreviewUrl(options.periodType, [periodRaw], reporter)
    const unitKey = normalizeQtyUnit(qtyUnitAbbr) ?? 'unknown'
    unitDistribution.set(unitKey, (unitDistribution.get(unitKey) ?? 0) + 1)
    availablePeriodLabels.add(period.periodLabel)

    const rawInsert: RawCompetitorCoffeeExportRow = {
      sync_run_id: options.syncRunId ?? null,
      source_name: sourceName,
      source_url: rowSourceUrl,
      fetched_at: options.fetchedAt,
      query_params: options.queryParams,
      type_code: safeTrim(row.typeCode) ?? 'C',
      freq_code: safeTrim(row.freqCode) ?? options.periodType,
      ref_period_id: toText(row.refPeriodId),
      period: periodRaw,
      reporter_code: toText(row.reporterCode) ?? String(reporter.code),
      reporter_iso: safeTrim(row.reporterISO) ?? reporter.iso,
      reporter_desc: safeTrim(row.reporterDesc) ?? reporter.country,
      partner_code: partnerCode ?? '0',
      partner_iso: partnerIso,
      partner_desc: partnerDesc,
      partner2_code: toText(row.partner2Code),
      partner2_iso: safeTrim(row.partner2ISO),
      partner2_desc: safeTrim(row.partner2Desc),
      flow_code: safeTrim(row.flowCode) ?? FLOW_CODE,
      flow_desc: safeTrim(row.flowDesc) ?? FLOW_LABEL,
      classification_code: safeTrim(row.classificationCode),
      cmd_code: normalizeHs6(row.cmdCode),
      cmd_desc: safeTrim(row.cmdDesc),
      customs_code: safeTrim(row.customsCode),
      customs_desc: safeTrim(row.customsDesc),
      mot_code: toInteger(row.motCode),
      mot_desc: safeTrim(row.motDesc),
      qty_unit_code: toText(row.qtyUnitCode),
      qty_unit_abbr: qtyUnitAbbr,
      qty,
      net_wgt_kg: netWeightKg,
      gross_wgt_kg: grossWeightKg,
      trade_value_usd: valueUsd,
      is_original_classification: row.isOriginalClassification ?? null,
      is_reported: row.isReported ?? null,
      is_aggregate: row.isAggregate ?? null,
      raw_payload: toRawPayload(row),
    }

    const rawKey = buildRawKey(rawInsert)
    if (rawRowsByKey.has(rawKey)) {
      duplicateRawRowsCollapsed += 1
    }
    rawRowsByKey.set(rawKey, rawInsert)

    if (worldAggregate) {
      aggregatePartnerRowsExcluded += 1
      continue
    }

    const unitValueUsdPerTon =
      valueUsd !== null && quantityNormalized.quantityTon !== null && quantityNormalized.quantityTon !== 0
        ? valueUsd / quantityNormalized.quantityTon
        : null
    const dataQualityFlag = buildFactQualityFlag({
      valueUsd,
      quantityTon: quantityNormalized.quantityTon,
      quantitySource: quantityNormalized.quantitySource,
      unitValueUsdPerTon,
    })
    const aggregationKey = buildAggregationKey(rawInsert)
    const existing = aggregations.get(aggregationKey)
    if (!existing) {
      aggregations.set(aggregationKey, {
        period_type: options.periodType,
        period_start: period.periodStart,
        period_label: period.periodLabel,
        reporter_country: reporter.country,
        reporter_iso: reporter.iso,
        partner_country: partnerDesc,
        partner_iso: partnerIso,
        flow: FLOW_LABEL,
        commodity_group: COMMODITY_GROUP,
        analysis_bucket: ANALYSIS_BUCKET,
        hs6: HS6_CODE,
        hs_description: hsDescription,
        source_name: sourceName,
        source_url: rowSourceUrl,
        fetched_at: options.fetchedAt,
        valueSum: valueUsd ?? 0,
        valueCount: valueUsd === null ? 0 : 1,
        quantitySum: quantityNormalized.quantityTon ?? 0,
        quantityCount: quantityNormalized.quantityTon === null ? 0 : 1,
        quantitySources: new Set([quantityNormalized.quantitySource]),
        qualityFlags: new Set([dataQualityFlag]),
      })
      continue
    }

    duplicateFactRowsCollapsed += 1
    if (valueUsd !== null) {
      existing.valueSum += valueUsd
      existing.valueCount += 1
    }
    if (quantityNormalized.quantityTon !== null) {
      existing.quantitySum += quantityNormalized.quantityTon
      existing.quantityCount += 1
    }
    existing.quantitySources.add(quantityNormalized.quantitySource)
    existing.qualityFlags.add(dataQualityFlag)
    existing.fetched_at = maxFetchedAt(existing.fetched_at, options.fetchedAt)
  }

  const factRowsBeforeCompletenessGuard = [...aggregations.values()].map(bucket => {
    const exportValueUsd = bucket.valueCount > 0 ? roundNumber(bucket.valueSum, 6) : null
    const exportQuantityTon = bucket.quantityCount > 0 ? roundNumber(bucket.quantitySum, 6) : null
    const exportUnitValueUsdPerTon =
      exportValueUsd !== null && exportQuantityTon !== null && exportQuantityTon !== 0
        ? roundNumber(exportValueUsd / exportQuantityTon, 6)
        : null
    const dataQualityFlag = [...bucket.qualityFlags].includes('missing_value')
      ? 'missing_value'
      : [...bucket.qualityFlags].includes('missing_or_unknown_quantity_unit')
        ? 'missing_or_unknown_quantity_unit'
        : [...bucket.qualityFlags].includes('missing_quantity')
          ? 'missing_quantity'
          : [...bucket.qualityFlags].includes('zero_quantity')
            ? 'zero_quantity'
            : [...bucket.qualityFlags].includes('invalid_unit_value')
              ? 'invalid_unit_value'
              : 'ok'
    const unitValueFlag = unitValueFlagForRow({ data_quality_flag: dataQualityFlag, export_quantity_ton: exportQuantityTon })

    return {
      period_type: bucket.period_type,
      period_start: bucket.period_start,
      period_label: bucket.period_label,
      reporter_country: bucket.reporter_country,
      reporter_iso: bucket.reporter_iso,
      partner_country: bucket.partner_country,
      partner_iso: bucket.partner_iso,
      flow: bucket.flow,
      commodity_group: bucket.commodity_group,
      analysis_bucket: bucket.analysis_bucket,
      hs6: bucket.hs6,
      hs_description: bucket.hs_description,
      export_value_usd: exportValueUsd,
      export_quantity_ton: exportQuantityTon,
      export_unit_value_usd_per_ton: exportUnitValueUsdPerTon,
      tracked_reporter_share_by_value_pct: null,
      tracked_reporter_share_by_quantity_pct: null,
      rank_by_value_in_partner_market: null,
      rank_by_unit_value_in_partner_market: null,
      data_quality_flag: dataQualityFlag,
      unit_value_flag: unitValueFlag,
      confidence_score: confidenceForFlag(unitValueFlag),
      notes: buildNotes(unitValueFlag),
      source_name: bucket.source_name,
      source_url: bucket.source_url,
      fetched_at: bucket.fetched_at,
    } satisfies CompetitorCoffeeExportUnitValueRow
  })

  const reportersByPeriod = new Map<string, Set<string>>()
  for (const row of factRowsBeforeCompletenessGuard) {
    const reporters = reportersByPeriod.get(row.period_label) ?? new Set<string>()
    reporters.add(row.reporter_iso)
    reportersByPeriod.set(row.period_label, reporters)
  }
  const suppressIncompleteBenchmarkPeriods = options.suppressIncompleteBenchmarkPeriods ?? true
  const suppressedIncompletePeriodLabels = suppressIncompleteBenchmarkPeriods
    ? [...reportersByPeriod.entries()]
        .filter(([, reporters]) => !reporters.has('VNM'))
        .map(([periodLabel]) => periodLabel)
        .sort()
    : []
  const suppressedPeriods = new Set(suppressedIncompletePeriodLabels)
  const factRows = factRowsBeforeCompletenessGuard.filter(row => !suppressedPeriods.has(row.period_label))
  const suppressedIncompleteFactRows = factRowsBeforeCompletenessGuard.length - factRows.length

  const rowsByPartnerMarket = new Map<string, CompetitorCoffeeExportUnitValueRow[]>()
  for (const row of factRows) {
    const key = buildPartnerMarketKey(row)
    const bucket = rowsByPartnerMarket.get(key) ?? []
    bucket.push(row)
    rowsByPartnerMarket.set(key, bucket)
  }

  for (const marketRows of rowsByPartnerMarket.values()) {
    const totalValue = marketRows.reduce((sum, row) => sum + (row.export_value_usd ?? 0), 0)
    const totalQuantity = marketRows.reduce((sum, row) => sum + (row.export_quantity_ton ?? 0), 0)
    for (const row of marketRows) {
      row.tracked_reporter_share_by_value_pct =
        row.export_value_usd !== null && totalValue > 0 ? roundNumber((100 * row.export_value_usd) / totalValue, 6) : null
      row.tracked_reporter_share_by_quantity_pct =
        row.export_quantity_ton !== null && totalQuantity > 0 ? roundNumber((100 * row.export_quantity_ton) / totalQuantity, 6) : null
    }
    rankRows(marketRows, row => row.export_value_usd, (row, rank) => {
      row.rank_by_value_in_partner_market = rank
    })
    rankRows(marketRows, row => row.export_unit_value_usd_per_ton, (row, rank) => {
      row.rank_by_unit_value_in_partner_market = rank
    })
  }

  factRows.sort((left, right) => {
    const periodSort = left.period_start.localeCompare(right.period_start)
    if (periodSort !== 0) {
      return periodSort
    }
    const partnerSort = left.partner_country.localeCompare(right.partner_country)
    if (partnerSort !== 0) {
      return partnerSort
    }
    return left.reporter_iso.localeCompare(right.reporter_iso)
  })

  const rawRows = [...rawRowsByKey.values()]
  const qc = buildCompetitorCoffeeExportUnitValueQcReport({
    rawRowsFetched: payloadRows.length,
    rawRowsPrepared: rawRows.length,
    factRows,
    duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed,
    suppressedIncompletePeriodLabels,
    suppressedIncompleteFactRows,
    aggregatePartnerRowsExcluded,
    unitDistribution: Object.fromEntries([...unitDistribution.entries()].sort()),
  })

  return {
    rawRows,
    factRows,
    rawRowsFetched: payloadRows.length,
    rawRowsPrepared: rawRows.length,
    factRowsPrepared: factRows.length,
    excludedRows,
    aggregatePartnerRowsExcluded,
    duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed,
    suppressedIncompletePeriodLabels,
    suppressedIncompleteFactRows,
    unitDistribution: Object.fromEntries([...unitDistribution.entries()].sort()),
    availablePeriodLabels: [...availablePeriodLabels].sort(),
    qc,
  }
}

export function buildCompetitorCoffeeExportUnitValueQcReport(input: {
  rawRowsFetched: number
  rawRowsPrepared: number
  factRows: CompetitorCoffeeExportUnitValueRow[]
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  suppressedIncompletePeriodLabels: string[]
  suppressedIncompleteFactRows: number
  aggregatePartnerRowsExcluded: number
  unitDistribution: Record<string, number>
}): CompetitorCoffeeExportUnitValueQcReport {
  const flagCounts: Record<CompetitorCoffeeUnitValueFlag, number> = {
    ok: 0,
    missing_value: 0,
    missing_quantity: 0,
    zero_quantity: 0,
    missing_or_unknown_quantity_unit: 0,
    low_volume_for_competitor_benchmark: 0,
    invalid_unit_value: 0,
  }
  const reporterCoverage: Record<string, number> = {}
  for (const row of input.factRows) {
    flagCounts[row.unit_value_flag] += 1
    reporterCoverage[row.reporter_iso] = (reporterCoverage[row.reporter_iso] ?? 0) + 1
  }

  const benchmarkRows = buildCompetitorCoffeeBenchmarkRows(input.factRows)
  const coverageByPeriod = new Map<string, CompetitorCoffeeBenchmarkByMarketRow[]>()
  for (const row of benchmarkRows) {
    const bucket = coverageByPeriod.get(row.period_label) ?? []
    bucket.push(row)
    coverageByPeriod.set(row.period_label, bucket)
  }
  const benchmarkCoverage = [...coverageByPeriod.entries()]
    .map(([periodLabel, rows]) => ({
      periodLabel,
      vietnamMarkets: rows.length,
      marketsWithBrazil: rows.filter(row => row.brazil_unit_value_usd_per_ton !== null).length,
      marketsWithIndonesia: rows.filter(row => row.indonesia_unit_value_usd_per_ton !== null).length,
      okBenchmarkMarkets: rows.filter(row => row.benchmark_quality_flag === 'ok').length,
    }))
    .sort((left, right) => left.periodLabel.localeCompare(right.periodLabel))

  const worldPartnerFactRows = input.factRows.filter(row => isAggregatePartner(null, row.partner_iso, row.partner_country)).length
  const topHighestUnitValues = input.factRows
    .filter(row => row.export_unit_value_usd_per_ton !== null)
    .sort((left, right) => (right.export_unit_value_usd_per_ton ?? 0) - (left.export_unit_value_usd_per_ton ?? 0))
    .slice(0, 20)
  const topLowestUnitValues = input.factRows
    .filter(row => row.export_unit_value_usd_per_ton !== null)
    .sort((left, right) => (left.export_unit_value_usd_per_ton ?? 0) - (right.export_unit_value_usd_per_ton ?? 0))
    .slice(0, 20)
  const lowVolumeExamples = input.factRows
    .filter(row => row.unit_value_flag === 'low_volume_for_competitor_benchmark')
    .sort((left, right) => (left.export_quantity_ton ?? 0) - (right.export_quantity_ton ?? 0))
    .slice(0, 20)

  return {
    rawRowsFetched: input.rawRowsFetched,
    rawRowsPrepared: input.rawRowsPrepared,
    factRowsPrepared: input.factRows.length,
    duplicateRawRowsCollapsed: input.duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed: input.duplicateFactRowsCollapsed,
    suppressedIncompletePeriodLabels: input.suppressedIncompletePeriodLabels,
    suppressedIncompleteFactRows: input.suppressedIncompleteFactRows,
    aggregatePartnerRowsExcluded: input.aggregatePartnerRowsExcluded,
    worldPartnerFactRows,
    missingValueRows: flagCounts.missing_value,
    missingQuantityRows: flagCounts.missing_quantity,
    zeroQuantityRows: flagCounts.zero_quantity,
    unknownQuantityUnitRows: flagCounts.missing_or_unknown_quantity_unit,
    invalidUnitValueRows: flagCounts.invalid_unit_value,
    lowVolumeRows: flagCounts.low_volume_for_competitor_benchmark,
    flagCounts,
    unitDistribution: input.unitDistribution,
    reporterCoverage,
    benchmarkCoverage,
    latestPeriodLabel: input.factRows.map(row => row.period_label).sort().at(-1) ?? null,
    topHighestUnitValues,
    topLowestUnitValues,
    lowVolumeExamples,
  }
}

export function renderCompetitorCoffeeExportUnitValueQcMarkdown(
  report: CompetitorCoffeeExportUnitValueQcReport,
  options: { generatedAt: string },
) {
  const rows = [
    '# QC Report - Competitor Coffee Export Unit Value',
    '',
    `Generated at: ${options.generatedAt}`,
    '',
    '## Scope',
    '',
    '- Reporters: Vietnam (VNM), Brazil (BRA), Indonesia (IDN)',
    '- Flow: Export',
    '- HS6: 090111 (coffee, not roasted or decaffeinated)',
    '- Period type: annual',
    '- Aggregate partner rows such as World are excluded from benchmark facts and views.',
    '',
    '## Row Counts',
    '',
    `- Raw rows fetched: ${report.rawRowsFetched}`,
    `- Raw rows prepared: ${report.rawRowsPrepared}`,
    `- Fact rows prepared: ${report.factRowsPrepared}`,
    `- Duplicate raw grain rows collapsed: ${report.duplicateRawRowsCollapsed}`,
    `- Duplicate fact grain rows collapsed: ${report.duplicateFactRowsCollapsed}`,
    `- Suppressed incomplete benchmark periods: ${report.suppressedIncompletePeriodLabels.length}`,
    `- Suppressed incomplete fact rows: ${report.suppressedIncompleteFactRows}`,
    `- Aggregate partner rows excluded: ${report.aggregatePartnerRowsExcluded}`,
    `- World partner fact rows after exclusion: ${report.worldPartnerFactRows}`,
    '',
    '## Reporter Coverage',
    '',
  ]

  for (const reporter of REPORTERS) {
    rows.push(`- ${reporter.iso}: ${report.reporterCoverage[reporter.iso] ?? 0} fact rows`)
  }

  rows.push('', '## Completeness Guard', '')
  if (report.suppressedIncompletePeriodLabels.length === 0) {
    rows.push('- No periods were suppressed by the Vietnam coverage guard.')
  } else {
    rows.push(
      `- Suppressed periods: ${report.suppressedIncompletePeriodLabels.join(', ')}`,
      '- These periods had tracked reporter data but no Vietnam fact rows, so they are omitted from public benchmark facts and summaries by default.',
    )
  }

  rows.push('', '## Unit Distribution', '')
  for (const [unit, count] of Object.entries(report.unitDistribution)) {
    rows.push(`- ${unit}: ${count}`)
  }

  rows.push('', '## Unit Value Flags', '')
  for (const [flag, count] of Object.entries(report.flagCounts)) {
    rows.push(`- ${flag}: ${count}`)
  }

  rows.push('', '## Missing And Invalid Checks', '')
  rows.push(
    `- Missing value rows: ${report.missingValueRows}`,
    `- Missing quantity rows: ${report.missingQuantityRows}`,
    `- Unknown quantity unit rows: ${report.unknownQuantityUnitRows}`,
    `- Zero quantity rows: ${report.zeroQuantityRows}`,
    `- Invalid unit value rows: ${report.invalidUnitValueRows}`,
    `- Low-volume rows: ${report.lowVolumeRows}`,
  )

  rows.push('', '## Benchmark Coverage', '')
  if (report.benchmarkCoverage.length === 0) {
    rows.push('- No benchmark rows available')
  } else {
    for (const item of report.benchmarkCoverage) {
      rows.push(
        `- ${item.periodLabel}: vietnam_markets=${item.vietnamMarkets} | with_brazil=${item.marketsWithBrazil} | with_indonesia=${item.marketsWithIndonesia} | ok=${item.okBenchmarkMarkets}`,
      )
    }
  }

  rows.push('', '## Top 20 Highest Unit Values', '')
  for (const row of report.topHighestUnitValues) {
    rows.push(
      `- ${row.period_label} | ${row.reporter_iso} -> ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | value_usd=${row.export_value_usd ?? 'n/a'} | quantity_ton=${row.export_quantity_ton ?? 'n/a'} | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'} | flag=${row.unit_value_flag}`,
    )
  }

  rows.push('', '## Top 20 Lowest Unit Values', '')
  for (const row of report.topLowestUnitValues) {
    rows.push(
      `- ${row.period_label} | ${row.reporter_iso} -> ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | value_usd=${row.export_value_usd ?? 'n/a'} | quantity_ton=${row.export_quantity_ton ?? 'n/a'} | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'} | flag=${row.unit_value_flag}`,
    )
  }

  rows.push('', '## Low-Volume Rows', '')
  for (const row of report.lowVolumeExamples) {
    rows.push(
      `- ${row.period_label} | ${row.reporter_iso} -> ${row.partner_country} (${row.partner_iso ?? 'n/a'}) | quantity_ton=${row.export_quantity_ton ?? 'n/a'} | unit_value_usd_per_ton=${row.export_unit_value_usd_per_ton ?? 'n/a'}`,
    )
  }

  rows.push(
    '',
    '## Interpretation And Limitations',
    '',
    '- Export unit value is calculated as SUM(value_usd) / SUM(quantity_ton); row-level unit values are never averaged.',
    '- Same HS 090111 does not guarantee the same product mix, grade, Robusta/Arabica split, certification, or specialty share.',
    '- Unit value is not a transaction price, invoice price, FOB contract price, margin, or profit.',
    '- Brazil and Arabica-heavy origins can show structural premiums unrelated to Vietnam competitiveness.',
    '- Comtrade data can lag or be revised; latest completed year may still be incomplete across reporters.',
    `- Low-volume destinations below ${LOW_VOLUME_TON_THRESHOLD} tons remain flagged because they can produce extreme unit values.`,
    '- Share fields are tracked-reporter shares for Vietnam, Brazil, and Indonesia only, not global market share.',
    '',
  )

  return rows.join('\n')
}

export function renderCompetitorCoffeeExportUnitValueMethodology() {
  return [
    '# Competitor Export Unit Value Methodology',
    '',
    '## Scope',
    '',
    '- Reporters: Vietnam (VNM), Brazil (BRA), Indonesia (IDN)',
    '- Flow: Export',
    '- HS6: 090111 (coffee, not roasted or decaffeinated)',
    '- Frequency: annual in v1',
    '- Source: UN Comtrade public preview endpoint; optional primary key use is reserved for completeness issues.',
    '',
    '## Formula',
    '',
    '`export_unit_value_usd_per_ton = SUM(value_usd) / SUM(quantity_ton)`',
    '',
    'The transform never averages row-level unit values. Quantity is converted to metric tons using net weight in kg first, then quantity units when net weight is unavailable.',
    '',
    '## Grain',
    '',
    '`period_type + period_label + reporter_iso + partner_iso + flow + hs6 + source_name`',
    '',
    '## Flags',
    '',
    '- `missing_value`: trade value is absent.',
    '- `missing_quantity`: quantity cannot be derived even though a known quantity source exists.',
    '- `missing_or_unknown_quantity_unit`: quantity unit is absent or unsupported and net weight is unavailable.',
    '- `zero_quantity`: quantity equals zero.',
    '- `invalid_unit_value`: calculated unit value is less than or equal to zero.',
    `- \`low_volume_for_competitor_benchmark\`: quantity is below ${LOW_VOLUME_TON_THRESHOLD} tons.`,
    '',
    '## Benchmark Views',
    '',
    '- Vietnam is compared to Brazil and Indonesia by destination market and period.',
    '- Reporter share fields are shares within the tracked reporter set only, not global destination-market share.',
    '- Comparison text must remain cautious: directional benchmark only, not transaction price, FOB price, margin, or profit.',
    '',
    '## Limitations',
    '',
    '- Same HS 090111 can contain different origins, grades, certified products, and Robusta/Arabica mixes.',
    '- Brazil can show structural Arabica premiums that are not direct evidence of Vietnam competitiveness.',
    '- Comtrade data can lag or be revised after initial publication.',
    '- Monthly data is deferred until annual QC is stable.',
    '- Low-volume destinations can generate extreme unit values and must remain flagged.',
    '',
  ].join('\n')
}

export async function syncCompetitorCoffeeExportUnitValue(
  options: CompetitorCoffeeSyncOptions = {},
): Promise<CompetitorCoffeeSyncResult> {
  const periodType = options.periodType ?? 'A'
  if (periodType !== 'A') {
    throw new Error('Step 6 v1 supports annual period type A only. Monthly data is deferred until annual QC is stable.')
  }

  const periodWindow = parsePeriodWindow(options)
  const periods = buildAnnualPeriods(periodWindow.fromYear, periodWindow.toYear)
  const periodChunks = getPeriodChunks(periods, options.requestChunkSize)
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const sourceUrl = toComtradePreviewUrl(periodType, periods, REPORTERS[0])
  const queryParams = {
    reporters: REPORTERS.map(reporter => summarizePreviewQuery(periodType, periods, reporter)),
  }
  let requestCount = 0
  const payloadRows: unknown[] = []

  if (options.sourceRows) {
    payloadRows.push(...options.sourceRows)
  } else {
    for (const reporter of REPORTERS) {
      for (const chunk of periodChunks) {
        const rows = await retryTransient(() => fetchComtradePreviewChunk(periodType, chunk, reporter), {
          attempts: 5,
          initialDelayMs: 800,
        })
        payloadRows.push(...rows)
        requestCount += 1
      }
    }
  }

  const prepared = prepareCompetitorCoffeeExportRows(payloadRows, {
    periodType,
    fetchedAt,
    sourceUrl,
    queryParams,
    suppressIncompleteBenchmarkPeriods: options.suppressIncompleteBenchmarkPeriods,
  })
  const benchmarkRows = buildCompetitorCoffeeBenchmarkRows(prepared.factRows)
  const shouldPersist = !dryRun && Boolean(getSupabaseAdminClient())

  const rawCsvPaths = writeArtifacts
    ? Object.fromEntries(REPORTERS.map(reporter => [reporter.iso, resolve(workspaceRoot, 'data', 'raw', 'un_comtrade', `coffee_export_${reporter.iso}_090111.csv`)]))
    : null
  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'fact_competitor_export_unit_value.csv') : null
  const benchmarkCsvPath = writeArtifacts
    ? resolve(workspaceRoot, 'data', 'processed', 'vw_coffee_competitor_benchmark_by_market.csv')
    : null
  const qcReportPath = writeArtifacts
    ? resolve(workspaceRoot, 'reports', 'data_quality', 'competitor_export_unit_value_qc.md')
    : null
  const methodologyPath = writeArtifacts
    ? resolve(workspaceRoot, 'docs', 'methodology', 'competitor_export_unit_value_methodology.md')
    : null

  if (rawCsvPaths) {
    for (const reporter of REPORTERS) {
      const rows = prepared.rawRows.filter(row => row.reporter_iso === reporter.iso)
      await writeArtifactFile(rawCsvPaths[reporter.iso], toCsv(rows, RAW_COLUMNS))
    }
  }
  if (factCsvPath) {
    await writeArtifactFile(factCsvPath, toCsv(prepared.factRows, FACT_COLUMNS))
  }
  if (benchmarkCsvPath) {
    await writeArtifactFile(benchmarkCsvPath, toCsv(benchmarkRows, BENCHMARK_COLUMNS))
  }
  if (qcReportPath) {
    await writeArtifactFile(qcReportPath, renderCompetitorCoffeeExportUnitValueQcMarkdown(prepared.qc, { generatedAt: fetchedAt }))
  }
  if (methodologyPath) {
    await writeArtifactFile(methodologyPath, renderCompetitorCoffeeExportUnitValueMethodology())
  }

  let rawRowsPersisted = 0
  let factRowsPersisted = 0
  let suppressedFactRowsDeleted = 0
  if (shouldPersist) {
    rawRowsPersisted = await upsertRowsInChunks(
      'raw_un_comtrade_coffee_exports_multi_reporter',
      prepared.rawRows,
      'freq_code,period,reporter_code,partner_code,flow_code,cmd_code,source_name',
    )
    factRowsPersisted = await upsertRowsInChunks(
      'fact_competitor_export_unit_value',
      prepared.factRows,
      'period_type,period_label,reporter_iso,partner_iso,flow,hs6,source_name',
    )
    suppressedFactRowsDeleted = await deleteSuppressedFactPeriods(prepared.suppressedIncompletePeriodLabels)
  }

  return {
    periodType,
    requestedPeriods: periods,
    sourceName: SOURCE_NAME,
    sourceUrl,
    fetchedAt,
    requestCount,
    rawRowsFetched: prepared.rawRowsFetched,
    rawRowsPrepared: prepared.rawRowsPrepared,
    rawRowsPersisted,
    factRowsPrepared: prepared.factRowsPrepared,
    factRowsPersisted,
    excludedRows: prepared.excludedRows,
    aggregatePartnerRowsExcluded: prepared.aggregatePartnerRowsExcluded,
    duplicateRawRowsCollapsed: prepared.duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed: prepared.duplicateFactRowsCollapsed,
    suppressedIncompletePeriodLabels: prepared.suppressedIncompletePeriodLabels,
    suppressedIncompleteFactRows: prepared.suppressedIncompleteFactRows + suppressedFactRowsDeleted,
    availablePeriodLabels: prepared.availablePeriodLabels,
    unitDistribution: prepared.unitDistribution,
    qc: prepared.qc,
    rows: prepared.factRows,
    benchmarkRows,
    artifacts: {
      rawCsvPaths,
      factCsvPath,
      benchmarkCsvPath,
      qcReportPath,
      methodologyPath,
    },
  }
}
