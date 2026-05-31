import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mapHsToCommodity } from './hsMapping.js'
import { getSupabaseAdminClient } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export type MirrorImportPeriodType = 'A' | 'M'

export type MirrorImportUnitValueFlag =
  | 'ok'
  | 'missing_value'
  | 'missing_quantity'
  | 'zero_or_invalid_quantity'
  | 'invalid_value'
  | 'low_volume'
  | 'aggregate_reporter'
  | 'aggregate_partner'
  | 'missing_or_unknown_quantity_unit'

export type MirrorGapFlag =
  | 'ok'
  | 'missing_export_unit_value'
  | 'missing_import_unit_value'
  | 'missing_quantity'
  | 'low_volume'
  | 'large_mirror_gap'
  | 'large_quantity_gap'

export type MirrorImporter = {
  iso: 'DEU' | 'USA' | 'ITA' | 'JPN' | 'KOR' | 'BEL' | 'ESP' | 'NLD' | 'FRA' | 'GBR'
  code: number
  country: string
}

type ComtradePreviewResponse = {
  count?: number
  data?: unknown[]
  error?: string
}

export type MirrorComtradeRawRow = {
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
  flowCode?: string | null
  flowDesc?: string | null
  classificationCode?: string | null
  cmdCode?: string | null
  cmdDesc?: string | null
  qtyUnitCode?: number | string | null
  qtyUnitAbbr?: string | null
  qty?: number | string | null
  netWgt?: number | string | null
  grossWgt?: number | string | null
  primaryValue?: number | string | null
  cifvalue?: number | string | null
  cIFValue?: number | string | null
  isOriginalClassification?: boolean | null
  isReported?: boolean | null
  isAggregate?: boolean | null
  [key: string]: unknown
}

type RawMirrorImportRow = {
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
  partner_iso: string
  partner_desc: string
  flow_code: string
  flow_desc: string
  classification_code: string | null
  cmd_code: string
  cmd_desc: string | null
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

export type MirrorImportUnitValueRow = {
  period_type: MirrorImportPeriodType
  period_start: string
  period_label: string
  importer_country: string
  importer_iso: string
  origin_country: string
  origin_iso: string
  flow: string
  commodity_group: string
  analysis_bucket: string
  hs6: string
  hs_description: string | null
  import_value_usd: number | null
  import_quantity_raw: number | null
  import_quantity_unit_raw: string | null
  import_net_weight_kg: number | null
  import_quantity_ton: number | null
  import_unit_value_usd_per_ton: number | null
  source_name: string
  source_url: string
  fetched_at: string
  data_quality_flag: MirrorImportUnitValueFlag
  unit_value_flag: MirrorImportUnitValueFlag
  confidence_score: number
  notes: string
}

type ExportUnitValueRow = {
  period_type: MirrorImportPeriodType
  period_start: string
  period_label: string
  partner_country: string
  partner_iso: string | null
  export_value_usd: number | null
  export_quantity_ton: number | null
  export_unit_value_usd_per_ton: number | null
  unit_value_flag: string | null
  confidence_score: number | null
  hs6: string
}

export type CoffeeMirrorGapRow = {
  period_type: MirrorImportPeriodType
  period_start: string
  period_label: string
  market_country: string
  market_iso: string | null
  vietnam_export_value_usd: number | null
  vietnam_export_quantity_ton: number | null
  vietnam_export_unit_value_usd_per_ton: number | null
  vietnam_export_unit_value_flag: string | null
  partner_import_value_usd: number | null
  partner_import_quantity_ton: number | null
  partner_import_unit_value_usd_per_ton: number | null
  partner_import_unit_value_flag: MirrorImportUnitValueFlag | null
  value_gap_usd: number | null
  quantity_gap_ton: number | null
  unit_value_gap_usd_per_ton: number | null
  mirror_gap_pct: number | null
  mirror_gap_flag: MirrorGapFlag
  confidence_score: number | null
  interpretation_note: string
}

export type MirrorImportPreparedRows = {
  rawRows: RawMirrorImportRow[]
  factRows: MirrorImportUnitValueRow[]
  rawRowsFetched: number
  rawRowsPrepared: number
  factRowsPrepared: number
  excludedRows: number
  aggregateReporterRows: number
  aggregatePartnerRows: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  unitDistribution: Record<string, number>
  availablePeriodLabels: string[]
}

export type MirrorImportQcReport = {
  rawRowsFetched: number
  rawRowsPrepared: number
  factRowsPrepared: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  aggregateReporterRows: number
  aggregatePartnerRows: number
  missingValueRows: number
  missingQuantityRows: number
  unknownQuantityUnitRows: number
  zeroOrInvalidQuantityRows: number
  invalidValueRows: number
  lowVolumeRows: number
  flagCounts: Record<MirrorImportUnitValueFlag, number>
  unitDistribution: Record<string, number>
  importerCoverage: Record<string, number>
  mirrorGapFlagCounts: Record<MirrorGapFlag, number>
  missingMirrorRows: number
  latestPeriodLabel: string | null
  topHighestUnitValues: MirrorImportUnitValueRow[]
  topLowestUnitValues: MirrorImportUnitValueRow[]
  mirrorGapOutliers: CoffeeMirrorGapRow[]
}

export type MirrorImportSyncOptions = {
  periodType?: MirrorImportPeriodType
  fromYear?: number
  toYear?: number
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  requestChunkSize?: number
  fetchedAt?: string
  sourceRows?: MirrorComtradeRawRow[]
  exportRows?: ExportUnitValueRow[]
}

export type MirrorImportSyncResult = {
  periodType: MirrorImportPeriodType
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
  aggregateReporterRows: number
  aggregatePartnerRows: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  availablePeriodLabels: string[]
  unitDistribution: Record<string, number>
  qc: MirrorImportQcReport
  rows: MirrorImportUnitValueRow[]
  mirrorGapRows: CoffeeMirrorGapRow[]
  artifacts: {
    rawCsvPath: string | null
    factCsvPath: string | null
    mirrorGapCsvPath: string | null
    qcReportPath: string | null
    methodologyPath: string | null
  }
}

type QuantityNormalizationResult = {
  quantityTon: number | null
  quantitySource: 'net_wgt_kg' | 'qty_kg' | 'qty_ton' | 'unknown'
}

type AggregationBucket = {
  period_type: MirrorImportPeriodType
  period_start: string
  period_label: string
  importer_country: string
  importer_iso: string
  origin_country: string
  origin_iso: string
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
  quantityRawSum: number
  quantityRawCount: number
  quantityTonSum: number
  quantityTonCount: number
  netWeightKgSum: number
  netWeightKgCount: number
  quantityUnits: Set<string>
  quantitySources: Set<QuantityNormalizationResult['quantitySource']>
  qualityFlags: Set<MirrorImportUnitValueFlag>
}

const COMTRADE_PREVIEW_BASE_URL = 'https://comtradeapi.un.org/public/v1/preview'
const SOURCE_NAME = 'UN Comtrade'
const HS6_CODE = '090111'
const FLOW_CODE = 'M'
const FLOW_LABEL = 'Import'
const ORIGIN_CODE = 704
const ORIGIN_ISO = 'VNM'
const ORIGIN_COUNTRY = 'Vietnam'
const COMMODITY_GROUP = 'coffee'
const ANALYSIS_BUCKET = 'coffee_raw_core'
const LOW_VOLUME_TON_THRESHOLD = 10
const LARGE_GAP_PCT_THRESHOLD = 50
const INTERPRETATION_NOTE =
  'Mirror gap compares Vietnam export unit value with partner-reported import unit value; differences can reflect CIF/FOB, freight, insurance, timing, reporting, or classification effects.'

const IMPORTERS: MirrorImporter[] = [
  { iso: 'DEU', code: 276, country: 'Germany' },
  { iso: 'USA', code: 842, country: 'United States' },
  { iso: 'ITA', code: 380, country: 'Italy' },
  { iso: 'JPN', code: 392, country: 'Japan' },
  { iso: 'KOR', code: 410, country: 'South Korea' },
  { iso: 'BEL', code: 56, country: 'Belgium' },
  { iso: 'ESP', code: 724, country: 'Spain' },
  { iso: 'NLD', code: 528, country: 'Netherlands' },
  { iso: 'FRA', code: 251, country: 'France' },
  { iso: 'GBR', code: 826, country: 'United Kingdom' },
]

const IMPORTER_BY_ISO: ReadonlyMap<string, MirrorImporter> = new Map(
  IMPORTERS.map(importer => [importer.iso, importer]),
)
const IMPORTER_BY_CODE: ReadonlyMap<string, MirrorImporter> = new Map(
  IMPORTERS.map(importer => [String(importer.code), importer]),
)

const RAW_COLUMNS: Array<keyof RawMirrorImportRow> = [
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
  'flow_code',
  'flow_desc',
  'classification_code',
  'cmd_code',
  'cmd_desc',
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

const FACT_COLUMNS: Array<keyof MirrorImportUnitValueRow> = [
  'period_type',
  'period_start',
  'period_label',
  'importer_country',
  'importer_iso',
  'origin_country',
  'origin_iso',
  'flow',
  'commodity_group',
  'analysis_bucket',
  'hs6',
  'hs_description',
  'import_value_usd',
  'import_quantity_raw',
  'import_quantity_unit_raw',
  'import_net_weight_kg',
  'import_quantity_ton',
  'import_unit_value_usd_per_ton',
  'source_name',
  'source_url',
  'fetched_at',
  'data_quality_flag',
  'unit_value_flag',
  'confidence_score',
  'notes',
]

const MIRROR_GAP_COLUMNS: Array<keyof CoffeeMirrorGapRow> = [
  'period_type',
  'period_start',
  'period_label',
  'market_country',
  'market_iso',
  'vietnam_export_value_usd',
  'vietnam_export_quantity_ton',
  'vietnam_export_unit_value_usd_per_ton',
  'vietnam_export_unit_value_flag',
  'partner_import_value_usd',
  'partner_import_quantity_ton',
  'partner_import_unit_value_usd_per_ton',
  'partner_import_unit_value_flag',
  'value_gap_usd',
  'quantity_gap_ton',
  'unit_value_gap_usd_per_ton',
  'mirror_gap_pct',
  'mirror_gap_flag',
  'confidence_score',
  'interpretation_note',
]

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

function parsePeriodWindow(options: Pick<MirrorImportSyncOptions, 'fromYear' | 'toYear'>) {
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

function toComtradePreviewUrl(periodType: MirrorImportPeriodType, periods: string[], importer: MirrorImporter) {
  const params = new URLSearchParams({
    reporterCode: String(importer.code),
    partnerCode: String(ORIGIN_CODE),
    flowCode: FLOW_CODE,
    cmdCode: HS6_CODE,
    period: periods.join(','),
    includeDesc: 'true',
  })
  return `${COMTRADE_PREVIEW_BASE_URL}/C/${periodType}/HS?${params.toString()}`
}

function summarizePreviewQuery(periodType: MirrorImportPeriodType, periods: string[], importer: MirrorImporter) {
  return {
    endpoint: `${COMTRADE_PREVIEW_BASE_URL}/C/${periodType}/HS`,
    reporterCode: importer.code,
    reporterISO: importer.iso,
    partnerCode: ORIGIN_CODE,
    partnerISO: ORIGIN_ISO,
    flowCode: FLOW_CODE,
    cmdCode: HS6_CODE,
    period: periods.join(','),
    includeDesc: true,
  }
}

async function fetchComtradePreviewChunk(periodType: MirrorImportPeriodType, periods: string[], importer: MirrorImporter) {
  const url = toComtradePreviewUrl(periodType, periods, importer)
  const response = await fetch(url, {
    headers: {
      'user-agent': 'nongsanvn-coffee-mirror-import-unit-value/1.0 (+https://nongsanvn.vn)',
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

export const COFFEE_MIRROR_IMPORTERS = IMPORTERS

export function verifyCoffeeMirrorImporterCodes(importers: MirrorImporter[] = IMPORTERS) {
  const expected = new Map([
    ['DEU', 276],
    ['USA', 842],
    ['ITA', 380],
    ['JPN', 392],
    ['KOR', 410],
    ['BEL', 56],
    ['ESP', 724],
    ['NLD', 528],
    ['FRA', 251],
    ['GBR', 826],
  ])

  return importers.map(importer => ({
    importer,
    ok: expected.get(importer.iso) === importer.code,
    expectedCode: expected.get(importer.iso) ?? null,
  }))
}

export function normalizeMirrorImportQuantityToTon(input: {
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

function toFactPeriod(periodType: MirrorImportPeriodType, period: string | null) {
  if (!period) {
    return null
  }

  if (periodType === 'A') {
    const year = Number(period)
    if (!Number.isInteger(year) || year < 1900) {
      return null
    }
    return {
      periodStart: `${year}-01-01`,
      periodLabel: String(year),
    }
  }

  if (!/^\d{6}$/.test(period)) {
    return null
  }

  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  return {
    periodStart: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`,
    periodLabel: period,
  }
}

function importerFromRow(row: MirrorComtradeRawRow) {
  const iso = safeTrim(row.reporterISO)?.toUpperCase()
  const code = toText(row.reporterCode)
  if (iso && IMPORTER_BY_ISO.has(iso)) {
    return IMPORTER_BY_ISO.get(iso) ?? null
  }
  if (code && IMPORTER_BY_CODE.has(code)) {
    return IMPORTER_BY_CODE.get(code) ?? null
  }
  return null
}

function originFromRow(row: MirrorComtradeRawRow) {
  const iso = safeTrim(row.partnerISO)?.toUpperCase()
  const code = toText(row.partnerCode)
  if (iso) {
    return iso
  }
  if (code === String(ORIGIN_CODE)) {
    return ORIGIN_ISO
  }
  return null
}

function isAggregateEntity(code: string | null, iso: string | null, desc: string | null) {
  if (code === '0' || iso === 'W00') {
    return true
  }
  return (desc ?? '').toLowerCase().includes('world')
}

function isTargetComtradeRow(row: MirrorComtradeRawRow, periodType: MirrorImportPeriodType) {
  const freqCode = safeTrim(row.freqCode)?.toUpperCase()
  const cmdCode = normalizeHs6(row.cmdCode)
  const flowCode = safeTrim(row.flowCode)?.toUpperCase()
  const partnerIso = originFromRow(row)
  const period = safeTrim(row.period)

  if (freqCode !== periodType) {
    return false
  }
  if (!period) {
    return false
  }
  if (cmdCode !== HS6_CODE) {
    return false
  }
  if (flowCode !== FLOW_CODE) {
    return false
  }
  if (partnerIso !== ORIGIN_ISO) {
    return false
  }

  return true
}

function toRawPayload(row: MirrorComtradeRawRow) {
  return row as Record<string, unknown>
}

function buildRawKey(row: RawMirrorImportRow) {
  return `${row.freq_code}|${row.period}|${row.reporter_code}|${row.partner_code}|${row.flow_code}|${row.cmd_code}|${row.source_name}`
}

function buildAggregationKey(row: RawMirrorImportRow) {
  return `${row.freq_code}|${row.period}|${row.reporter_iso}|${row.partner_iso}|${row.flow_code}|${row.cmd_code}|${row.source_name}`
}

function dataQualityFlagFromBucket(bucket: AggregationBucket, importValue: number | null, importQuantityTon: number | null): MirrorImportUnitValueFlag {
  const precedence: MirrorImportUnitValueFlag[] = [
    'aggregate_reporter',
    'aggregate_partner',
    'missing_value',
    'missing_or_unknown_quantity_unit',
    'missing_quantity',
    'invalid_value',
    'zero_or_invalid_quantity',
    'low_volume',
  ]
  for (const flag of precedence) {
    if (bucket.qualityFlags.has(flag)) {
      return flag
    }
  }

  if (importValue === null) {
    return 'missing_value'
  }
  if (importValue <= 0) {
    return 'invalid_value'
  }
  if (bucket.quantityTonCount === 0 || importQuantityTon === null) {
    if (bucket.quantitySources.has('unknown')) {
      return 'missing_or_unknown_quantity_unit'
    }
    return 'missing_quantity'
  }
  if (importQuantityTon <= 0) {
    return 'zero_or_invalid_quantity'
  }
  if (importQuantityTon < LOW_VOLUME_TON_THRESHOLD) {
    return 'low_volume'
  }
  return 'ok'
}

function unitValueFlagForRow(
  row: Pick<MirrorImportUnitValueRow, 'data_quality_flag' | 'import_value_usd' | 'import_quantity_ton' | 'import_unit_value_usd_per_ton'>,
) {
  if (row.data_quality_flag === 'aggregate_reporter' || row.data_quality_flag === 'aggregate_partner') {
    return row.data_quality_flag
  }
  if (row.import_value_usd === null) {
    return 'missing_value' satisfies MirrorImportUnitValueFlag
  }
  if (row.import_value_usd <= 0 || row.import_unit_value_usd_per_ton === null || row.import_unit_value_usd_per_ton <= 0) {
    return 'invalid_value' satisfies MirrorImportUnitValueFlag
  }
  if (row.import_quantity_ton === null) {
    return row.data_quality_flag === 'missing_or_unknown_quantity_unit' ? 'missing_or_unknown_quantity_unit' : 'missing_quantity'
  }
  if (row.import_quantity_ton <= 0) {
    return 'zero_or_invalid_quantity' satisfies MirrorImportUnitValueFlag
  }
  if (row.import_quantity_ton < LOW_VOLUME_TON_THRESHOLD) {
    return 'low_volume' satisfies MirrorImportUnitValueFlag
  }
  return 'ok' satisfies MirrorImportUnitValueFlag
}

function confidenceForFlag(flag: MirrorImportUnitValueFlag) {
  switch (flag) {
    case 'ok':
      return 0.82
    case 'low_volume':
      return 0.68
    case 'aggregate_reporter':
    case 'aggregate_partner':
      return 0.4
    case 'missing_value':
    case 'missing_quantity':
    case 'missing_or_unknown_quantity_unit':
      return 0.45
    case 'zero_or_invalid_quantity':
    case 'invalid_value':
      return 0.35
    default:
      return 0.4
  }
}

function buildNotes(flag: MirrorImportUnitValueFlag) {
  const notes = [
    'Mirror import unit value is calculated as SUM(import_value_usd) / SUM(import_quantity_ton).',
    'Import data is importer-reported and can naturally differ from exporter-reported data due to CIF/FOB scope, freight, insurance, timing, revisions, and classification differences.',
    'Mirror gap is a benchmark signal only; it is not transaction price, confirmed premium, margin, or profit.',
  ]
  if (flag === 'low_volume') {
    notes.push(`Low-volume market (< ${LOW_VOLUME_TON_THRESHOLD} tons); unit value can be unstable.`)
  }
  if (flag !== 'ok' && flag !== 'low_volume') {
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

async function getVietnamExportRows(periodType: MirrorImportPeriodType, periodLabels: string[]): Promise<ExportUnitValueRow[]> {
  if (periodLabels.length === 0) {
    return []
  }
  const client = getSupabaseAdminClient()
  if (!client) {
    return []
  }

  const { data, error } = await client
    .from('fact_export_unit_value')
    .select(
      [
        'period_type',
        'period_start',
        'period_label',
        'partner_country',
        'partner_iso',
        'export_value_usd',
        'export_quantity_ton',
        'export_unit_value_usd_per_ton',
        'unit_value_flag',
        'confidence_score',
        'hs6',
      ].join(', '),
    )
    .eq('period_type', periodType)
    .eq('reporter_iso', ORIGIN_ISO)
    .eq('flow', 'Export')
    .eq('commodity_group', COMMODITY_GROUP)
    .eq('analysis_bucket', ANALYSIS_BUCKET)
    .eq('hs6', HS6_CODE)
    .in('period_label', periodLabels)

  if (error) {
    throw error
  }
  return (data ?? []) as unknown as ExportUnitValueRow[]
}

function buildMirrorGapFlag(row: {
  vietnamExportUnitValueUsdPerTon: number | null
  partnerImportUnitValueUsdPerTon: number | null
  vietnamExportQuantityTon: number | null
  partnerImportQuantityTon: number | null
  mirrorGapPct: number | null
  quantityGapPct: number | null
}): MirrorGapFlag {
  if (row.vietnamExportUnitValueUsdPerTon === null) {
    return 'missing_export_unit_value'
  }
  if (row.partnerImportUnitValueUsdPerTon === null) {
    return 'missing_import_unit_value'
  }
  if (row.vietnamExportQuantityTon === null || row.partnerImportQuantityTon === null) {
    return 'missing_quantity'
  }
  if (row.vietnamExportQuantityTon < LOW_VOLUME_TON_THRESHOLD || row.partnerImportQuantityTon < LOW_VOLUME_TON_THRESHOLD) {
    return 'low_volume'
  }
  if (row.mirrorGapPct !== null && Math.abs(row.mirrorGapPct) > LARGE_GAP_PCT_THRESHOLD) {
    return 'large_mirror_gap'
  }
  if (row.quantityGapPct !== null && Math.abs(row.quantityGapPct) > LARGE_GAP_PCT_THRESHOLD) {
    return 'large_quantity_gap'
  }
  return 'ok'
}

export function buildCoffeeMirrorGapRows(
  exportRows: ExportUnitValueRow[],
  importRows: MirrorImportUnitValueRow[],
): CoffeeMirrorGapRow[] {
  const importByKey = new Map<string, MirrorImportUnitValueRow>()
  for (const row of importRows) {
    const key = `${row.period_type}|${row.period_label}|${row.importer_iso}|${row.origin_iso}|${row.hs6}`
    importByKey.set(key, row)
  }

  const rows: CoffeeMirrorGapRow[] = []
  for (const exportRow of exportRows) {
    if (String(exportRow.partner_country).toLowerCase().includes('world')) {
      continue
    }
    const key = `${exportRow.period_type}|${exportRow.period_label}|${exportRow.partner_iso ?? ''}|${ORIGIN_ISO}|${HS6_CODE}`
    const mirrorRow = importByKey.get(key)

    const mirrorGapPct =
      mirrorRow?.import_unit_value_usd_per_ton !== null &&
      mirrorRow?.import_unit_value_usd_per_ton !== undefined &&
      exportRow.export_unit_value_usd_per_ton !== null &&
      exportRow.export_unit_value_usd_per_ton !== 0
        ? roundNumber(100 * (mirrorRow.import_unit_value_usd_per_ton / exportRow.export_unit_value_usd_per_ton - 1), 6)
        : null

    const quantityGapPct =
      mirrorRow?.import_quantity_ton !== null &&
      mirrorRow?.import_quantity_ton !== undefined &&
      exportRow.export_quantity_ton !== null &&
      exportRow.export_quantity_ton !== 0
        ? roundNumber(100 * (mirrorRow.import_quantity_ton / exportRow.export_quantity_ton - 1), 6)
        : null

    const confidenceCandidates = [exportRow.confidence_score, mirrorRow?.confidence_score]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const confidenceScore = confidenceCandidates.length > 0 ? Math.min(...confidenceCandidates) : null

    const row: CoffeeMirrorGapRow = {
      period_type: exportRow.period_type,
      period_start: exportRow.period_start,
      period_label: exportRow.period_label,
      market_country: exportRow.partner_country,
      market_iso: exportRow.partner_iso,
      vietnam_export_value_usd: exportRow.export_value_usd,
      vietnam_export_quantity_ton: exportRow.export_quantity_ton,
      vietnam_export_unit_value_usd_per_ton: exportRow.export_unit_value_usd_per_ton,
      vietnam_export_unit_value_flag: exportRow.unit_value_flag,
      partner_import_value_usd: mirrorRow?.import_value_usd ?? null,
      partner_import_quantity_ton: mirrorRow?.import_quantity_ton ?? null,
      partner_import_unit_value_usd_per_ton: mirrorRow?.import_unit_value_usd_per_ton ?? null,
      partner_import_unit_value_flag: mirrorRow?.unit_value_flag ?? null,
      value_gap_usd:
        mirrorRow?.import_value_usd !== null &&
        mirrorRow?.import_value_usd !== undefined &&
        exportRow.export_value_usd !== null &&
        exportRow.export_value_usd !== undefined
          ? roundNumber(mirrorRow.import_value_usd - exportRow.export_value_usd, 6)
          : null,
      quantity_gap_ton:
        mirrorRow?.import_quantity_ton !== null &&
        mirrorRow?.import_quantity_ton !== undefined &&
        exportRow.export_quantity_ton !== null &&
        exportRow.export_quantity_ton !== undefined
          ? roundNumber(mirrorRow.import_quantity_ton - exportRow.export_quantity_ton, 6)
          : null,
      unit_value_gap_usd_per_ton:
        mirrorRow?.import_unit_value_usd_per_ton !== null &&
        mirrorRow?.import_unit_value_usd_per_ton !== undefined &&
        exportRow.export_unit_value_usd_per_ton !== null &&
        exportRow.export_unit_value_usd_per_ton !== undefined
          ? roundNumber(mirrorRow.import_unit_value_usd_per_ton - exportRow.export_unit_value_usd_per_ton, 6)
          : null,
      mirror_gap_pct: mirrorGapPct,
      mirror_gap_flag: 'ok',
      confidence_score: confidenceScore,
      interpretation_note: INTERPRETATION_NOTE,
    }

    row.mirror_gap_flag = buildMirrorGapFlag({
      vietnamExportUnitValueUsdPerTon: row.vietnam_export_unit_value_usd_per_ton,
      partnerImportUnitValueUsdPerTon: row.partner_import_unit_value_usd_per_ton,
      vietnamExportQuantityTon: row.vietnam_export_quantity_ton,
      partnerImportQuantityTon: row.partner_import_quantity_ton,
      mirrorGapPct: mirrorGapPct,
      quantityGapPct: quantityGapPct,
    })

    rows.push(row)
  }

  rows.sort((left, right) => {
    if (left.period_start !== right.period_start) {
      return right.period_start.localeCompare(left.period_start)
    }
    const leftValue = left.vietnam_export_value_usd ?? -1
    const rightValue = right.vietnam_export_value_usd ?? -1
    return rightValue - leftValue
  })

  return rows
}

export function prepareCoffeeMirrorImportRows(
  payloadRows: unknown[],
  options: {
    periodType: MirrorImportPeriodType
    fetchedAt: string
    sourceUrl: string
    queryParams: Record<string, unknown>
  },
): MirrorImportPreparedRows {
  const commodity = mapHsToCommodity(HS6_CODE)
  const commodityGroup = commodity?.commodityGroup ?? COMMODITY_GROUP
  const analysisBucket = commodity?.analysisBucket ?? ANALYSIS_BUCKET

  const rawRowsByKey = new Map<string, RawMirrorImportRow>()
  const aggregation = new Map<string, AggregationBucket>()
  const unitDistribution: Record<string, number> = {}
  let excludedRows = 0
  let aggregateReporterRows = 0
  let aggregatePartnerRows = 0

  for (const item of payloadRows) {
    const row = item as MirrorComtradeRawRow
    if (!isTargetComtradeRow(row, options.periodType)) {
      excludedRows += 1
      continue
    }

    const periodRaw = safeTrim(row.period)
    const factPeriod = toFactPeriod(options.periodType, periodRaw)
    if (!periodRaw || !factPeriod) {
      excludedRows += 1
      continue
    }

    const importer = importerFromRow(row)
    const originIso = originFromRow(row)
    if (!originIso) {
      excludedRows += 1
      continue
    }

    const reporterCode = toText(row.reporterCode)
    const reporterIso = safeTrim(row.reporterISO)?.toUpperCase() ?? importer?.iso ?? `R${reporterCode ?? 'UNK'}`
    const reporterDesc = safeTrim(row.reporterDesc) ?? importer?.country ?? `Reporter ${reporterCode ?? 'unknown'}`
    const partnerCode = toText(row.partnerCode) ?? String(ORIGIN_CODE)
    const partnerDesc = safeTrim(row.partnerDesc) ?? ORIGIN_COUNTRY
    const flowCode = safeTrim(row.flowCode)?.toUpperCase() ?? FLOW_CODE
    const flowDesc = safeTrim(row.flowDesc) ?? FLOW_LABEL
    const qty = toNumber(row.qty)
    const netWeightKg = toNumber(row.netWgt)
    const grossWeightKg = toNumber(row.grossWgt)
    const qtyUnitAbbr = safeTrim(row.qtyUnitAbbr)
    const qtyUnitCode = toText(row.qtyUnitCode)
    const tradeValueUsd = toNumber(row.primaryValue ?? row.cifvalue ?? row.cIFValue)
    const hsDescription = safeTrim(row.cmdDesc)
    const importerAggregate = isAggregateEntity(reporterCode, reporterIso, reporterDesc)
    const partnerAggregate = isAggregateEntity(partnerCode, originIso, partnerDesc)

    const quantityNormalized = normalizeMirrorImportQuantityToTon({
      qty,
      qtyUnitAbbr,
      netWeightKg,
    })

    unitDistribution[quantityNormalized.quantitySource] = (unitDistribution[quantityNormalized.quantitySource] ?? 0) + 1
    if (importerAggregate) {
      aggregateReporterRows += 1
    }
    if (partnerAggregate) {
      aggregatePartnerRows += 1
    }

    const rowSourceUrl = toComtradePreviewUrl(options.periodType, [periodRaw], importer ?? IMPORTERS[0])
    const rawRow: RawMirrorImportRow = {
      sync_run_id: null,
      source_name: SOURCE_NAME,
      source_url: rowSourceUrl,
      fetched_at: options.fetchedAt,
      query_params: options.queryParams,
      type_code: safeTrim(row.typeCode) ?? 'C',
      freq_code: safeTrim(row.freqCode)?.toUpperCase() ?? options.periodType,
      ref_period_id: toText(row.refPeriodId),
      period: periodRaw,
      reporter_code: reporterCode ?? '0',
      reporter_iso: reporterIso,
      reporter_desc: reporterDesc,
      partner_code: partnerCode,
      partner_iso: originIso,
      partner_desc: partnerDesc,
      flow_code: flowCode,
      flow_desc: flowDesc,
      classification_code: safeTrim(row.classificationCode),
      cmd_code: HS6_CODE,
      cmd_desc: hsDescription,
      qty_unit_code: qtyUnitCode,
      qty_unit_abbr: qtyUnitAbbr,
      qty,
      net_wgt_kg: netWeightKg,
      gross_wgt_kg: grossWeightKg,
      trade_value_usd: tradeValueUsd,
      is_original_classification: row.isOriginalClassification ?? null,
      is_reported: row.isReported ?? null,
      is_aggregate: row.isAggregate ?? null,
      raw_payload: toRawPayload(row),
    }

    const existingRaw = rawRowsByKey.get(buildRawKey(rawRow))
    if (!existingRaw || rawRow.fetched_at >= existingRaw.fetched_at) {
      rawRowsByKey.set(buildRawKey(rawRow), rawRow)
    }

    const aggregationKey = buildAggregationKey(rawRow)
    const bucket = aggregation.get(aggregationKey) ?? {
      period_type: options.periodType,
      period_start: factPeriod.periodStart,
      period_label: factPeriod.periodLabel,
      importer_country: reporterDesc,
      importer_iso: reporterIso,
      origin_country: ORIGIN_COUNTRY,
      origin_iso: ORIGIN_ISO,
      flow: FLOW_LABEL,
      commodity_group: commodityGroup,
      analysis_bucket: analysisBucket,
      hs6: HS6_CODE,
      hs_description: hsDescription,
      source_name: SOURCE_NAME,
      source_url: rowSourceUrl,
      fetched_at: options.fetchedAt,
      valueSum: 0,
      valueCount: 0,
      quantityRawSum: 0,
      quantityRawCount: 0,
      quantityTonSum: 0,
      quantityTonCount: 0,
      netWeightKgSum: 0,
      netWeightKgCount: 0,
      quantityUnits: new Set<string>(),
      quantitySources: new Set<QuantityNormalizationResult['quantitySource']>(),
      qualityFlags: new Set<MirrorImportUnitValueFlag>(),
    }

    if (typeof tradeValueUsd === 'number') {
      bucket.valueSum += tradeValueUsd
      bucket.valueCount += 1
      if (tradeValueUsd <= 0) {
        bucket.qualityFlags.add('invalid_value')
      }
    } else {
      bucket.qualityFlags.add('missing_value')
    }

    if (typeof qty === 'number') {
      bucket.quantityRawSum += qty
      bucket.quantityRawCount += 1
    }
    if (typeof netWeightKg === 'number') {
      bucket.netWeightKgSum += netWeightKg
      bucket.netWeightKgCount += 1
    }
    if (typeof quantityNormalized.quantityTon === 'number') {
      bucket.quantityTonSum += quantityNormalized.quantityTon
      bucket.quantityTonCount += 1
      if (quantityNormalized.quantityTon <= 0) {
        bucket.qualityFlags.add('zero_or_invalid_quantity')
      }
    } else {
      bucket.qualityFlags.add('missing_quantity')
      if (quantityNormalized.quantitySource === 'unknown') {
        bucket.qualityFlags.add('missing_or_unknown_quantity_unit')
      }
    }

    if (importerAggregate) {
      bucket.qualityFlags.add('aggregate_reporter')
    }
    if (partnerAggregate) {
      bucket.qualityFlags.add('aggregate_partner')
    }

    if (qtyUnitAbbr) {
      bucket.quantityUnits.add(qtyUnitAbbr)
    }
    bucket.quantitySources.add(quantityNormalized.quantitySource)
    bucket.source_url = rowSourceUrl
    bucket.fetched_at = maxFetchedAt(bucket.fetched_at, options.fetchedAt)
    aggregation.set(aggregationKey, bucket)
  }

  const rawRows = [...rawRowsByKey.values()]
  rawRows.sort((left, right) => {
    if (left.period !== right.period) {
      return right.period.localeCompare(left.period)
    }
    if (left.reporter_iso !== right.reporter_iso) {
      return left.reporter_iso.localeCompare(right.reporter_iso)
    }
    return left.partner_iso.localeCompare(right.partner_iso)
  })

  const factRows: MirrorImportUnitValueRow[] = []
  for (const bucket of aggregation.values()) {
    const importValue = bucket.valueCount > 0 ? roundNumber(bucket.valueSum, 6) : null
    const importQuantityRaw = bucket.quantityRawCount > 0 ? roundNumber(bucket.quantityRawSum, 6) : null
    const importNetWeightKg = bucket.netWeightKgCount > 0 ? roundNumber(bucket.netWeightKgSum, 6) : null
    const importQuantityTon = bucket.quantityTonCount > 0 ? roundNumber(bucket.quantityTonSum, 6) : null
    const importUnitValue =
      importValue !== null && importQuantityTon !== null && importQuantityTon > 0
        ? roundNumber(importValue / importQuantityTon, 6)
        : null

    if (importQuantityTon !== null && importQuantityTon < LOW_VOLUME_TON_THRESHOLD) {
      bucket.qualityFlags.add('low_volume')
    }

    const dataQualityFlag = dataQualityFlagFromBucket(bucket, importValue, importQuantityTon)
    const draftRow: MirrorImportUnitValueRow = {
      period_type: bucket.period_type,
      period_start: bucket.period_start,
      period_label: bucket.period_label,
      importer_country: bucket.importer_country,
      importer_iso: bucket.importer_iso,
      origin_country: bucket.origin_country,
      origin_iso: bucket.origin_iso,
      flow: bucket.flow,
      commodity_group: bucket.commodity_group,
      analysis_bucket: bucket.analysis_bucket,
      hs6: bucket.hs6,
      hs_description: bucket.hs_description,
      import_value_usd: importValue,
      import_quantity_raw: importQuantityRaw,
      import_quantity_unit_raw: bucket.quantityUnits.size > 0 ? [...bucket.quantityUnits].sort().join('|') : null,
      import_net_weight_kg: importNetWeightKg,
      import_quantity_ton: importQuantityTon,
      import_unit_value_usd_per_ton: importUnitValue,
      source_name: bucket.source_name,
      source_url: bucket.source_url,
      fetched_at: bucket.fetched_at,
      data_quality_flag: dataQualityFlag,
      unit_value_flag: 'ok',
      confidence_score: 0.82,
      notes: '',
    }

    draftRow.unit_value_flag = unitValueFlagForRow(draftRow)
    draftRow.confidence_score = confidenceForFlag(draftRow.unit_value_flag)
    draftRow.notes = buildNotes(draftRow.unit_value_flag)
    factRows.push(draftRow)
  }

  factRows.sort((left, right) => {
    if (left.period_start !== right.period_start) {
      return right.period_start.localeCompare(left.period_start)
    }
    if (left.importer_country !== right.importer_country) {
      return left.importer_country.localeCompare(right.importer_country)
    }
    return left.importer_iso.localeCompare(right.importer_iso)
  })

  const availablePeriodLabels = [...new Set(factRows.map(row => row.period_label))].sort()

  return {
    rawRows,
    factRows,
    rawRowsFetched: payloadRows.length,
    rawRowsPrepared: rawRows.length,
    factRowsPrepared: factRows.length,
    excludedRows,
    aggregateReporterRows,
    aggregatePartnerRows,
    duplicateRawRowsCollapsed: payloadRows.length - rawRows.length,
    duplicateFactRowsCollapsed: rawRows.length - factRows.length,
    unitDistribution,
    availablePeriodLabels,
  }
}

export function buildCoffeeMirrorImportQcReport(input: {
  prepared: MirrorImportPreparedRows
  mirrorGapRows: CoffeeMirrorGapRow[]
}): MirrorImportQcReport {
  const flagCounts: Record<MirrorImportUnitValueFlag, number> = {
    ok: 0,
    missing_value: 0,
    missing_quantity: 0,
    zero_or_invalid_quantity: 0,
    invalid_value: 0,
    low_volume: 0,
    aggregate_reporter: 0,
    aggregate_partner: 0,
    missing_or_unknown_quantity_unit: 0,
  }
  const importerCoverage: Record<string, number> = {}
  for (const row of input.prepared.factRows) {
    flagCounts[row.unit_value_flag] += 1
    importerCoverage[row.importer_iso] = (importerCoverage[row.importer_iso] ?? 0) + 1
  }

  const mirrorGapFlagCounts: Record<MirrorGapFlag, number> = {
    ok: 0,
    missing_export_unit_value: 0,
    missing_import_unit_value: 0,
    missing_quantity: 0,
    low_volume: 0,
    large_mirror_gap: 0,
    large_quantity_gap: 0,
  }
  for (const row of input.mirrorGapRows) {
    mirrorGapFlagCounts[row.mirror_gap_flag] += 1
  }

  const topHighestUnitValues = [...input.prepared.factRows]
    .filter(row => typeof row.import_unit_value_usd_per_ton === 'number')
    .sort((left, right) => (right.import_unit_value_usd_per_ton ?? 0) - (left.import_unit_value_usd_per_ton ?? 0))
    .slice(0, 20)

  const topLowestUnitValues = [...input.prepared.factRows]
    .filter(row => typeof row.import_unit_value_usd_per_ton === 'number')
    .sort((left, right) => (left.import_unit_value_usd_per_ton ?? 0) - (right.import_unit_value_usd_per_ton ?? 0))
    .slice(0, 20)

  const mirrorGapOutliers = [...input.mirrorGapRows]
    .filter(row => typeof row.mirror_gap_pct === 'number')
    .sort((left, right) => Math.abs(right.mirror_gap_pct ?? 0) - Math.abs(left.mirror_gap_pct ?? 0))
    .slice(0, 20)

  return {
    rawRowsFetched: input.prepared.rawRowsFetched,
    rawRowsPrepared: input.prepared.rawRowsPrepared,
    factRowsPrepared: input.prepared.factRowsPrepared,
    duplicateRawRowsCollapsed: input.prepared.duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed: input.prepared.duplicateFactRowsCollapsed,
    aggregateReporterRows: input.prepared.aggregateReporterRows,
    aggregatePartnerRows: input.prepared.aggregatePartnerRows,
    missingValueRows: flagCounts.missing_value,
    missingQuantityRows: flagCounts.missing_quantity,
    unknownQuantityUnitRows: flagCounts.missing_or_unknown_quantity_unit,
    zeroOrInvalidQuantityRows: flagCounts.zero_or_invalid_quantity,
    invalidValueRows: flagCounts.invalid_value,
    lowVolumeRows: flagCounts.low_volume,
    flagCounts,
    unitDistribution: input.prepared.unitDistribution,
    importerCoverage,
    mirrorGapFlagCounts,
    missingMirrorRows: mirrorGapFlagCounts.missing_import_unit_value,
    latestPeriodLabel: input.prepared.availablePeriodLabels.at(-1) ?? null,
    topHighestUnitValues,
    topLowestUnitValues,
    mirrorGapOutliers,
  }
}

export function renderCoffeeMirrorImportQcMarkdown(report: MirrorImportQcReport, options: { generatedAt: string }) {
  const lines: string[] = [
    '# QC Report - Coffee Mirror Import Unit Value',
    '',
    `- Generated at: ${options.generatedAt}`,
    '- Source: UN Comtrade preview endpoint',
    '- Commodity scope: HS 090111 (coffee raw core)',
    `- Importer markets: ${IMPORTERS.map(item => `${item.country} (${item.iso})`).join(', ')}`,
    '',
    '## Coverage',
    '',
    `- Raw rows fetched: ${report.rawRowsFetched}`,
    `- Raw rows prepared: ${report.rawRowsPrepared}`,
    `- Fact rows prepared: ${report.factRowsPrepared}`,
    `- Duplicate raw grain rows collapsed: ${report.duplicateRawRowsCollapsed}`,
    `- Duplicate fact grain rows collapsed: ${report.duplicateFactRowsCollapsed}`,
    `- Aggregate reporter rows: ${report.aggregateReporterRows}`,
    `- Aggregate partner rows: ${report.aggregatePartnerRows}`,
    '',
    '## Quality Counters',
    '',
    `- Missing value rows: ${report.missingValueRows}`,
    `- Missing quantity rows: ${report.missingQuantityRows}`,
    `- Unknown quantity unit rows: ${report.unknownQuantityUnitRows}`,
    `- Zero/invalid quantity rows: ${report.zeroOrInvalidQuantityRows}`,
    `- Invalid value rows: ${report.invalidValueRows}`,
    `- Low-volume rows: ${report.lowVolumeRows}`,
    '',
    '## Mirror Gap Counters',
    '',
    `- OK rows: ${report.mirrorGapFlagCounts.ok}`,
    `- Missing export unit value: ${report.mirrorGapFlagCounts.missing_export_unit_value}`,
    `- Missing import unit value: ${report.mirrorGapFlagCounts.missing_import_unit_value}`,
    `- Missing quantity: ${report.mirrorGapFlagCounts.missing_quantity}`,
    `- Low volume: ${report.mirrorGapFlagCounts.low_volume}`,
    `- Large mirror gap: ${report.mirrorGapFlagCounts.large_mirror_gap}`,
    `- Large quantity gap: ${report.mirrorGapFlagCounts.large_quantity_gap}`,
    '',
    '## Importer Coverage',
    '',
  ]

  const coverageItems = Object.entries(report.importerCoverage).sort(([left], [right]) => left.localeCompare(right))
  if (coverageItems.length === 0) {
    lines.push('- No importer rows available')
  } else {
    for (const [importerIso, rowCount] of coverageItems) {
      lines.push(`- ${importerIso}: ${rowCount} rows`)
    }
  }

  lines.push('', '## Unit Distribution', '')
  const unitItems = Object.entries(report.unitDistribution).sort(([left], [right]) => left.localeCompare(right))
  if (unitItems.length === 0) {
    lines.push('- No unit-distribution data')
  } else {
    for (const [unitSource, rowCount] of unitItems) {
      lines.push(`- ${unitSource}: ${rowCount}`)
    }
  }

  lines.push('', '## Top 20 Highest Import Unit Values (USD/ton)', '')
  if (report.topHighestUnitValues.length === 0) {
    lines.push('- No rows with numeric import unit value')
  } else {
    for (const row of report.topHighestUnitValues) {
      lines.push(
        `- ${row.period_label} | ${row.importer_country} (${row.importer_iso}) | ${row.import_unit_value_usd_per_ton} | flag=${row.unit_value_flag}`,
      )
    }
  }

  lines.push('', '## Top 20 Lowest Import Unit Values (USD/ton)', '')
  if (report.topLowestUnitValues.length === 0) {
    lines.push('- No rows with numeric import unit value')
  } else {
    for (const row of report.topLowestUnitValues) {
      lines.push(
        `- ${row.period_label} | ${row.importer_country} (${row.importer_iso}) | ${row.import_unit_value_usd_per_ton} | flag=${row.unit_value_flag}`,
      )
    }
  }

  lines.push('', '## Mirror Gap Outliers (Top |gap| %)', '')
  if (report.mirrorGapOutliers.length === 0) {
    lines.push('- No rows with numeric mirror gap')
  } else {
    for (const row of report.mirrorGapOutliers) {
      lines.push(
        `- ${row.period_label} | ${row.market_country} (${row.market_iso ?? 'N/A'}) | gap=${row.mirror_gap_pct} | flag=${row.mirror_gap_flag}`,
      )
    }
  }

  lines.push(
    '',
    '## Interpretation Guardrails',
    '',
    '- Mirror gap is a benchmark signal, not transaction price, confirmed premium, margin, or profit.',
    '- Positive gaps can reflect CIF/FOB basis, freight, insurance, timing, revisions, and classification differences.',
    '- Low-volume and large-gap rows should be reviewed before deriving business conclusions.',
    '',
  )

  return lines.join('\n')
}

export function renderCoffeeMirrorImportMethodology() {
  return [
    '# Coffee Mirror Import Methodology',
    '',
    '## Scope',
    '',
    '- Commodity: coffee raw core (HS 090111).',
    '- Origin/exporter: Vietnam (VNM, code 704).',
    '- Importers (P0+P1): DEU, USA, ITA, JPN, KOR, BEL, ESP, NLD, FRA, GBR.',
    '- Frequency in v1: annual only (A), from 2020 to latest completed year.',
    '',
    '## Data Source',
    '',
    '- Primary source: UN Comtrade public preview endpoint.',
    '- Query pattern: reporter=importer, partner=Vietnam, flow=Import (M), cmdCode=090111.',
    '- Full raw payload is preserved for traceability.',
    '',
    '## Transform Rules',
    '',
    '- Quantity normalization priority: net weight (kg) -> qty in kg -> qty in ton/tonne/mt.',
    '- Import unit value formula: SUM(import_value_usd) / SUM(import_quantity_ton).',
    '- Unit value is not computed when quantity is missing, unknown, zero, or invalid.',
    '',
    '## Mirror Gap Rules',
    '',
    '- Mirror gap compares partner import unit value vs Vietnam export unit value for same period and market.',
    '- Mirror gap percentage: 100 * (partner_import_uv / vietnam_export_uv - 1).',
    `- Low-volume threshold: < ${LOW_VOLUME_TON_THRESHOLD} tons.`,
    `- Large gap thresholds: absolute unit-value gap > ${LARGE_GAP_PCT_THRESHOLD}%, absolute quantity gap > ${LARGE_GAP_PCT_THRESHOLD}%.`,
    '',
    '## Interpretation',
    '',
    '- Import values are often closer to CIF while export values are often closer to FOB.',
    '- Differences can come from freight, insurance, timing, revisions, reporting conventions, HS classification, and transshipment.',
    '- Mirror gap should be interpreted as a benchmark signal only, not margin/profit or confirmed transaction-price premium.',
    '',
  ].join('\n')
}

export async function syncCoffeeMirrorImportUnitValue(options: MirrorImportSyncOptions = {}): Promise<MirrorImportSyncResult> {
  const periodType = options.periodType ?? 'A'
  if (periodType !== 'A') {
    throw new Error('Step 7 v1 supports annual period type A only. Monthly mirror-import sync is deferred until annual QC is stable.')
  }

  const periodWindow = parsePeriodWindow(options)
  const periods = buildAnnualPeriods(periodWindow.fromYear, periodWindow.toYear)
  const periodChunks = getPeriodChunks(periods, options.requestChunkSize)
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const sourceUrl = toComtradePreviewUrl(periodType, periods, IMPORTERS[0])
  const queryParams = {
    importers: IMPORTERS.map(importer => summarizePreviewQuery(periodType, periods, importer)),
  }

  let requestCount = 0
  const payloadRows: unknown[] = []

  if (options.sourceRows) {
    payloadRows.push(...options.sourceRows)
  } else {
    for (const importer of IMPORTERS) {
      for (const chunk of periodChunks) {
        const rows = await retryTransient(() => fetchComtradePreviewChunk(periodType, chunk, importer), {
          attempts: 5,
          initialDelayMs: 800,
        })
        payloadRows.push(...rows)
        requestCount += 1
      }
    }
  }

  const prepared = prepareCoffeeMirrorImportRows(payloadRows, {
    periodType,
    fetchedAt,
    sourceUrl,
    queryParams,
  })

  const exportRows =
    options.exportRows ??
    (await getVietnamExportRows(periodType, prepared.availablePeriodLabels))
  const mirrorGapRows = buildCoffeeMirrorGapRows(exportRows, prepared.factRows)
  const qc = buildCoffeeMirrorImportQcReport({
    prepared,
    mirrorGapRows,
  })

  const rawCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'raw', 'un_comtrade', 'mirror_imports_090111_annual.csv') : null
  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'fact_mirror_import_unit_value.csv') : null
  const mirrorGapCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'vw_coffee_mirror_gap_by_market.csv') : null
  const qcReportPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'mirror_import_data_qc.md') : null
  const methodologyPath = writeArtifacts ? resolve(workspaceRoot, 'docs', 'methodology', 'coffee_mirror_import_methodology.md') : null

  if (rawCsvPath) {
    await writeArtifactFile(rawCsvPath, toCsv(prepared.rawRows, RAW_COLUMNS))
  }
  if (factCsvPath) {
    await writeArtifactFile(factCsvPath, toCsv(prepared.factRows, FACT_COLUMNS))
  }
  if (mirrorGapCsvPath) {
    await writeArtifactFile(mirrorGapCsvPath, toCsv(mirrorGapRows, MIRROR_GAP_COLUMNS))
  }
  if (qcReportPath) {
    await writeArtifactFile(qcReportPath, renderCoffeeMirrorImportQcMarkdown(qc, { generatedAt: fetchedAt }))
  }
  if (methodologyPath) {
    await writeArtifactFile(methodologyPath, renderCoffeeMirrorImportMethodology())
  }

  const shouldPersist = !dryRun && Boolean(getSupabaseAdminClient())
  let rawRowsPersisted = 0
  let factRowsPersisted = 0
  if (shouldPersist) {
    rawRowsPersisted = await upsertRowsInChunks(
      'raw_un_comtrade_mirror_imports',
      prepared.rawRows,
      'freq_code,period,reporter_code,partner_code,flow_code,cmd_code,source_name',
    )
    factRowsPersisted = await upsertRowsInChunks(
      'fact_mirror_import_unit_value',
      prepared.factRows,
      'period_type,period_label,importer_iso,origin_iso,flow,hs6,source_name',
    )
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
    aggregateReporterRows: prepared.aggregateReporterRows,
    aggregatePartnerRows: prepared.aggregatePartnerRows,
    duplicateRawRowsCollapsed: prepared.duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed: prepared.duplicateFactRowsCollapsed,
    availablePeriodLabels: prepared.availablePeriodLabels,
    unitDistribution: prepared.unitDistribution,
    qc,
    rows: prepared.factRows,
    mirrorGapRows,
    artifacts: {
      rawCsvPath,
      factCsvPath,
      mirrorGapCsvPath,
      qcReportPath,
      methodologyPath,
    },
  }
}
