import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mapHsToCommodity } from './hsMapping.js'
import { getSupabaseAdminClient } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export type MirrorImportPeriodType = 'A' | 'M'
export type MirrorImporterTier = 'core' | 'extended_static' | 'dynamic_top_export' | 'all'
export type MirrorMonthlyMode = 'review'
export type PartnerPortalVerificationStatus =
  | 'available'
  | 'probe_only'
  | 'auth_gated'
  | 'unsupported_html'
  | 'fetch_error'
  | 'not_configured'

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
  iso: string
  code: number
  country: string
  tier: 'core' | 'extended_static'
}

export type MirrorImporterResolution = {
  importerTier: MirrorImporterTier
  importers: MirrorImporter[]
  skippedUnverifiedImporters: string[]
  includeStaticCore: boolean
  topExportImporters: number
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

export type DynamicExportMarketRow = ExportUnitValueRow & {
  flow?: string | null
  commodity_group?: string | null
  analysis_bucket?: string | null
  export_value_usd?: number | null
  export_quantity_ton?: number | null
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
  importerTier: MirrorImporterTier
  importerList: string[]
  skippedUnverifiedImporters: string[]
  monthlyReviewMode: boolean
  monthlyCoverage: Record<string, number>
  partnerPortalVerificationStatus: Record<string, PartnerPortalVerificationStatus>
  mirrorGapFlagCounts: Record<MirrorGapFlag, number>
  missingMirrorRows: number
  latestPeriodLabel: string | null
  topHighestUnitValues: MirrorImportUnitValueRow[]
  topLowestUnitValues: MirrorImportUnitValueRow[]
  mirrorGapOutliers: CoffeeMirrorGapRow[]
}

export type MirrorImportSyncOptions = {
  periodType?: MirrorImportPeriodType
  importerTier?: MirrorImporterTier
  importers?: string[]
  monthlyMode?: MirrorMonthlyMode
  months?: number
  topExportImporters?: number
  includeStaticCore?: boolean
  fromYear?: number
  toYear?: number
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  requestChunkSize?: number
  fetchedAt?: string
  sourceRows?: MirrorComtradeRawRow[]
  exportRows?: ExportUnitValueRow[]
  dynamicExportRows?: DynamicExportMarketRow[]
}

export type MirrorImportSyncResult = {
  periodType: MirrorImportPeriodType
  importerTier: MirrorImporterTier
  importers: MirrorImporter[]
  skippedUnverifiedImporters: string[]
  monthlyReviewMode: boolean
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

type PeriodWindow = {
  fromYear: number
  toYear: number
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

const CORE_IMPORTERS: MirrorImporter[] = [
  { iso: 'DEU', code: 276, country: 'Germany', tier: 'core' },
  { iso: 'USA', code: 842, country: 'United States', tier: 'core' },
  { iso: 'ITA', code: 380, country: 'Italy', tier: 'core' },
  { iso: 'JPN', code: 392, country: 'Japan', tier: 'core' },
  { iso: 'KOR', code: 410, country: 'South Korea', tier: 'core' },
  { iso: 'BEL', code: 56, country: 'Belgium', tier: 'core' },
  { iso: 'ESP', code: 724, country: 'Spain', tier: 'core' },
  { iso: 'NLD', code: 528, country: 'Netherlands', tier: 'core' },
  { iso: 'FRA', code: 251, country: 'France', tier: 'core' },
  { iso: 'GBR', code: 826, country: 'United Kingdom', tier: 'core' },
]

const EXTENDED_STATIC_IMPORTERS: MirrorImporter[] = [
  { iso: 'RUS', code: 643, country: 'Russian Federation', tier: 'extended_static' },
  { iso: 'DZA', code: 12, country: 'Algeria', tier: 'extended_static' },
  { iso: 'PHL', code: 608, country: 'Philippines', tier: 'extended_static' },
  { iso: 'CHN', code: 156, country: 'China', tier: 'extended_static' },
  { iso: 'MYS', code: 458, country: 'Malaysia', tier: 'extended_static' },
  { iso: 'THA', code: 764, country: 'Thailand', tier: 'extended_static' },
  { iso: 'AUS', code: 36, country: 'Australia', tier: 'extended_static' },
  { iso: 'TUR', code: 792, country: 'Turkiye', tier: 'extended_static' },
  { iso: 'UKR', code: 804, country: 'Ukraine', tier: 'extended_static' },
  { iso: 'CHE', code: 757, country: 'Switzerland', tier: 'extended_static' },
]

const IMPORTERS: MirrorImporter[] = [...CORE_IMPORTERS, ...EXTENDED_STATIC_IMPORTERS]
const MONTHLY_PILOT_IMPORTER_ISOS = new Set(['DEU', 'USA', 'ITA', 'JPN', 'KOR', 'BEL', 'ESP', 'NLD'])

const IMPORTER_BY_ISO: ReadonlyMap<string, MirrorImporter> = new Map(
  IMPORTERS.map(importer => [importer.iso, importer]),
)
const IMPORTER_BY_CODE: ReadonlyMap<string, MirrorImporter> = new Map(
  IMPORTERS.map(importer => [String(importer.code), importer]),
)

const PARTNER_PORTAL_REFERENCES: Record<string, { status: PartnerPortalVerificationStatus; notes: string }> = {
  USA: { status: 'probe_only', notes: 'US Census trade data reference; numeric adapter not configured.' },
  DEU: { status: 'probe_only', notes: 'Eurostat/Comext reference for EU markets; numeric adapter not configured.' },
  ITA: { status: 'probe_only', notes: 'Eurostat/Comext reference for EU markets; numeric adapter not configured.' },
  ESP: { status: 'probe_only', notes: 'Eurostat/Comext reference for EU markets; numeric adapter not configured.' },
  NLD: { status: 'probe_only', notes: 'Eurostat/Comext reference for EU markets; numeric adapter not configured.' },
  FRA: { status: 'probe_only', notes: 'Eurostat/Comext reference for EU markets; numeric adapter not configured.' },
  BEL: { status: 'probe_only', notes: 'Eurostat/Comext reference for EU markets; numeric adapter not configured.' },
  JPN: { status: 'probe_only', notes: 'Japan Customs trade statistics reference; numeric adapter not configured.' },
  KOR: { status: 'probe_only', notes: 'Korea Customs reference; numeric adapter not configured.' },
  GBR: { status: 'probe_only', notes: 'UK trade data reference; numeric adapter not configured.' },
}

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

export function buildMonthlyPeriods(monthCount = 24, referenceDate = new Date()) {
  const safeMonths = Math.max(1, Math.min(Math.trunc(monthCount), 60))
  const latestMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1))
  const periods: string[] = []
  for (let index = safeMonths - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(latestMonthStart.getUTCFullYear(), latestMonthStart.getUTCMonth() - index, 1))
    periods.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
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
export const COFFEE_MIRROR_CORE_IMPORTERS = CORE_IMPORTERS
export const COFFEE_MIRROR_EXTENDED_STATIC_IMPORTERS = EXTENDED_STATIC_IMPORTERS

function dedupeImporters(importers: MirrorImporter[]) {
  const byIso = new Map<string, MirrorImporter>()
  for (const importer of importers) {
    byIso.set(importer.iso, importer)
  }
  return [...byIso.values()].sort((left, right) => left.iso.localeCompare(right.iso))
}

function resolveKnownImporter(iso: string) {
  return IMPORTER_BY_ISO.get(iso.toUpperCase()) ?? null
}

export function resolveDynamicTopExportImportersFromRows(
  rows: DynamicExportMarketRow[],
  options: { topN?: number; includeStaticCore?: boolean } = {},
): MirrorImporterResolution {
  const topN = Math.max(1, Math.min(Math.trunc(options.topN ?? 20), 50))
  const includeStaticCore = options.includeStaticCore !== false
  const scopedRows = rows
    .filter(row => row.period_type === 'A')
    .filter(row => row.partner_iso && !String(row.partner_country).toLowerCase().includes('world'))
    .filter(row => row.flow === undefined || row.flow === 'Export')
    .filter(row => row.commodity_group === undefined || row.commodity_group === COMMODITY_GROUP)
    .filter(row => row.analysis_bucket === undefined || row.analysis_bucket === ANALYSIS_BUCKET)
    .filter(row => normalizeHs6(row.hs6) === HS6_CODE)
    .filter(row => (row.export_value_usd ?? 0) > 0 && (row.export_quantity_ton ?? 0) > 0)

  const latestPeriod = scopedRows.map(row => row.period_label).sort().at(-1) ?? null
  const latestTop = latestPeriod
    ? scopedRows
        .filter(row => row.period_label === latestPeriod)
        .sort((left, right) => (right.export_value_usd ?? 0) - (left.export_value_usd ?? 0))
        .slice(0, topN)
    : []

  const years = [...new Set(scopedRows.map(row => row.period_label).filter(label => /^\d{4}$/.test(label)))].sort()
  const rollingYears = new Set(years.slice(-3))
  const rollingValues = new Map<string, { row: DynamicExportMarketRow; value: number }>()
  for (const row of scopedRows.filter(item => rollingYears.has(item.period_label))) {
    const iso = row.partner_iso?.toUpperCase()
    if (!iso) {
      continue
    }
    const current = rollingValues.get(iso)
    rollingValues.set(iso, {
      row,
      value: (current?.value ?? 0) + (row.export_value_usd ?? 0),
    })
  }
  const rollingTop = [...rollingValues.values()]
    .sort((left, right) => right.value - left.value)
    .slice(0, topN)
    .map(item => item.row)

  const skippedUnverifiedImporters: string[] = []
  const dynamicImporters: MirrorImporter[] = []
  for (const row of [...latestTop, ...rollingTop]) {
    const iso = row.partner_iso?.toUpperCase()
    if (!iso) {
      continue
    }
    const importer = resolveKnownImporter(iso)
    if (!importer) {
      if (!skippedUnverifiedImporters.includes(iso)) {
        skippedUnverifiedImporters.push(iso)
      }
      continue
    }
    dynamicImporters.push(importer)
  }

  return {
    importerTier: 'dynamic_top_export',
    importers: dedupeImporters(includeStaticCore ? [...CORE_IMPORTERS, ...dynamicImporters] : dynamicImporters),
    skippedUnverifiedImporters: skippedUnverifiedImporters.sort(),
    includeStaticCore,
    topExportImporters: topN,
  }
}

export function resolveMirrorImporters(
  options: {
    importerTier?: MirrorImporterTier
    importers?: string[]
    periodType?: MirrorImportPeriodType
    topExportImporters?: number
    includeStaticCore?: boolean
    dynamicExportRows?: DynamicExportMarketRow[]
  } = {},
): MirrorImporterResolution {
  const importerTier = options.importerTier ?? 'core'
  const topExportImporters = Math.max(1, Math.min(Math.trunc(options.topExportImporters ?? 20), 50))
  const includeStaticCore = options.includeStaticCore !== false

  if (options.importers && options.importers.length > 0) {
    const skippedUnverifiedImporters: string[] = []
    const customImporters: MirrorImporter[] = []
    for (const rawIso of options.importers) {
      const iso = rawIso.trim().toUpperCase()
      const importer = resolveKnownImporter(iso)
      if (importer) {
        customImporters.push(importer)
      } else if (iso) {
        skippedUnverifiedImporters.push(iso)
      }
    }
    return {
      importerTier,
      importers: dedupeImporters(customImporters),
      skippedUnverifiedImporters: [...new Set(skippedUnverifiedImporters)].sort(),
      includeStaticCore,
      topExportImporters,
    }
  }

  if (options.periodType === 'M') {
    return {
      importerTier,
      importers: CORE_IMPORTERS.filter(importer => MONTHLY_PILOT_IMPORTER_ISOS.has(importer.iso)),
      skippedUnverifiedImporters: [],
      includeStaticCore,
      topExportImporters,
    }
  }

  if (importerTier === 'extended_static') {
    return { importerTier, importers: EXTENDED_STATIC_IMPORTERS, skippedUnverifiedImporters: [], includeStaticCore, topExportImporters }
  }
  if (importerTier === 'all') {
    return { importerTier, importers: dedupeImporters(IMPORTERS), skippedUnverifiedImporters: [], includeStaticCore, topExportImporters }
  }
  if (importerTier === 'dynamic_top_export') {
    return resolveDynamicTopExportImportersFromRows(options.dynamicExportRows ?? [], {
      topN: topExportImporters,
      includeStaticCore,
    })
  }
  return { importerTier, importers: CORE_IMPORTERS, skippedUnverifiedImporters: [], includeStaticCore, topExportImporters }
}

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
    ['RUS', 643],
    ['DZA', 12],
    ['PHL', 608],
    ['CHN', 156],
    ['MYS', 458],
    ['THA', 764],
    ['AUS', 36],
    ['TUR', 792],
    ['UKR', 804],
    ['CHE', 757],
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

async function getDynamicExportRows(periodWindow: PeriodWindow): Promise<DynamicExportMarketRow[]> {
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
        'flow',
        'commodity_group',
        'analysis_bucket',
      ].join(', '),
    )
    .eq('period_type', 'A')
    .eq('reporter_iso', ORIGIN_ISO)
    .eq('flow', 'Export')
    .eq('commodity_group', COMMODITY_GROUP)
    .eq('analysis_bucket', ANALYSIS_BUCKET)
    .eq('hs6', HS6_CODE)
    .gte('period_start', `${periodWindow.fromYear}-01-01`)
    .lte('period_start', `${periodWindow.toYear}-12-31`)

  if (error) {
    throw error
  }
  return (data ?? []) as unknown as DynamicExportMarketRow[]
}

function buildPartnerPortalVerificationStatus(importers: MirrorImporter[]) {
  const statuses: Record<string, PartnerPortalVerificationStatus> = {}
  for (const importer of importers) {
    statuses[importer.iso] = PARTNER_PORTAL_REFERENCES[importer.iso]?.status ?? 'not_configured'
  }
  return statuses
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
  options: { includeImportOnlyRows?: boolean } = {},
): CoffeeMirrorGapRow[] {
  const importByKey = new Map<string, MirrorImportUnitValueRow>()
  for (const row of importRows) {
    const key = `${row.period_type}|${row.period_label}|${row.importer_iso}|${row.origin_iso}|${row.hs6}`
    importByKey.set(key, row)
  }

  const rows: CoffeeMirrorGapRow[] = []
  const matchedImportKeys = new Set<string>()
  for (const exportRow of exportRows) {
    if (String(exportRow.partner_country).toLowerCase().includes('world')) {
      continue
    }
    const key = `${exportRow.period_type}|${exportRow.period_label}|${exportRow.partner_iso ?? ''}|${ORIGIN_ISO}|${HS6_CODE}`
    const mirrorRow = importByKey.get(key)
    if (mirrorRow) {
      matchedImportKeys.add(key)
    }

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

  if (options.includeImportOnlyRows) {
    for (const [key, mirrorRow] of importByKey.entries()) {
      if (matchedImportKeys.has(key)) {
        continue
      }
      rows.push({
        period_type: mirrorRow.period_type,
        period_start: mirrorRow.period_start,
        period_label: mirrorRow.period_label,
        market_country: mirrorRow.importer_country,
        market_iso: mirrorRow.importer_iso,
        vietnam_export_value_usd: null,
        vietnam_export_quantity_ton: null,
        vietnam_export_unit_value_usd_per_ton: null,
        vietnam_export_unit_value_flag: null,
        partner_import_value_usd: mirrorRow.import_value_usd,
        partner_import_quantity_ton: mirrorRow.import_quantity_ton,
        partner_import_unit_value_usd_per_ton: mirrorRow.import_unit_value_usd_per_ton,
        partner_import_unit_value_flag: mirrorRow.unit_value_flag,
        value_gap_usd: null,
        quantity_gap_ton: null,
        unit_value_gap_usd_per_ton: null,
        mirror_gap_pct: null,
        mirror_gap_flag: 'missing_export_unit_value',
        confidence_score: mirrorRow.confidence_score,
        interpretation_note: INTERPRETATION_NOTE,
      })
    }
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
  importerResolution?: MirrorImporterResolution
  monthlyReviewMode?: boolean
  partnerPortalVerificationStatus?: Record<string, PartnerPortalVerificationStatus>
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
  const monthlyCoverage: Record<string, number> = {}
  for (const row of input.prepared.factRows) {
    flagCounts[row.unit_value_flag] += 1
    importerCoverage[row.importer_iso] = (importerCoverage[row.importer_iso] ?? 0) + 1
    if (row.period_type === 'M') {
      const key = `${row.period_label}|${row.importer_iso}`
      monthlyCoverage[key] = (monthlyCoverage[key] ?? 0) + 1
    }
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
    importerTier: input.importerResolution?.importerTier ?? 'core',
    importerList: input.importerResolution?.importers.map(importer => importer.iso) ?? CORE_IMPORTERS.map(importer => importer.iso),
    skippedUnverifiedImporters: input.importerResolution?.skippedUnverifiedImporters ?? [],
    monthlyReviewMode: input.monthlyReviewMode ?? false,
    monthlyCoverage,
    partnerPortalVerificationStatus: input.partnerPortalVerificationStatus ?? {},
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
    report.monthlyReviewMode ? '# QC Report - Coffee Mirror Import Unit Value Monthly Review' : '# QC Report - Coffee Mirror Import Unit Value',
    '',
    `- Generated at: ${options.generatedAt}`,
    '- Source: UN Comtrade preview endpoint',
    '- Commodity scope: HS 090111 (coffee raw core)',
    `- Importer tier: ${report.importerTier}`,
    `- Importer markets: ${report.importerList.join(', ')}`,
    `- Monthly review mode: ${report.monthlyReviewMode ? 'yes' : 'no'}`,
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
    '## Skipped Unverified Importers',
    '',
  ]

  if (report.skippedUnverifiedImporters.length === 0) {
    lines.push('- None')
  } else {
    for (const importerIso of report.skippedUnverifiedImporters) {
      lines.push(`- ${importerIso}`)
    }
  }

  lines.push(
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
  )

  const coverageItems = Object.entries(report.importerCoverage).sort(([left], [right]) => left.localeCompare(right))
  if (coverageItems.length === 0) {
    lines.push('- No importer rows available')
  } else {
    for (const [importerIso, rowCount] of coverageItems) {
      lines.push(`- ${importerIso}: ${rowCount} rows`)
    }
  }

  if (report.monthlyReviewMode) {
    lines.push('', '## Monthly Coverage', '')
    const monthlyItems = Object.entries(report.monthlyCoverage).sort(([left], [right]) => left.localeCompare(right))
    if (monthlyItems.length === 0) {
      lines.push('- No monthly rows available')
    } else {
      for (const [periodImporter, rowCount] of monthlyItems) {
        lines.push(`- ${periodImporter}: ${rowCount} rows`)
      }
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
    '## Partner Official Portal Verification Status',
    '',
  )

  const portalEntries = Object.entries(report.partnerPortalVerificationStatus).sort(([left], [right]) => left.localeCompare(right))
  if (portalEntries.length === 0) {
    lines.push('- No partner portal probes configured for selected importers')
  } else {
    for (const [importerIso, status] of portalEntries) {
      lines.push(`- ${importerIso}: ${status}`)
    }
  }

  lines.push(
    '',
    '## Interpretation Guardrails',
    '',
    '- Mirror gap is a benchmark signal, not transaction price, confirmed premium, margin, or profit.',
    '- Monthly mirror gap is review-only and must not be mixed with annual export or import rows.',
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
    '- Default importers: core tier DEU, USA, ITA, JPN, KOR, BEL, ESP, NLD, FRA, GBR.',
    '- Expanded annual importers can include RUS, DZA, PHL, CHN, MYS, THA, AUS, TUR, UKR, CHE, or verified dynamic top export markets.',
    '- Frequency: annual benchmark by default; monthly runs are review-only and limited to pilot importers unless explicitly overridden.',
    '',
    '## Data Source',
    '',
    '- Primary source: UN Comtrade public preview endpoint.',
    '- Query pattern: reporter=importer, partner=Vietnam, flow=Import (M), cmdCode=090111.',
    '- Partner official portals are tracked as reference/probe status only unless stable API/RSS/CSV endpoints are approved.',
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
  const monthlyReviewMode = periodType === 'M'
  if (periodType === 'M' && options.monthlyMode !== 'review') {
    throw new Error('Monthly mirror-import sync is review-only. Pass --monthly-mode=review to run period_type=M.')
  }

  const periodWindow = parsePeriodWindow(options)
  const dynamicExportRows =
    options.dynamicExportRows ??
    (options.importerTier === 'dynamic_top_export' ? await getDynamicExportRows(periodWindow) : [])
  const importerResolution = resolveMirrorImporters({
    importerTier: options.importerTier,
    importers: options.importers,
    periodType,
    topExportImporters: options.topExportImporters,
    includeStaticCore: options.includeStaticCore,
    dynamicExportRows,
  })
  if (importerResolution.importers.length === 0) {
    throw new Error('No verified mirror importers selected. Check --importer-tier or --importers.')
  }

  const periods = periodType === 'A' ? buildAnnualPeriods(periodWindow.fromYear, periodWindow.toYear) : buildMonthlyPeriods(options.months ?? 24)
  const periodChunks = getPeriodChunks(periods, options.requestChunkSize)
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const sourceUrl = toComtradePreviewUrl(periodType, periods, importerResolution.importers[0])
  const queryParams = {
    importerTier: importerResolution.importerTier,
    selectedImporters: importerResolution.importers.map(importer => importer.iso),
    skippedUnverifiedImporters: importerResolution.skippedUnverifiedImporters,
    monthlyReviewMode,
    importers: importerResolution.importers.map(importer => summarizePreviewQuery(periodType, periods, importer)),
  }

  let requestCount = 0
  const payloadRows: unknown[] = []

  if (options.sourceRows) {
    payloadRows.push(...options.sourceRows)
  } else {
    for (const importer of importerResolution.importers) {
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
  const mirrorGapRows = buildCoffeeMirrorGapRows(exportRows, prepared.factRows, { includeImportOnlyRows: monthlyReviewMode })
  const partnerPortalVerificationStatus = buildPartnerPortalVerificationStatus(importerResolution.importers)
  const qc = buildCoffeeMirrorImportQcReport({
    prepared,
    mirrorGapRows,
    importerResolution,
    monthlyReviewMode,
    partnerPortalVerificationStatus,
  })

  const isDefaultAnnualCore = periodType === 'A' && importerResolution.importerTier === 'core' && !options.importers
  const rawCsvPath = writeArtifacts
    ? resolve(
        workspaceRoot,
        'data',
        'raw',
        'un_comtrade',
        periodType === 'M'
          ? 'mirror_imports_090111_monthly_review.csv'
          : isDefaultAnnualCore
            ? 'mirror_imports_090111_annual.csv'
            : 'mirror_imports_090111_annual_expanded.csv',
      )
    : null
  const factCsvPath = writeArtifacts
    ? resolve(
        workspaceRoot,
        'data',
        'processed',
        periodType === 'M'
          ? 'fact_mirror_import_unit_value_monthly_review.csv'
          : isDefaultAnnualCore
            ? 'fact_mirror_import_unit_value.csv'
            : 'fact_mirror_import_unit_value_expanded.csv',
      )
    : null
  const mirrorGapCsvPath = writeArtifacts
    ? resolve(
        workspaceRoot,
        'data',
        'processed',
        periodType === 'M'
          ? 'vw_coffee_mirror_gap_monthly_review.csv'
          : isDefaultAnnualCore
            ? 'vw_coffee_mirror_gap_by_market.csv'
            : 'vw_coffee_mirror_gap_by_market_expanded.csv',
      )
    : null
  const qcReportPath = writeArtifacts
    ? resolve(
        workspaceRoot,
        'reports',
        'data_quality',
        periodType === 'M' ? 'mirror_import_data_monthly_review_qc.md' : isDefaultAnnualCore ? 'mirror_import_data_qc.md' : 'mirror_import_data_expanded_qc.md',
      )
    : null
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
    importerTier: importerResolution.importerTier,
    importers: importerResolution.importers,
    skippedUnverifiedImporters: importerResolution.skippedUnverifiedImporters,
    monthlyReviewMode,
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
