import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getCoffeeHsScope, mapHsToCommodity, normalizeHsCode, type CoffeeHsScope } from './hsMapping.js'
import { getSupabaseAdminClient } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export type CoffeeExportPeriodType = 'A' | 'M'
export type CoffeeExportQualityFlag =
  | 'ok'
  | 'aggregate_partner_excluded_or_flagged'
  | 'unsupported_hs_code'
  | 'missing_value'
  | 'missing_quantity'
  | 'missing_or_unknown_quantity_unit'
  | 'zero_quantity'
  | 'tiny_quantity_unit_price_unstable'
  | 'suspicious_unit_price'

type CoffeeExportSyncRunStatus = 'running' | 'success' | 'partial' | 'failed'
type CoffeeExportVerificationStatus = 'ok' | 'warning' | 'missing' | 'not_automated'
type CoffeeExportVerificationType = 'un_comtrade_mirror' | 'official_partner_portal_reference'

type ComtradePreviewResponse = {
  count?: number
  data?: unknown[]
  error?: string
}

type ComtradeRawRow = {
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
  mosCode?: string | null
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

type RawCoffeeExportInsertRow = {
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
  mos_code: string | null
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

type FactCoffeeExportInsertRow = {
  period_type: CoffeeExportPeriodType
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
  hs_description: string
  quantity_raw: number | null
  quantity_unit_raw: string | null
  net_weight_kg: number | null
  quantity_ton: number | null
  value_usd: number | null
  source_name: string
  source_url: string
  fetched_at: string
  data_quality_flag: CoffeeExportQualityFlag
  confidence_score: number
  notes: string
}

type CoffeeExportVerificationRow = {
  sync_run_id: string | null
  period_type: CoffeeExportPeriodType
  period_label: string
  reporter_iso: string
  partner_iso: string
  partner_country: string
  hs6: string
  verification_type: CoffeeExportVerificationType
  source_name: string
  source_url: string
  mirror_value_usd: number | null
  mirror_quantity_ton: number | null
  reported_value_usd: number | null
  reported_quantity_ton: number | null
  value_gap_pct: number | null
  quantity_gap_pct: number | null
  verification_status: CoffeeExportVerificationStatus
  notes: string
  verified_at: string
}

type PeriodWindow = {
  fromYear: number
  toYear: number
}

export type CoffeeExportSyncOptions = {
  periodType?: CoffeeExportPeriodType
  hsScope?: CoffeeHsScope
  hsCodes?: string[]
  fromYear?: number
  toYear?: number
  monthlyMonths?: number
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  requestChunkSize?: number
}

export type CoffeeExportSyncResult = {
  periodType: CoffeeExportPeriodType
  hsScope: CoffeeHsScope
  targetHsCodes: string[]
  requestedPeriods: string[]
  sourceUrl: string
  sourceName: string
  fetchedAt: string
  requestCount: number
  rawRowsFetched: number
  rawRowsPrepared: number
  rawRowsPersisted: number
  factRowsPrepared: number
  factRowsPersisted: number
  verificationRowsPersisted: number
  excludedRows: number
  duplicateRowsCollapsed: number
  availablePeriodLabels: string[]
  unitDistribution: Record<string, number>
  hs6Distribution: Record<string, number>
  qc: CoffeeExportQcReport
  artifacts: {
    rawCsvPath: string | null
    factCsvPath: string | null
    qcReportPath: string | null
  }
}

export type CoffeeExportPreparedRows = {
  rawRows: RawCoffeeExportInsertRow[]
  factRows: FactCoffeeExportInsertRow[]
  rawRowsFetched: number
  rawRowsPrepared: number
  excludedRows: number
  duplicateRowsCollapsed: number
  availablePeriodLabels: string[]
  unitDistribution: Record<string, number>
  hs6Distribution: Record<string, number>
}

export type CoffeeExportQcReport = {
  totalRows: number
  duplicateGrainRows: number
  worldAggregateRows: number
  missingValueRows: number
  missingQuantityRows: number
  unknownQuantityUnitRows: number
  zeroQuantityRows: number
  tinyQuantityRows: number
  suspiciousUnitPriceRows: number
  unsupportedHsCodeRows: number
  unitDistribution: Record<string, number>
  rowsByHs6: Record<string, number>
  rowsByAnalysisBucket: Record<string, number>
  valueUsdByAnalysisBucket: Record<string, number>
  quantityTonByAnalysisBucket: Record<string, number>
  latestPeriodLabel: string | null
  topMarketsLatestPeriod: Array<{
    partnerCountry: string
    partnerIso: string | null
    valueUsd: number
    quantityTon: number
  }>
}

type QuantityNormalizationResult = {
  quantityTon: number | null
  quantitySource: 'net_wgt_kg' | 'qty_kg' | 'qty_ton' | 'unknown'
}

const COMTRADE_PREVIEW_BASE_URL = 'https://comtradeapi.un.org/public/v1/preview'
const SOURCE_NAME = 'UN Comtrade'
const HS6_CODE = '090111'
const FLOW_CODE = 'X'
const FLOW_LABEL = 'Export'
const REPORTER_CODE = 704
const REPORTER_ISO = 'VNM'
const REPORTER_COUNTRY = 'Vietnam'
const COMMODITY_GROUP = 'coffee'
const ANALYSIS_BUCKET = 'coffee_raw_core'
const DEFAULT_HS_SCOPE = 'raw_core' satisfies CoffeeHsScope
const PARTNER_PORTAL_VERIFICATION_LIMIT = 8
const QC_UNIT_PRICE_MIN_USD_PER_TON = 500
const QC_UNIT_PRICE_MAX_USD_PER_TON = 15_000
const QC_TINY_QUANTITY_TON_THRESHOLD = 0.1

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

function toInteger(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return Math.trunc(numeric)
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') {
    return true
  }

  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') {
    return false
  }

  return null
}

function roundNumber(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

function addMonths(date: Date, delta: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  next.setUTCMonth(next.getUTCMonth() + delta)
  return next
}

function monthPeriodLabel(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${date.getUTCFullYear()}${month}`
}

function parsePeriodWindow(options: CoffeeExportSyncOptions): PeriodWindow {
  const currentYear = new Date().getUTCFullYear()
  const fromYear = Number.isFinite(options.fromYear) ? Math.trunc(options.fromYear as number) : 2020
  const toYear = Number.isFinite(options.toYear) ? Math.trunc(options.toYear as number) : currentYear

  if (fromYear > toYear) {
    throw new Error(`fromYear (${fromYear}) cannot be greater than toYear (${toYear})`)
  }

  return { fromYear, toYear }
}

function buildAnnualPeriods(window: PeriodWindow) {
  const periods: string[] = []
  for (let year = window.fromYear; year <= window.toYear; year += 1) {
    periods.push(String(year))
  }
  return periods
}

function buildMonthlyPeriods(monthCount: number) {
  const safeMonths = Math.max(1, Math.min(Math.trunc(monthCount), 120))
  const periods: string[] = []
  const latestMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  for (let index = safeMonths - 1; index >= 0; index -= 1) {
    periods.push(monthPeriodLabel(addMonths(latestMonthStart, -index)))
  }
  return periods
}

function chunkValues<T>(values: T[], size: number) {
  const chunkSize = Math.max(1, Math.trunc(size))
  const output: T[][] = []
  for (let index = 0; index < values.length; index += chunkSize) {
    output.push(values.slice(index, index + chunkSize))
  }
  return output
}

function normalizeTargetHsCodes(options: Pick<CoffeeExportSyncOptions, 'hsScope' | 'hsCodes'>) {
  if (options.hsCodes && options.hsCodes.length > 0) {
    const codes = options.hsCodes.map(code => normalizeHsCode(code).hs6)
    return [...new Set(codes)].sort()
  }

  const scope = options.hsScope ?? DEFAULT_HS_SCOPE
  const codes = getCoffeeHsScope(scope).map(row => row.hs6)
  return [...new Set(codes)].sort()
}

function toComtradePreviewUrl(periodType: CoffeeExportPeriodType, periods: string[], hsCodes: string[]) {
  const params = new URLSearchParams({
    reporterCode: String(REPORTER_CODE),
    flowCode: FLOW_CODE,
    cmdCode: hsCodes.join(','),
    period: periods.join(','),
    includeDesc: 'true',
  })
  return `${COMTRADE_PREVIEW_BASE_URL}/C/${periodType}/HS?${params.toString()}`
}

function summarizePreviewQuery(periodType: CoffeeExportPeriodType, periods: string[], hsCodes: string[]) {
  return {
    endpoint: `${COMTRADE_PREVIEW_BASE_URL}/C/${periodType}/HS`,
    reporterCode: REPORTER_CODE,
    flowCode: FLOW_CODE,
    cmdCode: hsCodes.join(','),
    period: periods.join(','),
    includeDesc: true,
  }
}

function getPeriodChunks(periodType: CoffeeExportPeriodType, periods: string[], requestChunkSize?: number) {
  if (requestChunkSize && Number.isFinite(requestChunkSize)) {
    return chunkValues(periods, requestChunkSize)
  }

  return chunkValues(periods, periodType === 'A' ? 4 : 6)
}

async function fetchComtradePreviewChunk(periodType: CoffeeExportPeriodType, periods: string[], hsCodes: string[]) {
  const url = toComtradePreviewUrl(periodType, periods, hsCodes)
  const response = await fetch(url, {
    headers: {
      'user-agent': 'nongsanvn-coffee-export-market/1.0 (+https://nongsanvn.vn)',
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

  if (!Array.isArray(payload.data)) {
    return []
  }

  return payload.data
}

function isAggregatePartner(partnerCode: string | null, partnerIso: string | null, partnerDesc: string | null) {
  if (partnerCode === '0') {
    return true
  }

  if (partnerIso && partnerIso.toUpperCase() === 'W00') {
    return true
  }

  const text = partnerDesc?.toLowerCase() ?? ''
  return text === 'world' || text === 'all'
}

function normalizeQtyUnit(unit: string | null) {
  return unit?.trim().toLowerCase() ?? null
}

export function normalizeQuantityToTon(input: {
  qty: number | null
  qtyUnitAbbr: string | null
  netWeightKg: number | null
}) {
  if (typeof input.netWeightKg === 'number' && Number.isFinite(input.netWeightKg)) {
    return {
      quantityTon: roundNumber(input.netWeightKg / 1000, 6),
      quantitySource: 'net_wgt_kg',
    } satisfies QuantityNormalizationResult
  }

  if (typeof input.qty !== 'number' || !Number.isFinite(input.qty)) {
    return {
      quantityTon: null,
      quantitySource: 'unknown',
    } satisfies QuantityNormalizationResult
  }

  const normalizedUnit = normalizeQtyUnit(input.qtyUnitAbbr)
  const tonUnits = new Set(['t', 'ton', 'tons', 'tonne', 'tonnes', 'mt', 'metric ton', 'metric tons', 'tne'])
  if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
    return {
      quantityTon: roundNumber(input.qty / 1000, 6),
      quantitySource: 'qty_kg',
    } satisfies QuantityNormalizationResult
  }

  if (normalizedUnit && tonUnits.has(normalizedUnit)) {
    return {
      quantityTon: roundNumber(input.qty, 6),
      quantitySource: 'qty_ton',
    } satisfies QuantityNormalizationResult
  }

  return {
    quantityTon: null,
    quantitySource: 'unknown',
  } satisfies QuantityNormalizationResult
}

function toFactPeriod(periodType: CoffeeExportPeriodType, period: string | null) {
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

function toIsoFromPartnerCode(partnerCode: string | null) {
  if (!partnerCode) {
    return null
  }
  if (partnerCode === '0') {
    return 'W00'
  }
  return `P${partnerCode}`
}

function buildGrainKey(row: FactCoffeeExportInsertRow) {
  return [
    row.period_type,
    row.period_label,
    row.reporter_iso,
    row.partner_iso ?? '',
    row.flow,
    row.hs6,
    row.source_name,
  ].join('|')
}

function buildRawKey(row: RawCoffeeExportInsertRow) {
  return [row.period, row.reporter_code, row.partner_code, row.flow_code, row.cmd_code, row.source_name].join('|')
}

function pickPreferredFactRow(existing: FactCoffeeExportInsertRow, candidate: FactCoffeeExportInsertRow) {
  const existingScore = (existing.value_usd ?? 0) + (existing.quantity_ton ?? 0)
  const candidateScore = (candidate.value_usd ?? 0) + (candidate.quantity_ton ?? 0)
  if (candidateScore > existingScore) {
    return candidate
  }
  return existing
}

function buildFactQualityFlag(input: {
  hasSupportedHsMapping: boolean
  isWorldAggregate: boolean
  valueUsd: number | null
  quantityTon: number | null
  quantitySource: QuantityNormalizationResult['quantitySource']
  unitPriceUsdPerTon: number | null
}) {
  if (!input.hasSupportedHsMapping) {
    return 'unsupported_hs_code' satisfies CoffeeExportQualityFlag
  }

  if (input.isWorldAggregate) {
    return 'aggregate_partner_excluded_or_flagged' satisfies CoffeeExportQualityFlag
  }

  if (input.valueUsd === null) {
    return 'missing_value' satisfies CoffeeExportQualityFlag
  }

  if (input.quantityTon === null) {
    if (input.quantitySource === 'unknown') {
      return 'missing_or_unknown_quantity_unit' satisfies CoffeeExportQualityFlag
    }
    return 'missing_quantity' satisfies CoffeeExportQualityFlag
  }

  if (input.quantityTon === 0) {
    return 'zero_quantity' satisfies CoffeeExportQualityFlag
  }

  if (input.quantityTon > 0 && input.quantityTon < QC_TINY_QUANTITY_TON_THRESHOLD) {
    return 'tiny_quantity_unit_price_unstable' satisfies CoffeeExportQualityFlag
  }

  if (
    typeof input.unitPriceUsdPerTon === 'number' &&
    (input.unitPriceUsdPerTon < QC_UNIT_PRICE_MIN_USD_PER_TON || input.unitPriceUsdPerTon > QC_UNIT_PRICE_MAX_USD_PER_TON)
  ) {
    return 'suspicious_unit_price' satisfies CoffeeExportQualityFlag
  }

  return 'ok' satisfies CoffeeExportQualityFlag
}

function confidenceForFlag(flag: CoffeeExportQualityFlag) {
  switch (flag) {
    case 'ok':
      return 0.9
    case 'aggregate_partner_excluded_or_flagged':
      return 0.75
    case 'unsupported_hs_code':
      return 0.4
    case 'suspicious_unit_price':
      return 0.7
    case 'tiny_quantity_unit_price_unstable':
      return 0.62
    case 'missing_or_unknown_quantity_unit':
      return 0.5
    case 'missing_quantity':
      return 0.55
    case 'zero_quantity':
      return 0.3
    case 'missing_value':
      return 0.25
    default:
      return 0.5
  }
}

function toRawPayload(row: ComtradeRawRow) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? null]))
}

function isTargetComtradeRow(row: ComtradeRawRow, periodType: CoffeeExportPeriodType, targetHsCodes: Set<string>) {
  const freqCode = safeTrim(row.freqCode)?.toUpperCase()
  const reporterCode = toInteger(row.reporterCode)
  const flowCode = safeTrim(row.flowCode)?.toUpperCase()
  const cmdCode = safeTrim(row.cmdCode)
  const motCode = toInteger(row.motCode)
  const partner2Code = toInteger(row.partner2Code)
  const customsCode = safeTrim(row.customsCode)

  if (freqCode !== periodType) {
    return false
  }

  if (reporterCode !== REPORTER_CODE) {
    return false
  }

  if (flowCode !== FLOW_CODE) {
    return false
  }

  if (!cmdCode || !targetHsCodes.has(cmdCode)) {
    return false
  }

  if (motCode !== 0) {
    return false
  }

  if (partner2Code !== 0) {
    return false
  }

  if (customsCode !== 'C00') {
    return false
  }

  return true
}

export function prepareCoffeeExportRows(
  payloadRows: unknown[],
  options: {
    periodType: CoffeeExportPeriodType
    targetHsCodes?: string[]
    fetchedAt: string
    sourceUrl: string
    sourceName?: string
    syncRunId?: string | null
    queryParams: Record<string, unknown>
  },
): CoffeeExportPreparedRows {
  const sourceName = options.sourceName ?? SOURCE_NAME
  const targetHsCodes = new Set(options.targetHsCodes ?? [HS6_CODE])
  const defaultHsMapping = mapHsToCommodity(HS6_CODE)
  const defaultHsDescription = defaultHsMapping?.hsDescriptionEn ?? 'Coffee; not roasted or decaffeinated'
  const reporterCountry = defaultHsMapping?.countryScope === 'VNM' ? REPORTER_COUNTRY : REPORTER_COUNTRY
  const filteredRows: ComtradeRawRow[] = []

  for (const item of payloadRows) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as ComtradeRawRow
    if (!isTargetComtradeRow(row, options.periodType, targetHsCodes)) {
      continue
    }
    filteredRows.push(row)
  }

  const rawRowsByKey = new Map<string, RawCoffeeExportInsertRow>()
  const factRowsByGrain = new Map<string, FactCoffeeExportInsertRow>()
  const unitDistribution = new Map<string, number>()
  const hs6Distribution = new Map<string, number>()
  const availablePeriodLabels = new Set<string>()
  let duplicateRowsCollapsed = 0

  for (const row of filteredRows) {
    const periodRaw = safeTrim(row.period)
    const period = toFactPeriod(options.periodType, periodRaw)
    if (!period || !periodRaw) {
      continue
    }

    const partnerCode = toText(row.partnerCode)
    const cmdCode = safeTrim(row.cmdCode) ?? HS6_CODE
    const hsMapping = mapHsToCommodity(cmdCode)
    const analysisBucket = hsMapping?.analysisBucket ?? 'coffee_unknown'
    const hsDescription = safeTrim(row.cmdDesc) ?? hsMapping?.hsDescriptionEn ?? defaultHsDescription
    const partnerIso = safeTrim(row.partnerISO) ?? toIsoFromPartnerCode(partnerCode)
    const partnerDesc = safeTrim(row.partnerDesc) ?? `Partner ${partnerCode ?? 'unknown'}`
    const reporterIso = safeTrim(row.reporterISO) ?? REPORTER_ISO
    const reporterDesc = safeTrim(row.reporterDesc) ?? REPORTER_COUNTRY
    const qty = toNumber(row.qty)
    const netWeightKg = toNumber(row.netWgt)
    const grossWeightKg = toNumber(row.grossWgt)
    const qtyUnitAbbr = safeTrim(row.qtyUnitAbbr)
    const quantityNormalized = normalizeQuantityToTon({
      qty,
      qtyUnitAbbr,
      netWeightKg,
    })
    const valueUsd = toNumber(row.primaryValue) ?? toNumber(row.fobvalue)
    const unitPriceUsdPerTon =
      typeof valueUsd === 'number' && typeof quantityNormalized.quantityTon === 'number' && quantityNormalized.quantityTon > 0
        ? valueUsd / quantityNormalized.quantityTon
        : null
    const worldAggregate = isAggregatePartner(partnerCode, partnerIso, partnerDesc)
    const qualityFlag = buildFactQualityFlag({
      hasSupportedHsMapping: Boolean(hsMapping),
      isWorldAggregate: worldAggregate,
      valueUsd,
      quantityTon: quantityNormalized.quantityTon,
      quantitySource: quantityNormalized.quantitySource,
      unitPriceUsdPerTon,
    })
    const confidenceScore = confidenceForFlag(qualityFlag)
    const unitKey = normalizeQtyUnit(qtyUnitAbbr) ?? 'unknown'
    unitDistribution.set(unitKey, (unitDistribution.get(unitKey) ?? 0) + 1)
    hs6Distribution.set(cmdCode, (hs6Distribution.get(cmdCode) ?? 0) + 1)
    availablePeriodLabels.add(period.periodLabel)

    const rawInsert: RawCoffeeExportInsertRow = {
      sync_run_id: options.syncRunId ?? null,
      source_name: sourceName,
      source_url: options.sourceUrl,
      fetched_at: options.fetchedAt,
      query_params: options.queryParams,
      type_code: safeTrim(row.typeCode) ?? 'C',
      freq_code: safeTrim(row.freqCode) ?? options.periodType,
      ref_period_id: toText(row.refPeriodId),
      period: periodRaw,
      reporter_code: toText(row.reporterCode) ?? String(REPORTER_CODE),
      reporter_iso: reporterIso,
      reporter_desc: reporterDesc,
      partner_code: partnerCode ?? '0',
      partner_iso: partnerIso,
      partner_desc: partnerDesc,
      partner2_code: toText(row.partner2Code),
      partner2_iso: safeTrim(row.partner2ISO),
      partner2_desc: safeTrim(row.partner2Desc),
      flow_code: safeTrim(row.flowCode) ?? FLOW_CODE,
      flow_desc: safeTrim(row.flowDesc) ?? FLOW_LABEL,
      classification_code: safeTrim(row.classificationCode),
      cmd_code: cmdCode,
      cmd_desc: safeTrim(row.cmdDesc),
      customs_code: safeTrim(row.customsCode),
      customs_desc: safeTrim(row.customsDesc),
      mos_code: safeTrim(row.mosCode),
      mot_code: toInteger(row.motCode),
      mot_desc: safeTrim(row.motDesc),
      qty_unit_code: toText(row.qtyUnitCode),
      qty_unit_abbr: qtyUnitAbbr,
      qty,
      net_wgt_kg: netWeightKg,
      gross_wgt_kg: grossWeightKg,
      trade_value_usd: valueUsd,
      is_original_classification: toBooleanOrNull(row.isOriginalClassification),
      is_reported: toBooleanOrNull(row.isReported),
      is_aggregate: toBooleanOrNull(row.isAggregate),
      raw_payload: toRawPayload(row),
    }
    const rawKey = buildRawKey(rawInsert)
    const existingRaw = rawRowsByKey.get(rawKey)
    if (!existingRaw) {
      rawRowsByKey.set(rawKey, rawInsert)
    } else {
      const existingScore = (existingRaw.trade_value_usd ?? 0) + (existingRaw.net_wgt_kg ?? 0)
      const candidateScore = (rawInsert.trade_value_usd ?? 0) + (rawInsert.net_wgt_kg ?? 0)
      if (candidateScore > existingScore) {
        rawRowsByKey.set(rawKey, rawInsert)
      }
    }

    const factRow: FactCoffeeExportInsertRow = {
      period_type: options.periodType,
      period_start: period.periodStart,
      period_label: period.periodLabel,
      reporter_country: reporterCountry,
      reporter_iso: reporterIso,
      partner_country: partnerDesc,
      partner_iso: partnerIso,
      flow: FLOW_LABEL,
      commodity_group: COMMODITY_GROUP,
      analysis_bucket: analysisBucket,
      hs6: cmdCode,
      hs_description: hsDescription,
      quantity_raw: qty,
      quantity_unit_raw: qtyUnitAbbr,
      net_weight_kg: netWeightKg,
      quantity_ton: quantityNormalized.quantityTon,
      value_usd: valueUsd,
      source_name: sourceName,
      source_url: options.sourceUrl,
      fetched_at: options.fetchedAt,
      data_quality_flag: qualityFlag,
      confidence_score: confidenceScore,
      notes: `Comtrade filtered on customs=C00, mot=0, partner2=0; quantity_source=${quantityNormalized.quantitySource}; hs_scope=${[...targetHsCodes].join('+')}`,
    }

    const grainKey = buildGrainKey(factRow)
    const existing = factRowsByGrain.get(grainKey)
    if (existing) {
      factRowsByGrain.set(grainKey, pickPreferredFactRow(existing, factRow))
      duplicateRowsCollapsed += 1
      continue
    }
    factRowsByGrain.set(grainKey, factRow)
  }

  return {
    rawRows: [...rawRowsByKey.values()],
    factRows: [...factRowsByGrain.values()],
    rawRowsFetched: payloadRows.length,
    rawRowsPrepared: rawRowsByKey.size,
    excludedRows: payloadRows.length - rawRowsByKey.size,
    duplicateRowsCollapsed,
    availablePeriodLabels: [...availablePeriodLabels].sort(),
    unitDistribution: Object.fromEntries([...unitDistribution.entries()].sort(([left], [right]) => left.localeCompare(right))),
    hs6Distribution: Object.fromEntries([...hs6Distribution.entries()].sort(([left], [right]) => left.localeCompare(right))),
  }
}

export function buildCoffeeExportQcReport(rows: FactCoffeeExportInsertRow[]): CoffeeExportQcReport {
  const duplicateMap = new Map<string, number>()
  const unitDistribution = new Map<string, number>()
  const rowsByHs6 = new Map<string, number>()
  const rowsByAnalysisBucket = new Map<string, number>()
  const valueUsdByAnalysisBucket = new Map<string, number>()
  const quantityTonByAnalysisBucket = new Map<string, number>()
  let worldAggregateRows = 0
  let missingValueRows = 0
  let missingQuantityRows = 0
  let unknownQuantityUnitRows = 0
  let zeroQuantityRows = 0
  let tinyQuantityRows = 0
  let suspiciousUnitPriceRows = 0
  let unsupportedHsCodeRows = 0
  let latestPeriodLabel: string | null = null

  for (const row of rows) {
    const key = buildGrainKey(row)
    duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    unitDistribution.set(row.quantity_unit_raw?.toLowerCase() ?? 'unknown', (unitDistribution.get(row.quantity_unit_raw?.toLowerCase() ?? 'unknown') ?? 0) + 1)
    rowsByHs6.set(row.hs6, (rowsByHs6.get(row.hs6) ?? 0) + 1)
    rowsByAnalysisBucket.set(row.analysis_bucket, (rowsByAnalysisBucket.get(row.analysis_bucket) ?? 0) + 1)
    valueUsdByAnalysisBucket.set(row.analysis_bucket, (valueUsdByAnalysisBucket.get(row.analysis_bucket) ?? 0) + (row.value_usd ?? 0))
    quantityTonByAnalysisBucket.set(row.analysis_bucket, (quantityTonByAnalysisBucket.get(row.analysis_bucket) ?? 0) + (row.quantity_ton ?? 0))

    if (row.data_quality_flag === 'aggregate_partner_excluded_or_flagged') {
      worldAggregateRows += 1
    }
    if (row.data_quality_flag === 'unsupported_hs_code') {
      unsupportedHsCodeRows += 1
    }
    if (row.data_quality_flag === 'missing_value') {
      missingValueRows += 1
    }
    if (row.data_quality_flag === 'missing_quantity') {
      missingQuantityRows += 1
    }
    if (row.data_quality_flag === 'missing_or_unknown_quantity_unit') {
      missingQuantityRows += 1
      unknownQuantityUnitRows += 1
    }
    if (row.data_quality_flag === 'zero_quantity') {
      zeroQuantityRows += 1
    }
    if (row.data_quality_flag === 'tiny_quantity_unit_price_unstable') {
      tinyQuantityRows += 1
    }
    if (row.data_quality_flag === 'suspicious_unit_price') {
      suspiciousUnitPriceRows += 1
    }

    if (!latestPeriodLabel || row.period_label > latestPeriodLabel) {
      latestPeriodLabel = row.period_label
    }
  }

  const duplicates = [...duplicateMap.values()].filter(count => count > 1).reduce((sum, count) => sum + (count - 1), 0)
  const latestRows = latestPeriodLabel ? rows.filter(row => row.period_label === latestPeriodLabel) : []
  const topMarketsLatestPeriod = latestRows
    .filter(row => row.data_quality_flag !== 'aggregate_partner_excluded_or_flagged')
    .filter(row => typeof row.value_usd === 'number' && row.value_usd > 0)
    .sort((left, right) => (right.value_usd ?? 0) - (left.value_usd ?? 0))
    .slice(0, 10)
    .map(row => ({
      partnerCountry: row.partner_country,
      partnerIso: row.partner_iso,
      valueUsd: row.value_usd ?? 0,
      quantityTon: row.quantity_ton ?? 0,
    }))

  return {
    totalRows: rows.length,
    duplicateGrainRows: duplicates,
    worldAggregateRows,
    missingValueRows,
    missingQuantityRows,
    unknownQuantityUnitRows,
    zeroQuantityRows,
    tinyQuantityRows,
    suspiciousUnitPriceRows,
    unsupportedHsCodeRows,
    unitDistribution: Object.fromEntries([...unitDistribution.entries()].sort(([left], [right]) => left.localeCompare(right))),
    rowsByHs6: Object.fromEntries([...rowsByHs6.entries()].sort(([left], [right]) => left.localeCompare(right))),
    rowsByAnalysisBucket: Object.fromEntries([...rowsByAnalysisBucket.entries()].sort(([left], [right]) => left.localeCompare(right))),
    valueUsdByAnalysisBucket: Object.fromEntries([...valueUsdByAnalysisBucket.entries()].sort(([left], [right]) => left.localeCompare(right))),
    quantityTonByAnalysisBucket: Object.fromEntries([...quantityTonByAnalysisBucket.entries()].sort(([left], [right]) => left.localeCompare(right))),
    latestPeriodLabel,
    topMarketsLatestPeriod,
  }
}

export function renderCoffeeExportQcMarkdown(
  report: CoffeeExportQcReport,
  options: { generatedAt: string; periodType: CoffeeExportPeriodType; hsScope?: CoffeeHsScope; targetHsCodes?: string[] },
) {
  const targetHsCodes = options.targetHsCodes ?? [HS6_CODE]
  const isSingleRawCore = targetHsCodes.length === 1 && targetHsCodes[0] === HS6_CODE
  const rows = [
    isSingleRawCore ? '# QC Report - Vietnam Coffee Exports by Market' : '# QC Report - Vietnam Coffee Exports by Product Market',
    '',
    `Generated at: ${options.generatedAt}`,
    `Period type: ${options.periodType}`,
    `HS scope: ${options.hsScope ?? DEFAULT_HS_SCOPE}`,
    '',
    '## Scope',
    '',
    '- Reporter: Vietnam (704 / VNM)',
    '- Flow: Export (X)',
    `- Target HS6: ${targetHsCodes.join(', ')}`,
    '- Filtered dimensions: customs=C00, partner2=0, mot=0',
    '- Multi-HS rows are product-scope observations; do not aggregate green, roasted, decaf, extract/preparation, and byproduct buckets into one unit-value benchmark.',
    '',
    '## Row Counts',
    '',
    `- Total rows: ${report.totalRows}`,
    `- Duplicate grain rows: ${report.duplicateGrainRows}`,
    `- World aggregate rows: ${report.worldAggregateRows}`,
    `- Missing value rows: ${report.missingValueRows}`,
    `- Missing quantity rows: ${report.missingQuantityRows}`,
    `- Unknown quantity unit rows: ${report.unknownQuantityUnitRows}`,
    `- Zero quantity rows: ${report.zeroQuantityRows}`,
    `- Tiny quantity rows (< ${QC_TINY_QUANTITY_TON_THRESHOLD} ton): ${report.tinyQuantityRows}`,
    `- Suspicious QC unit price rows (< ${QC_UNIT_PRICE_MIN_USD_PER_TON} or > ${QC_UNIT_PRICE_MAX_USD_PER_TON} USD/ton): ${report.suspiciousUnitPriceRows}`,
    `- Unsupported HS code rows: ${report.unsupportedHsCodeRows}`,
    '',
    '## Quantity Units',
    '',
  ]

  for (const [unit, count] of Object.entries(report.unitDistribution)) {
    rows.push(`- ${unit}: ${count}`)
  }

  rows.push('', '## HS6 Coverage', '')
  for (const [hs6, count] of Object.entries(report.rowsByHs6)) {
    rows.push(`- ${hs6}: ${count}`)
  }

  rows.push('', '## Analysis Bucket Coverage', '')
  for (const [bucket, count] of Object.entries(report.rowsByAnalysisBucket)) {
    rows.push(
      `- ${bucket}: rows=${count} | value_usd=${roundNumber(report.valueUsdByAnalysisBucket[bucket] ?? 0, 2)} | quantity_ton=${roundNumber(report.quantityTonByAnalysisBucket[bucket] ?? 0, 3)}`,
    )
  }

  rows.push('', '## Top Markets (Latest Period)', '')
  if (!report.latestPeriodLabel) {
    rows.push('- No rows available')
  } else if (report.topMarketsLatestPeriod.length === 0) {
    rows.push(`- No non-aggregate market rows found for ${report.latestPeriodLabel}`)
  } else {
    rows.push(`Latest period: ${report.latestPeriodLabel}`, '')
    for (const market of report.topMarketsLatestPeriod) {
      rows.push(
        `- ${market.partnerCountry} (${market.partnerIso ?? 'n/a'}): value_usd=${roundNumber(market.valueUsd, 2)} | quantity_ton=${roundNumber(market.quantityTon, 3)}`,
      )
    }
  }

  rows.push(
    '',
    '## Notes',
    '',
    '- Unit price is only for QC anomaly detection in this step.',
    '- Step 3 should calculate official export unit value as SUM(value_usd) / SUM(quantity_ton).',
    '- Step 3-7 benchmark views remain scoped to HS6 090111 / coffee_raw_core unless explicitly extended.',
    '- World aggregate rows are flagged and excluded from market ranking.',
    '',
  )

  return rows.join('\n')
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }
  const text = String(value)
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) {
    return text
  }
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const header = columns.join(',')
  const body = rows.map(row => columns.map(column => csvEscape(row[column])).join(',')).join('\n')
  return `${header}\n${body}`
}

async function writeArtifactFile(path: string, content: string) {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function upsertRowsInChunks(
  tableName: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize = 500,
) {
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

async function startSyncRun(periodType: CoffeeExportPeriodType, window: PeriodWindow, metadata: Record<string, unknown>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('coffee_export_market_sync_runs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'running' satisfies CoffeeExportSyncRunStatus,
      from_year: window.fromYear,
      to_year: window.toYear,
      period_type: periodType,
      metadata,
    })
    .select('id')
    .single()

  if (error) {
    return null
  }

  return (data as { id: string }).id
}

async function finishSyncRun(
  runId: string | null,
  payload: {
    status: Exclude<CoffeeExportSyncRunStatus, 'running'>
    requestCount: number
    rawRowCount: number
    factRowCount: number
    verificationRowCount: number
    warningCount: number
    metadata: Record<string, unknown>
    errorMessage?: string | null
  },
) {
  if (!runId) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client
    .from('coffee_export_market_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: payload.status,
      request_count: payload.requestCount,
      raw_row_count: payload.rawRowCount,
      fact_row_count: payload.factRowCount,
      verification_row_count: payload.verificationRowCount,
      warning_count: payload.warningCount,
      error_message: payload.errorMessage ?? null,
      metadata: payload.metadata,
    })
    .eq('id', runId)

  if (error) {
    throw error
  }
}

const PARTNER_IMPORT_SOURCE_LOOKUP: Record<
  string,
  {
    sourceName: string
    sourceUrl: string
    notes: string
  }
> = {
  USA: {
    sourceName: 'US Census - International Trade Data',
    sourceUrl: 'https://www.census.gov/foreign-trade/data/',
    notes: 'U.S. import-side reference available via Census trade datasets/API.',
  },
  JPN: {
    sourceName: 'Japan Customs - Trade Statistics',
    sourceUrl: 'https://www.customs.go.jp/toukei/info/index_e.htm',
    notes: 'Official Japan import statistics portal for commodity-country checks.',
  },
  DEU: {
    sourceName: 'Eurostat Comext API',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database',
    notes: 'Germany import verification via Eurostat Comext (EU trade database).',
  },
  ITA: {
    sourceName: 'Eurostat Comext API',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database',
    notes: 'Italy import verification via Eurostat Comext (EU trade database).',
  },
  ESP: {
    sourceName: 'Eurostat Comext API',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database',
    notes: 'Spain import verification via Eurostat Comext (EU trade database).',
  },
  BEL: {
    sourceName: 'Eurostat Comext API',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database',
    notes: 'Belgium import verification via Eurostat Comext (EU trade database).',
  },
  NLD: {
    sourceName: 'Eurostat Comext API',
    sourceUrl: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database',
    notes: 'Netherlands import verification via Eurostat Comext (EU trade database).',
  },
}

function buildPortalVerificationRows(
  factRows: FactCoffeeExportInsertRow[],
  periodType: CoffeeExportPeriodType,
  syncRunId: string | null,
  verifiedAt: string,
) {
  const latestPeriodLabel =
    factRows.length > 0 ? [...new Set(factRows.map(row => row.period_label))].sort().at(-1) ?? null : null
  if (!latestPeriodLabel) {
    return []
  }

  const candidates = factRows
    .filter(row => row.period_label === latestPeriodLabel)
    .filter(row => row.analysis_bucket === ANALYSIS_BUCKET && row.hs6 === HS6_CODE)
    .filter(row => row.data_quality_flag !== 'aggregate_partner_excluded_or_flagged')
    .filter(row => typeof row.value_usd === 'number' && row.value_usd > 0)
    .sort((left, right) => (right.value_usd ?? 0) - (left.value_usd ?? 0))

  const verificationRows: CoffeeExportVerificationRow[] = []
  for (const candidate of candidates.slice(0, PARTNER_PORTAL_VERIFICATION_LIMIT * 2)) {
    const partnerIso = candidate.partner_iso?.toUpperCase()
    if (!partnerIso) {
      continue
    }

    const source = PARTNER_IMPORT_SOURCE_LOOKUP[partnerIso]
    if (!source) {
      continue
    }

    verificationRows.push({
      sync_run_id: syncRunId,
      period_type: periodType,
      period_label: latestPeriodLabel,
      reporter_iso: REPORTER_ISO,
      partner_iso: partnerIso,
      partner_country: candidate.partner_country,
      hs6: candidate.hs6,
      verification_type: 'official_partner_portal_reference',
      source_name: source.sourceName,
      source_url: source.sourceUrl,
      mirror_value_usd: null,
      mirror_quantity_ton: null,
      reported_value_usd: candidate.value_usd,
      reported_quantity_ton: candidate.quantity_ton,
      value_gap_pct: null,
      quantity_gap_pct: null,
      verification_status: 'not_automated',
      notes: source.notes,
      verified_at: verifiedAt,
    })

    if (verificationRows.length >= PARTNER_PORTAL_VERIFICATION_LIMIT) {
      break
    }
  }

  return verificationRows
}

function countWarnings(qc: CoffeeExportQcReport) {
  return (
    qc.missingValueRows +
    qc.missingQuantityRows +
    qc.zeroQuantityRows +
    qc.tinyQuantityRows +
    qc.suspiciousUnitPriceRows +
    qc.unsupportedHsCodeRows +
    qc.duplicateGrainRows
  )
}

export async function syncVietnamCoffeeExportByMarket(options: CoffeeExportSyncOptions = {}): Promise<CoffeeExportSyncResult> {
  const periodType = options.periodType ?? 'A'
  const hsScope = options.hsScope ?? DEFAULT_HS_SCOPE
  const targetHsCodes = normalizeTargetHsCodes({ hsScope, hsCodes: options.hsCodes })
  const periodWindow = parsePeriodWindow(options)
  const periods =
    periodType === 'A'
      ? buildAnnualPeriods(periodWindow)
      : buildMonthlyPeriods(Number.isFinite(options.monthlyMonths) ? Math.trunc(options.monthlyMonths as number) : 24)
  const periodChunks = getPeriodChunks(periodType, periods, options.requestChunkSize)
  const fetchedAt = new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const sourceUrl = toComtradePreviewUrl(periodType, periods, targetHsCodes)
  const shouldPersist = !dryRun && Boolean(getSupabaseAdminClient())

  const syncRunId = shouldPersist
    ? await startSyncRun(periodType, periodWindow, {
        periodCount: periods.length,
        periodChunks: periodChunks.length,
        hsScope,
        targetHsCodes,
      })
    : null

  let requestCount = 0
  const payloadRows: unknown[] = []

  try {
    for (const hsCode of targetHsCodes) {
      for (const chunk of periodChunks) {
        const rows = await retryTransient(
          () => fetchComtradePreviewChunk(periodType, chunk, [hsCode]),
          { attempts: 5, initialDelayMs: 800 },
        )
        payloadRows.push(...rows)
        requestCount += 1
      }
    }

    const prepared = prepareCoffeeExportRows(payloadRows, {
      periodType,
      targetHsCodes,
      fetchedAt,
      sourceUrl,
      syncRunId,
      queryParams: summarizePreviewQuery(periodType, periods, targetHsCodes),
    })

    const qc = buildCoffeeExportQcReport(prepared.factRows)
    const qcMarkdown = renderCoffeeExportQcMarkdown(qc, { generatedAt: fetchedAt, periodType, hsScope, targetHsCodes })

    const writesRawCoreArtifacts = hsScope === 'raw_core' && targetHsCodes.length === 1 && targetHsCodes[0] === HS6_CODE
    const productScopeSuffix = hsScope === 'all_hs6' ? 'all_hs6' : targetHsCodes.join('_')

    const rawCsvPath =
      writeArtifacts
        ? resolve(
            workspaceRoot,
            'data',
            'raw',
            'un_comtrade',
            writesRawCoreArtifacts
              ? `vietnam_coffee_090111_exports_${periodType === 'A' ? 'annual' : 'monthly'}.csv`
              : `vietnam_coffee_exports_${productScopeSuffix}_${periodType === 'A' ? 'annual' : 'monthly'}.csv`,
          )
        : null
    const factCsvPath =
      writeArtifacts
        ? resolve(
            workspaceRoot,
            'data',
            'processed',
            writesRawCoreArtifacts
              ? `fact_vietnam_coffee_export_by_market_${periodType.toLowerCase()}.csv`
              : `fact_vietnam_coffee_export_by_product_market_${periodType.toLowerCase()}.csv`,
          )
        : null
    const qcReportPath =
      writeArtifacts
        ? resolve(
            workspaceRoot,
            'reports',
            'data_quality',
            writesRawCoreArtifacts
              ? `vietnam_coffee_export_by_market_qc_${periodType.toLowerCase()}.md`
              : `vietnam_coffee_export_by_product_market_qc_${periodType.toLowerCase()}.md`,
          )
        : null

    if (rawCsvPath) {
      await writeArtifactFile(
        rawCsvPath,
        toCsv(
          prepared.rawRows.map(row => ({ ...row, raw_payload: JSON.stringify(row.raw_payload), query_params: JSON.stringify(row.query_params) })),
          [
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
            'mos_code',
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
          ],
        ),
      )
    }

    if (factCsvPath) {
      await writeArtifactFile(
        factCsvPath,
        toCsv(prepared.factRows, [
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
          'quantity_raw',
          'quantity_unit_raw',
          'net_weight_kg',
          'quantity_ton',
          'value_usd',
          'source_name',
          'source_url',
          'fetched_at',
          'data_quality_flag',
          'confidence_score',
          'notes',
        ]),
      )
    }

    if (qcReportPath) {
      await writeArtifactFile(qcReportPath, qcMarkdown)
    }

    let rawRowsPersisted = 0
    let factRowsPersisted = 0
    let verificationRowsPersisted = 0

    if (shouldPersist) {
      rawRowsPersisted = await upsertRowsInChunks(
        'raw_un_comtrade_vietnam_coffee_exports',
        prepared.rawRows,
        'period,reporter_code,partner_code,flow_code,cmd_code,source_name',
      )
      factRowsPersisted = await upsertRowsInChunks(
        'fact_vietnam_coffee_export_by_market',
        prepared.factRows,
        'period_type,period_label,reporter_iso,partner_iso,flow,hs6,source_name',
      )
      const portalVerificationRows = buildPortalVerificationRows(prepared.factRows, periodType, syncRunId, fetchedAt)
      verificationRowsPersisted = await upsertRowsInChunks(
        'coffee_export_market_verifications',
        portalVerificationRows,
        'period_type,period_label,reporter_iso,partner_iso,hs6,verification_type,source_name',
      )
    }

    const warningCount = countWarnings(qc)
    const status: Exclude<CoffeeExportSyncRunStatus, 'running'> = warningCount > 0 ? 'partial' : 'success'
    await finishSyncRun(syncRunId, {
      status,
      requestCount,
      rawRowCount: prepared.rawRows.length,
      factRowCount: prepared.factRows.length,
      verificationRowCount: verificationRowsPersisted,
      warningCount,
      metadata: {
        periodType,
        requestedPeriods: periods,
        availablePeriods: prepared.availablePeriodLabels,
        unitDistribution: prepared.unitDistribution,
        hs6Distribution: prepared.hs6Distribution,
        excludedRows: prepared.excludedRows,
        duplicateRowsCollapsed: prepared.duplicateRowsCollapsed,
      },
    })

    return {
      periodType,
      hsScope,
      targetHsCodes,
      requestedPeriods: periods,
      sourceUrl,
      sourceName: SOURCE_NAME,
      fetchedAt,
      requestCount,
      rawRowsFetched: prepared.rawRowsFetched,
      rawRowsPrepared: prepared.rawRowsPrepared,
      rawRowsPersisted,
      factRowsPrepared: prepared.factRows.length,
      factRowsPersisted,
      verificationRowsPersisted,
      excludedRows: prepared.excludedRows,
      duplicateRowsCollapsed: prepared.duplicateRowsCollapsed,
      availablePeriodLabels: prepared.availablePeriodLabels,
      unitDistribution: prepared.unitDistribution,
      hs6Distribution: prepared.hs6Distribution,
      qc,
      artifacts: {
        rawCsvPath,
        factCsvPath,
        qcReportPath,
      },
    }
  } catch (error) {
    await finishSyncRun(syncRunId, {
      status: 'failed',
      requestCount,
      rawRowCount: 0,
      factRowCount: 0,
      verificationRowCount: 0,
      warningCount: 0,
      metadata: {
        periodType,
        hsScope,
        targetHsCodes,
        requestedPeriods: periods,
      },
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
