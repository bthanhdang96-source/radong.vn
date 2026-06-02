import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export const FREIGHT_PROXY_TYPES = [
  'freight_index',
  'route_index',
  'port_congestion',
  'container_availability',
  'transit_disruption',
  'fuel_surcharge',
  'logistics_event',
  'other',
] as const

export const FREIGHT_RELEVANCE_VALUES = ['high', 'medium', 'low', 'unclear'] as const
export const FREIGHT_UNITS = ['USD/FEU', 'USD/TEU', 'index_points', 'days', 'text_event', 'unknown'] as const
export const FREIGHT_QUALITY_FLAGS = [
  'ok',
  'missing_source_url',
  'missing_observation_date',
  'missing_unit',
  'unknown_unit',
  'index_points_not_usd',
  'possible_duplicate',
  'low_relevance_to_coffee',
  'suspicious_value',
  'needs_human_review',
] as const

export type FreightProxyType = (typeof FREIGHT_PROXY_TYPES)[number]
export type FreightRelevance = (typeof FREIGHT_RELEVANCE_VALUES)[number]
export type FreightUnit = (typeof FREIGHT_UNITS)[number]
export type FreightQualityFlag = (typeof FREIGHT_QUALITY_FLAGS)[number]

export type FreightLogisticsInputRow = {
  observationDate: string | null
  indexName: string | null
  proxyType: string | null
  routeName: string | null
  originRegion: string | null
  destinationRegion: string | null
  freightValue: number | null
  currency: string | null
  unit: string | null
  relevanceToCoffee: string | null
  relevanceNotes: string | null
  sourceName: string | null
  sourceUrl: string | null
  fetchedAt: string | null
  confidenceScore: number | null
  notes: string | null
  rawPayload: Record<string, unknown>
  fromPublicAdapter: boolean
}

type RawFreightLogisticsProxyRow = {
  fetched_at: string
  source_name: string
  source_url: string
  source_id: string | null
  observation_date: string | null
  index_name: string | null
  proxy_type: string | null
  route_name: string | null
  origin_region: string | null
  destination_region: string | null
  freight_value: number | null
  currency: string | null
  unit: string | null
  relevance_to_coffee: string | null
  relevance_notes: string | null
  notes: string | null
  raw_payload: Record<string, unknown>
}

export type FreightLogisticsFactRow = {
  observation_date: string
  commodity_group: 'coffee'
  index_name: string
  proxy_type: FreightProxyType
  route_name: string | null
  origin_region: string | null
  destination_region: string | null
  freight_value: number | null
  currency: string | null
  unit: FreightUnit
  normalized_value_usd_per_feu: number | null
  wow_change_pct: number | null
  mom_change_pct: number | null
  yoy_change_pct: number | null
  relevance_to_coffee: FreightRelevance
  relevance_notes: string | null
  source_name: string
  source_url: string
  fetched_at: string
  data_quality_flag: FreightQualityFlag
  confidence_score: number
  notes: string
  raw_payload: Record<string, unknown>
}

export type FreightSourceError = {
  sourceId: string
  sourceName: string
  sourceUrl: string
  message: string
}

export type FreightLogisticsQcReport = {
  totalRows: number
  dateRange: { min: string | null; max: string | null }
  flagCounts: Record<FreightQualityFlag, number>
  unitCounts: Record<string, number>
  proxyTypeCounts: Record<string, number>
  duplicateRows: FreightLogisticsFactRow[]
  suspiciousRows: FreightLogisticsFactRow[]
  lowRelevanceRows: FreightLogisticsFactRow[]
  latestRows: FreightLogisticsFactRow[]
  teuConvertedRows: FreightLogisticsFactRow[]
  indexPointRows: FreightLogisticsFactRow[]
  eventRowsMissingNotes: FreightLogisticsFactRow[]
  sourceErrors: FreightSourceError[]
}

export type FreightLogisticsPreparedRows = {
  rawRows: RawFreightLogisticsProxyRow[]
  factRows: FreightLogisticsFactRow[]
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  qc: FreightLogisticsQcReport
}

export type FreightLogisticsSyncOptions = {
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  fetchedAt?: string
  seedCsvPath?: string
  fetchSources?: boolean
  sourceIds?: string[]
  fromDate?: string
  toDate?: string
  sourceRows?: FreightLogisticsInputRow[]
}

export type FreightLogisticsSyncResult = {
  fetchedAt: string
  rawRowsPrepared: number
  rawRowsPersisted: number
  factRowsPrepared: number
  factRowsPersisted: number
  sourceRowsFetched: number
  sourceErrors: FreightSourceError[]
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  qc: FreightLogisticsQcReport
  rows: FreightLogisticsFactRow[]
  artifacts: {
    rawCsvPath: string | null
    factCsvPath: string | null
    qcReportPath: string | null
    sourceResearchPath: string | null
    methodologyPath: string | null
  }
}

export type FreightLogisticsItem = {
  observationDate: string
  indexName: string
  proxyType: FreightProxyType
  routeName: string | null
  originRegion: string | null
  destinationRegion: string | null
  freightValue: number | null
  currency: string | null
  unit: FreightUnit
  normalizedValueUsdPerFeu: number | null
  wowChangePct: number | null
  momChangePct: number | null
  yoyChangePct: number | null
  relevanceToCoffee: FreightRelevance
  relevanceNotes: string | null
  sourceName: string
  sourceUrl: string
  confidenceScore: number
  dataQualityFlag: FreightQualityFlag
  notes: string
}

export type FreightLogisticsResponse = {
  success: boolean
  status: 'live' | 'fallback'
  lastUpdated: string
  count: number
  data: FreightLogisticsItem[]
  errors: string[]
}

type FreightSourceDescriptor = {
  id: string
  sourceName: string
  sourceUrl: string
  sourceType: 'drewry_public_page' | 'scfi_public_page' | 'logistics_event_page' | 'source_research'
  reliabilityScore: number
  enabledByDefault: boolean
  notes: string
}

export const FREIGHT_LOGISTICS_SOURCES: FreightSourceDescriptor[] = [
  {
    id: 'drewry_wci_public',
    sourceName: 'Drewry World Container Index',
    sourceUrl: 'https://www.drewry.co.uk/wci',
    sourceType: 'drewry_public_page',
    reliabilityScore: 0.82,
    enabledByDefault: true,
    notes: 'Public WCI page may expose composite and route snippets in USD per 40ft container; do not bypass paid access.',
  },
  {
    id: 'scfi_public',
    sourceName: 'Shanghai Shipping Exchange SCFI',
    sourceUrl: 'https://en.sse.net.cn/indices/scfi.jsp',
    sourceType: 'scfi_public_page',
    reliabilityScore: 0.78,
    enabledByDefault: true,
    notes: 'SCFI is index-points context and must not be converted to USD/FEU.',
  },
  {
    id: 'loadstar_public',
    sourceName: 'The Loadstar public logistics updates',
    sourceUrl: 'https://theloadstar.com/',
    sourceType: 'logistics_event_page',
    reliabilityScore: 0.66,
    enabledByDefault: true,
    notes: 'Public logistics headlines are stored as event context requiring human review.',
  },
  {
    id: 'freightos_fbx_research',
    sourceName: 'Freightos Baltic Index methodology',
    sourceUrl: 'https://www.freightos.com/data/',
    sourceType: 'source_research',
    reliabilityScore: 0.84,
    enabledByDefault: false,
    notes: 'FBX route data is valuable but numeric ingestion requires a clearly public value/API permission.',
  },
  {
    id: 'xeneta_research',
    sourceName: 'Xeneta public methodology',
    sourceUrl: 'https://help.xeneta.com/docs/rate-structure-and-methodology',
    sourceType: 'source_research',
    reliabilityScore: 0.75,
    enabledByDefault: false,
    notes: 'Xeneta public methodology is useful for source research; do not ingest paid platform values.',
  },
]

const ALLOWED_UNIT_SET = new Set<string>(FREIGHT_UNITS)
const COMMODITY_GROUP = 'coffee'

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[$,%\s]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function roundNumber(value: number, digits = 3) {
  return Number(value.toFixed(digits))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toIsoDate(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
  }
  return parsed.toISOString().slice(0, 10)
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }
  values.push(current)
  return values
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.length > 0)
  if (lines.length === 0) {
    return []
  }
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
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

function stripHtml(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeProxyType(value: string | null | undefined): FreightProxyType {
  const normalized = normalizeText(value)?.toLowerCase()
  return FREIGHT_PROXY_TYPES.includes(normalized as FreightProxyType) ? (normalized as FreightProxyType) : 'other'
}

function normalizeRelevance(value: string | null | undefined): FreightRelevance {
  const normalized = normalizeText(value)?.toLowerCase()
  return FREIGHT_RELEVANCE_VALUES.includes(normalized as FreightRelevance) ? (normalized as FreightRelevance) : 'unclear'
}

function normalizeUnit(value: string | null | undefined): FreightUnit | null {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  const lower = normalized.toLowerCase()
  if (['usd/feu', 'usd per feu', 'usd/40ft', 'usd per 40ft', 'usd per 40ft container', '$/40ft'].includes(lower)) {
    return 'USD/FEU'
  }
  if (['usd/teu', 'usd per teu', 'usd/20ft', 'usd per 20ft', '$/teu'].includes(lower)) {
    return 'USD/TEU'
  }
  if (['index_points', 'index points', 'points', 'pts'].includes(lower)) {
    return 'index_points'
  }
  if (['days', 'day'].includes(lower)) {
    return 'days'
  }
  if (['text_event', 'event', 'text'].includes(lower)) {
    return 'text_event'
  }
  return ALLOWED_UNIT_SET.has(normalized) ? (normalized as FreightUnit) : 'unknown'
}

export function normalizeFreightValueToUsdPerFeu(value: number | null, unit: string | null | undefined) {
  const normalizedUnit = normalizeUnit(unit)
  if (value === null || !Number.isFinite(value)) {
    return { normalizedValueUsdPerFeu: null, unit: normalizedUnit, note: null }
  }
  if (normalizedUnit === 'USD/FEU') {
    return { normalizedValueUsdPerFeu: value, unit: normalizedUnit, note: null }
  }
  if (normalizedUnit === 'USD/TEU') {
    return {
      normalizedValueUsdPerFeu: roundNumber(value * 2, 3),
      unit: normalizedUnit,
      note: 'TEU-to-FEU conversion is approximate.',
    }
  }
  return { normalizedValueUsdPerFeu: null, unit: normalizedUnit, note: null }
}

function isSuspiciousValue(value: number | null) {
  return value !== null && (value <= 0 || value > 30_000)
}

function resolveQualityFlag(input: {
  observationDate: string | null
  sourceUrl: string | null
  unit: FreightUnit | null
  normalizedValueUsdPerFeu: number | null
  freightValue: number | null
  relevanceToCoffee: FreightRelevance
  fromPublicAdapter: boolean
}): FreightQualityFlag {
  if (!input.sourceUrl) return 'missing_source_url'
  if (!input.observationDate) return 'missing_observation_date'
  if (!input.unit) return 'missing_unit'
  if (input.unit === 'unknown') return 'unknown_unit'
  if (input.unit === 'index_points' && input.normalizedValueUsdPerFeu === null) return 'index_points_not_usd'
  if (input.relevanceToCoffee === 'low') return 'low_relevance_to_coffee'
  if (isSuspiciousValue(input.normalizedValueUsdPerFeu) || isSuspiciousValue(input.freightValue)) return 'suspicious_value'
  if (input.fromPublicAdapter) return 'needs_human_review'
  return 'ok'
}

function scoreConfidence(input: {
  provided: number | null
  sourceName: string
  sourceUrl: string
  unit: FreightUnit | null
  routeName: string | null
  observationDate: string | null
  proxyType: FreightProxyType
  flag: FreightQualityFlag
}) {
  if (input.provided !== null) {
    return roundNumber(clamp(input.provided, 0, 1), 3)
  }
  const haystack = `${input.sourceName} ${input.sourceUrl}`
  let score = 0.55
  if (/drewry|freightos|baltic/i.test(haystack)) score = 0.82
  else if (/xeneta/i.test(haystack)) score = 0.75
  else if (/shanghai shipping exchange|scfi/i.test(haystack)) score = 0.78
  else if (/loadstar|container news|port/i.test(haystack)) score = 0.65
  if (!input.unit || input.unit === 'unknown') score -= 0.20
  if (!input.observationDate) score -= 0.20
  if (!input.routeName && input.proxyType === 'route_index') score -= 0.10
  if (input.proxyType === 'logistics_event' || input.unit === 'text_event') score -= 0.12
  if (input.flag !== 'ok') score -= 0.10
  return roundNumber(clamp(score, 0.30, 0.90), 3)
}

function normalizeInputRecord(record: Record<string, string>): FreightLogisticsInputRow {
  return {
    observationDate: normalizeText(record.observation_date),
    indexName: normalizeText(record.index_name),
    proxyType: normalizeText(record.proxy_type),
    routeName: normalizeText(record.route_name),
    originRegion: normalizeText(record.origin_region),
    destinationRegion: normalizeText(record.destination_region),
    freightValue: toNumber(record.freight_value),
    currency: normalizeText(record.currency),
    unit: normalizeText(record.unit),
    relevanceToCoffee: normalizeText(record.relevance_to_coffee),
    relevanceNotes: normalizeText(record.relevance_notes),
    sourceName: normalizeText(record.source_name),
    sourceUrl: normalizeText(record.source_url),
    fetchedAt: normalizeText(record.fetched_at),
    confidenceScore: toNumber(record.confidence_score),
    notes: normalizeText(record.notes),
    rawPayload: { source: 'freight_logistics_proxy_csv', record },
    fromPublicAdapter: false,
  }
}

async function loadInputRowsFromCsv(seedCsvPath: string) {
  try {
    return parseCsv(await readFile(seedCsvPath, 'utf-8')).map(normalizeInputRecord)
  } catch {
    return []
  }
}

function toRawRow(input: FreightLogisticsInputRow, fetchedAt: string): RawFreightLogisticsProxyRow {
  return {
    fetched_at: input.fetchedAt ?? fetchedAt,
    source_name: input.sourceName ?? 'Unknown source',
    source_url: input.sourceUrl ?? '',
    source_id: typeof input.rawPayload.source === 'string' ? input.rawPayload.source : null,
    observation_date: toIsoDate(input.observationDate),
    index_name: input.indexName,
    proxy_type: input.proxyType,
    route_name: input.routeName,
    origin_region: input.originRegion,
    destination_region: input.destinationRegion,
    freight_value: input.freightValue,
    currency: input.currency,
    unit: input.unit,
    relevance_to_coffee: input.relevanceToCoffee,
    relevance_notes: input.relevanceNotes,
    notes: input.notes,
    raw_payload: input.rawPayload,
  }
}

function toFactRow(input: FreightLogisticsInputRow, fetchedAt: string): FreightLogisticsFactRow {
  const observationDate = toIsoDate(input.observationDate)
  const proxyType = normalizeProxyType(input.proxyType)
  const relevanceToCoffee = normalizeRelevance(input.relevanceToCoffee)
  const normalized = normalizeFreightValueToUsdPerFeu(input.freightValue, input.unit)
  const unit = normalized.unit
  const sourceName = input.sourceName ?? 'Unknown source'
  const sourceUrl = input.sourceUrl ?? ''
  const conversionNote = normalized.note ? `${normalized.note} ` : ''
  const flag = resolveQualityFlag({
    observationDate,
    sourceUrl,
    unit,
    normalizedValueUsdPerFeu: normalized.normalizedValueUsdPerFeu,
    freightValue: input.freightValue,
    relevanceToCoffee,
    fromPublicAdapter: input.fromPublicAdapter,
  })
  const confidence = scoreConfidence({
    provided: input.confidenceScore,
    sourceName,
    sourceUrl,
    unit,
    routeName: input.routeName,
    observationDate,
    proxyType,
    flag,
  })

  return {
    observation_date: observationDate ?? fetchedAt.slice(0, 10),
    commodity_group: COMMODITY_GROUP,
    index_name: input.indexName ?? 'Unknown freight proxy',
    proxy_type: proxyType,
    route_name: input.routeName,
    origin_region: input.originRegion,
    destination_region: input.destinationRegion,
    freight_value: input.freightValue,
    currency: input.currency,
    unit: unit ?? 'unknown',
    normalized_value_usd_per_feu: normalized.normalizedValueUsdPerFeu,
    wow_change_pct: null,
    mom_change_pct: null,
    yoy_change_pct: null,
    relevance_to_coffee: relevanceToCoffee,
    relevance_notes: input.relevanceNotes,
    source_name: sourceName,
    source_url: sourceUrl || `missing-source-url://${sourceName}`,
    fetched_at: input.fetchedAt ?? fetchedAt,
    data_quality_flag: flag,
    confidence_score: confidence,
    notes: `${conversionNote}${input.notes ?? ''}`.trim(),
    raw_payload: input.rawPayload,
  }
}

function buildRawKey(row: RawFreightLogisticsProxyRow) {
  return `${row.source_name}|${row.source_url}|${row.observation_date ?? ''}|${row.index_name ?? ''}|${row.route_name ?? ''}`
}

function buildFactKey(row: FreightLogisticsFactRow) {
  return `${row.observation_date}|${row.index_name}|${row.route_name ?? ''}|${row.source_name}`
}

function daysBetween(left: string, right: string) {
  const leftTime = new Date(`${left}T00:00:00.000Z`).getTime()
  const rightTime = new Date(`${right}T00:00:00.000Z`).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return Number.POSITIVE_INFINITY
  return Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000)
}

function applyChangeMetrics(rows: FreightLogisticsFactRow[]) {
  const groups = new Map<string, FreightLogisticsFactRow[]>()
  for (const row of rows) {
    if (row.normalized_value_usd_per_feu === null) continue
    const key = `${row.index_name}|${row.route_name ?? ''}`
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }

  for (const bucket of groups.values()) {
    bucket.sort((left, right) => left.observation_date.localeCompare(right.observation_date))
    for (let index = 0; index < bucket.length; index += 1) {
      const current = bucket[index]
      const previous = bucket.slice(0, index).reverse()
      const currentValue = current.normalized_value_usd_per_feu
      if (currentValue === null) continue
      const week = previous.find(row => daysBetween(row.observation_date, current.observation_date) >= 5)
      const month = previous.find(row => daysBetween(row.observation_date, current.observation_date) >= 25)
      const year = previous.find(row => daysBetween(row.observation_date, current.observation_date) >= 330)
      current.wow_change_pct = calculateChange(currentValue, week?.normalized_value_usd_per_feu ?? null)
      current.mom_change_pct = calculateChange(currentValue, month?.normalized_value_usd_per_feu ?? null)
      current.yoy_change_pct = calculateChange(currentValue, year?.normalized_value_usd_per_feu ?? null)
    }
  }
}

function calculateChange(current: number, previous: number | null) {
  if (previous === null || previous === 0) return null
  return roundNumber(100 * (current / previous - 1), 3)
}

function applyDuplicateFlags(rows: FreightLogisticsFactRow[]) {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = buildFactKey(row)
    if (seen.has(key) && row.data_quality_flag === 'ok') {
      row.data_quality_flag = 'possible_duplicate'
      row.confidence_score = Math.min(row.confidence_score, 0.55)
      row.notes = `${row.notes} Possible duplicate freight proxy grain.`.trim()
    }
    seen.add(key)
  }
}

export function prepareFreightLogisticsRows(
  inputs: FreightLogisticsInputRow[],
  options: { fetchedAt: string; sourceErrors?: FreightSourceError[] },
): FreightLogisticsPreparedRows {
  const rawRowsByKey = new Map<string, RawFreightLogisticsProxyRow>()
  const factRowsByKey = new Map<string, FreightLogisticsFactRow>()

  for (const input of inputs) {
    const rawRow = toRawRow(input, options.fetchedAt)
    const rawKey = buildRawKey(rawRow)
    rawRowsByKey.set(rawKey, rawRow)
    const factRow = toFactRow(input, options.fetchedAt)
    const factKey = buildFactKey(factRow)
    factRowsByKey.set(factKey, factRow)
  }

  const rawRows = [...rawRowsByKey.values()].sort((left, right) => (right.observation_date ?? '').localeCompare(left.observation_date ?? ''))
  const factRows = [...factRowsByKey.values()].sort((left, right) => right.observation_date.localeCompare(left.observation_date))
  applyChangeMetrics(factRows)
  applyDuplicateFlags(factRows)
  const qc = buildFreightLogisticsQcReport(factRows, options.sourceErrors ?? [])

  return {
    rawRows,
    factRows,
    duplicateRawRowsCollapsed: inputs.length - rawRows.length,
    duplicateFactRowsCollapsed: rawRows.length - factRows.length,
    qc,
  }
}

function buildFreightLogisticsQcReport(rows: FreightLogisticsFactRow[], sourceErrors: FreightSourceError[]): FreightLogisticsQcReport {
  const flagCounts = Object.fromEntries(FREIGHT_QUALITY_FLAGS.map(flag => [flag, 0])) as Record<FreightQualityFlag, number>
  const unitCounts: Record<string, number> = {}
  const proxyTypeCounts: Record<string, number> = {}
  const keyCounts = new Map<string, number>()

  for (const row of rows) {
    flagCounts[row.data_quality_flag] += 1
    unitCounts[row.unit] = (unitCounts[row.unit] ?? 0) + 1
    proxyTypeCounts[row.proxy_type] = (proxyTypeCounts[row.proxy_type] ?? 0) + 1
    const key = buildFactKey(row)
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }

  const dates = rows.map(row => row.observation_date).sort()
  return {
    totalRows: rows.length,
    dateRange: { min: dates[0] ?? null, max: dates.at(-1) ?? null },
    flagCounts,
    unitCounts,
    proxyTypeCounts,
    duplicateRows: rows.filter(row => (keyCounts.get(buildFactKey(row)) ?? 0) > 1 || row.data_quality_flag === 'possible_duplicate'),
    suspiciousRows: rows.filter(row => row.data_quality_flag === 'suspicious_value'),
    lowRelevanceRows: rows.filter(row => row.data_quality_flag === 'low_relevance_to_coffee'),
    latestRows: rows.slice(0, 20),
    teuConvertedRows: rows.filter(row => row.unit === 'USD/TEU'),
    indexPointRows: rows.filter(row => row.unit === 'index_points'),
    eventRowsMissingNotes: rows.filter(row => row.unit === 'text_event' && !row.notes),
    sourceErrors,
  }
}

export function parseDrewryWciPublicHtml(html: string, options: { fetchedAt: string; sourceUrl?: string }): FreightLogisticsInputRow[] {
  const text = stripHtml(html)
  const observed = text.match(/(\d{1,2}\s+[A-Za-z]+\s+20\d{2})|20\d{2}-\d{2}-\d{2}/)?.[0] ?? options.fetchedAt.slice(0, 10)
  const rows: FreightLogisticsInputRow[] = []
  const composite = text.match(/World Container Index[^$]{0,120}\$?([0-9][0-9,]*(?:\.\d+)?)[^.]{0,80}(?:40ft|40-foot|per 40ft|container)/i)
  if (composite) {
    rows.push(adapterRow({
      observationDate: observed,
      indexName: 'Drewry World Container Index Composite',
      proxyType: 'freight_index',
      routeName: 'Composite',
      originRegion: 'Global',
      destinationRegion: 'Global',
      freightValue: toNumber(composite[1]),
      currency: 'USD',
      unit: 'USD/FEU',
      relevanceToCoffee: 'medium',
      relevanceNotes: 'Global container freight benchmark; broad landed-cost proxy only.',
      sourceName: 'Drewry World Container Index',
      sourceUrl: options.sourceUrl ?? 'https://www.drewry.co.uk/wci',
      confidenceScore: null,
      notes: 'Parsed from public WCI page; route-level quote not implied.',
      rawPayload: { parser: 'drewry_wci_public_html', excerpt: composite[0] },
    }))
  }

  const routePatterns: Array<{ name: string; origin: string; destination: string; pattern: RegExp }> = [
    { name: 'Shanghai to Rotterdam', origin: 'Asia', destination: 'Europe', pattern: /Shanghai\s+to\s+Rotterdam[^$]{0,80}\$?([0-9][0-9,]*(?:\.\d+)?)/i },
    { name: 'Shanghai to Los Angeles', origin: 'Asia', destination: 'North America West Coast', pattern: /Shanghai\s+to\s+Los Angeles[^$]{0,80}\$?([0-9][0-9,]*(?:\.\d+)?)/i },
    { name: 'Shanghai to New York', origin: 'Asia', destination: 'North America East Coast', pattern: /Shanghai\s+to\s+New York[^$]{0,80}\$?([0-9][0-9,]*(?:\.\d+)?)/i },
  ]
  for (const route of routePatterns) {
    const match = text.match(route.pattern)
    if (!match) continue
    rows.push(adapterRow({
      observationDate: observed,
      indexName: 'Drewry World Container Index Route',
      proxyType: 'route_index',
      routeName: route.name,
      originRegion: route.origin,
      destinationRegion: route.destination,
      freightValue: toNumber(match[1]),
      currency: 'USD',
      unit: 'USD/FEU',
      relevanceToCoffee: route.destination.includes('Europe') ? 'high' : 'medium',
      relevanceNotes: 'Route proxy for Vietnam coffee destination region, not a Vietnam-origin quote.',
      sourceName: 'Drewry World Container Index',
      sourceUrl: options.sourceUrl ?? 'https://www.drewry.co.uk/wci',
      confidenceScore: null,
      notes: 'Parsed from public WCI page; use as route-level proxy only.',
      rawPayload: { parser: 'drewry_wci_public_html', excerpt: match[0] },
    }))
  }
  return rows
}

export function parseScfiPublicHtml(html: string, options: { fetchedAt: string; sourceUrl?: string }): FreightLogisticsInputRow[] {
  const text = stripHtml(html)
  const observed = text.match(/(\d{1,2}\s+[A-Za-z]+\s+20\d{2})|20\d{2}-\d{2}-\d{2}/)?.[0] ?? options.fetchedAt.slice(0, 10)
  const match = text.match(/SCFI[^0-9]{0,80}([0-9][0-9,]*(?:\.\d+)?)\s*(?:points|pts)?/i)
  if (!match) return []
  return [adapterRow({
    observationDate: observed,
    indexName: 'Shanghai Containerized Freight Index',
    proxyType: 'freight_index',
    routeName: 'SCFI Composite',
    originRegion: 'Shanghai / China',
    destinationRegion: 'Global',
    freightValue: toNumber(match[1]),
    currency: null,
    unit: 'index_points',
    relevanceToCoffee: 'medium',
    relevanceNotes: 'SCFI is a China export container freight index proxy; it is not USD/FEU.',
    sourceName: 'Shanghai Shipping Exchange',
    sourceUrl: options.sourceUrl ?? 'https://en.sse.net.cn/indices/scfi.jsp',
    confidenceScore: null,
    notes: 'Index points are not converted to USD/FEU.',
    rawPayload: { parser: 'scfi_public_html', excerpt: match[0] },
  })]
}

export function parseLogisticsEventPublicHtml(html: string, source: FreightSourceDescriptor, options: { fetchedAt: string }): FreightLogisticsInputRow[] {
  const text = stripHtml(html)
  const sentences = text.split(/(?<=[.!?])\s+/).filter(sentence => /coffee|container|port|congestion|freight|shipping|red sea|cai mep|cat lai/i.test(sentence))
  return sentences.slice(0, 5).map((sentence, index) => adapterRow({
    observationDate: options.fetchedAt.slice(0, 10),
    indexName: `${source.sourceName} logistics event`,
    proxyType: /congestion/i.test(sentence) ? 'port_congestion' : /red sea|disruption/i.test(sentence) ? 'transit_disruption' : 'logistics_event',
    routeName: null,
    originRegion: null,
    destinationRegion: null,
    freightValue: null,
    currency: null,
    unit: 'text_event',
    relevanceToCoffee: /coffee|vietnam|cai mep|cat lai/i.test(sentence) ? 'high' : 'medium',
    relevanceNotes: 'Public logistics event context; no exact freight quote.',
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    confidenceScore: null,
    notes: sentence.slice(0, 260),
    rawPayload: { parser: 'logistics_event_public_html', index },
  }))
}

function adapterRow(overrides: Omit<FreightLogisticsInputRow, 'fromPublicAdapter' | 'fetchedAt'> & { fetchedAt?: string | null }): FreightLogisticsInputRow {
  return { fetchedAt: null, ...overrides, fromPublicAdapter: true }
}

async function fetchSourceText(url: string) {
  return retryTransient(async () => {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'NongSanVN freight logistics proxy adapter/1.0',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }
    return response.text()
  }, { attempts: 3, initialDelayMs: 600 })
}

export async function fetchFreightLogisticsSourceRows(options: {
  fetchedAt: string
  sourceIds?: string[]
}): Promise<{ rows: FreightLogisticsInputRow[]; errors: FreightSourceError[] }> {
  const requested = new Set(options.sourceIds ?? [])
  const sources = FREIGHT_LOGISTICS_SOURCES.filter(source => requested.size > 0 ? requested.has(source.id) : source.enabledByDefault)
  const rows: FreightLogisticsInputRow[] = []
  const errors: FreightSourceError[] = []

  for (const source of sources) {
    if (source.sourceType === 'source_research') {
      errors.push({ sourceId: source.id, sourceName: source.sourceName, sourceUrl: source.sourceUrl, message: 'Research-only source; numeric ingestion requires public value/API permission.' })
      continue
    }
    try {
      const html = await fetchSourceText(source.sourceUrl)
      if (source.sourceType === 'drewry_public_page') rows.push(...parseDrewryWciPublicHtml(html, { fetchedAt: options.fetchedAt, sourceUrl: source.sourceUrl }))
      if (source.sourceType === 'scfi_public_page') rows.push(...parseScfiPublicHtml(html, { fetchedAt: options.fetchedAt, sourceUrl: source.sourceUrl }))
      if (source.sourceType === 'logistics_event_page') rows.push(...parseLogisticsEventPublicHtml(html, source, { fetchedAt: options.fetchedAt }))
    } catch (error) {
      errors.push({ sourceId: source.id, sourceName: source.sourceName, sourceUrl: source.sourceUrl, message: error instanceof Error ? error.message : String(error) })
    }
  }

  return { rows, errors }
}

export function renderFreightLogisticsQcMarkdown(report: FreightLogisticsQcReport, options: { generatedAt: string }) {
  const lines = [
    '# Freight Logistics Proxy QC Report',
    '',
    `- Generated at: ${options.generatedAt}`,
    `- Total rows: ${report.totalRows}`,
    `- Date range: ${report.dateRange.min ?? 'n/a'} -> ${report.dateRange.max ?? 'n/a'}`,
    '',
    '## Data Quality Flags',
    '',
  ]
  for (const [flag, count] of Object.entries(report.flagCounts)) lines.push(`- ${flag}: ${count}`)
  lines.push('', '## Units', '')
  for (const [unit, count] of Object.entries(report.unitCounts).sort(([a], [b]) => a.localeCompare(b))) lines.push(`- ${unit}: ${count}`)
  lines.push('', '## Proxy Types', '')
  for (const [type, count] of Object.entries(report.proxyTypeCounts).sort(([a], [b]) => a.localeCompare(b))) lines.push(`- ${type}: ${count}`)

  lines.push('', '## TEU/FEU Conversion Check', '')
  if (report.teuConvertedRows.length > 0) {
    for (const row of report.teuConvertedRows.slice(0, 20)) lines.push(`- ${row.observation_date} | ${row.index_name} | ${row.route_name ?? 'n/a'} | ${row.freight_value} USD/TEU -> ${row.normalized_value_usd_per_feu} USD/FEU`)
  } else {
    lines.push('- none')
  }

  lines.push('', '## Index Points Not Converted', '')
  if (report.indexPointRows.length > 0) {
    for (const row of report.indexPointRows.slice(0, 20)) lines.push(`- ${row.observation_date} | ${row.index_name} | value=${row.freight_value}`)
  } else {
    lines.push('- none')
  }

  lines.push('', '## Duplicate Rows', '')
  if (report.duplicateRows.length > 0) {
    for (const row of report.duplicateRows.slice(0, 20)) lines.push(`- ${row.observation_date} | ${row.index_name} | ${row.route_name ?? 'n/a'} | ${row.source_name}`)
  } else {
    lines.push('- none')
  }

  lines.push('', '## Suspicious Values', '')
  if (report.suspiciousRows.length > 0) {
    for (const row of report.suspiciousRows.slice(0, 20)) lines.push(`- ${row.observation_date} | ${row.index_name} | ${row.normalized_value_usd_per_feu}`)
  } else {
    lines.push('- none')
  }

  lines.push('', '## Low Relevance To Coffee', '')
  if (report.lowRelevanceRows.length > 0) {
    for (const row of report.lowRelevanceRows.slice(0, 20)) lines.push(`- ${row.observation_date} | ${row.index_name} | ${row.relevance_notes ?? ''}`)
  } else {
    lines.push('- none')
  }

  lines.push('', '## Event-Only Rows With Missing Notes', '')
  if (report.eventRowsMissingNotes.length > 0) {
    for (const row of report.eventRowsMissingNotes.slice(0, 20)) lines.push(`- ${row.observation_date} | ${row.index_name}`)
  } else {
    lines.push('- none')
  }

  lines.push('', '## Latest Freight Observations', '')
  for (const row of report.latestRows) lines.push(`- ${row.observation_date} | ${row.index_name} | ${row.route_name ?? 'n/a'} | unit=${row.unit} | normalized=${row.normalized_value_usd_per_feu ?? 'n/a'} | flag=${row.data_quality_flag}`)

  lines.push('', '## Source Errors', '')
  if (report.sourceErrors.length > 0) {
    for (const error of report.sourceErrors) lines.push(`- ${error.sourceId}: ${error.message}`)
  } else {
    lines.push('- none')
  }

  lines.push(
    '',
    '## Interpretation Guardrails',
    '',
    '- Freight proxy is not a Vietnam coffee freight quote.',
    '- Route-level signals can help monitor landed-cost pressure, but they do not prove causality for mirror gaps or export unit values.',
    '- Index points are not converted to USD unless source methodology explicitly allows it.',
    '',
  )
  return lines.join('\n')
}

export function renderFreightLogisticsSourceResearchMarkdown(options: { generatedAt: string; sourceRowsFetched: number; sourceErrors: FreightSourceError[] }) {
  const lines = [
    '# Freight Logistics Proxy Source Research',
    '',
    `- Generated at: ${options.generatedAt}`,
    `- Public adapter rows fetched: ${options.sourceRowsFetched}`,
    '- Source strategy: fetch public pages where feasible; fall back to semi-manual CSV when public numeric values are unavailable.',
    '',
    '## Sources',
    '',
  ]
  for (const source of FREIGHT_LOGISTICS_SOURCES) {
    lines.push(`- ${source.id} | ${source.sourceName} | type=${source.sourceType} | enabled=${source.enabledByDefault} | reliability=${source.reliabilityScore}`)
    lines.push(`  Source: ${source.sourceUrl}`)
    lines.push(`  Note: ${source.notes}`)
  }
  lines.push('', '## Adapter Errors', '')
  if (options.sourceErrors.length > 0) {
    for (const error of options.sourceErrors) lines.push(`- ${error.sourceId}: ${error.message}`)
  } else {
    lines.push('- none')
  }
  lines.push(
    '',
    '## Licensing Notes',
    '',
    '- Do not scrape paid/restricted Drewry, FBX, or Xeneta datasets.',
    '- Public snippets are stored as proxy observations only when date/unit/source are visible.',
    '- Semi-manual rows must include source URL and notes for auditability.',
    '',
  )
  return lines.join('\n')
}

export function renderFreightLogisticsMethodology() {
  return [
    '# Freight Logistics Proxy Methodology',
    '',
    '## Scope',
    '',
    '- Commodity scope: coffee export intelligence.',
    '- Freight rows are route/global proxies, not transaction-level quotes.',
    '- Priority routes are Asia-Europe, Asia-US, and Asia-Northeast Asia where public data exists.',
    '',
    '## Unit Normalization',
    '',
    '- USD/FEU is kept unchanged.',
    '- USD/TEU is multiplied by 2 as an approximate FEU conversion.',
    '- index_points, days, text_event, and unknown units are not converted to USD/FEU.',
    '',
    '## Interpretation',
    '',
    '- Freight/logistics proxy can support Coffee Brief landed-cost and mirror-gap context.',
    '- Do not claim freight caused a mirror gap without stronger evidence.',
    '- Use cautious wording: route-level proxy, not a Vietnam coffee-specific freight quote.',
    '',
  ].join('\n')
}

async function writeArtifactFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function upsertRowsInChunks(tableName: string, rows: Record<string, unknown>[], onConflict: string, chunkSize = 500) {
  if (rows.length === 0) return 0
  const client = getSupabaseAdminClient()
  if (!client) return 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await client.from(tableName).upsert(rows.slice(index, index + chunkSize), { onConflict })
    if (error) throw error
  }
  return rows.length
}

const RAW_COLUMNS: Array<keyof RawFreightLogisticsProxyRow> = [
  'fetched_at',
  'source_name',
  'source_url',
  'source_id',
  'observation_date',
  'index_name',
  'proxy_type',
  'route_name',
  'origin_region',
  'destination_region',
  'freight_value',
  'currency',
  'unit',
  'relevance_to_coffee',
  'relevance_notes',
  'notes',
  'raw_payload',
]

const FACT_COLUMNS: Array<keyof FreightLogisticsFactRow> = [
  'observation_date',
  'commodity_group',
  'index_name',
  'proxy_type',
  'route_name',
  'origin_region',
  'destination_region',
  'freight_value',
  'currency',
  'unit',
  'normalized_value_usd_per_feu',
  'wow_change_pct',
  'mom_change_pct',
  'yoy_change_pct',
  'relevance_to_coffee',
  'relevance_notes',
  'source_name',
  'source_url',
  'fetched_at',
  'data_quality_flag',
  'confidence_score',
  'notes',
  'raw_payload',
]

export async function syncFreightLogisticsProxy(options: FreightLogisticsSyncOptions = {}): Promise<FreightLogisticsSyncResult> {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const seedCsvPath = resolve(options.seedCsvPath ?? resolve(workspaceRoot, 'data', 'raw', 'freight_logistics_proxy.csv'))
  const adapterResult = options.fetchSources ? await fetchFreightLogisticsSourceRows({ fetchedAt, sourceIds: options.sourceIds }) : { rows: [], errors: [] }
  const csvRows = options.sourceRows ?? await loadInputRowsFromCsv(seedCsvPath)
  const inputRows = [...csvRows, ...adapterResult.rows].filter(row => {
    const observationDate = toIsoDate(row.observationDate)
    if (options.fromDate && observationDate && observationDate < options.fromDate) return false
    if (options.toDate && observationDate && observationDate > options.toDate) return false
    return true
  })
  const prepared = prepareFreightLogisticsRows(inputRows, { fetchedAt, sourceErrors: adapterResult.errors })

  const rawCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'raw', 'freight_logistics_proxy.csv') : null
  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'fact_freight_logistics_proxy.csv') : null
  const qcReportPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'freight_logistics_proxy_qc.md') : null
  const sourceResearchPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'freight_logistics_proxy_source_research.md') : null
  const methodologyPath = writeArtifacts ? resolve(workspaceRoot, 'docs', 'methodology', 'freight_logistics_proxy_methodology.md') : null

  if (rawCsvPath) await writeArtifactFile(rawCsvPath, toCsv(prepared.rawRows, RAW_COLUMNS as string[]))
  if (factCsvPath) await writeArtifactFile(factCsvPath, toCsv(prepared.factRows, FACT_COLUMNS as string[]))
  if (qcReportPath) await writeArtifactFile(qcReportPath, renderFreightLogisticsQcMarkdown(prepared.qc, { generatedAt: fetchedAt }))
  if (sourceResearchPath) await writeArtifactFile(sourceResearchPath, renderFreightLogisticsSourceResearchMarkdown({ generatedAt: fetchedAt, sourceRowsFetched: adapterResult.rows.length, sourceErrors: adapterResult.errors }))
  if (methodologyPath) await writeArtifactFile(methodologyPath, renderFreightLogisticsMethodology())

  let rawRowsPersisted = 0
  let factRowsPersisted = 0
  if (!dryRun && getSupabaseAdminClient()) {
    rawRowsPersisted = await upsertRowsInChunks('raw_freight_logistics_proxy', prepared.rawRows, 'source_name,source_url,observation_date,index_name,route_name')
    factRowsPersisted = await upsertRowsInChunks('fact_freight_logistics_proxy', prepared.factRows, 'observation_date,index_name,route_name,source_name')
  }

  return {
    fetchedAt,
    rawRowsPrepared: prepared.rawRows.length,
    rawRowsPersisted,
    factRowsPrepared: prepared.factRows.length,
    factRowsPersisted,
    sourceRowsFetched: adapterResult.rows.length,
    sourceErrors: adapterResult.errors,
    duplicateRawRowsCollapsed: prepared.duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed: prepared.duplicateFactRowsCollapsed,
    qc: prepared.qc,
    rows: prepared.factRows,
    artifacts: { rawCsvPath, factCsvPath, qcReportPath, sourceResearchPath, methodologyPath },
  }
}

type FreightViewRow = Record<string, unknown>

function toFreightItem(row: FreightViewRow): FreightLogisticsItem {
  return {
    observationDate: String(row.observation_date),
    indexName: String(row.index_name),
    proxyType: normalizeProxyType(String(row.proxy_type)),
    routeName: normalizeText(row.route_name as string | null),
    originRegion: normalizeText(row.origin_region as string | null),
    destinationRegion: normalizeText(row.destination_region as string | null),
    freightValue: toNumber(row.freight_value),
    currency: normalizeText(row.currency as string | null),
    unit: normalizeUnit(row.unit as string | null) ?? 'unknown',
    normalizedValueUsdPerFeu: toNumber(row.normalized_value_usd_per_feu),
    wowChangePct: toNumber(row.wow_change_pct),
    momChangePct: toNumber(row.mom_change_pct),
    yoyChangePct: toNumber(row.yoy_change_pct),
    relevanceToCoffee: normalizeRelevance(row.relevance_to_coffee as string | null),
    relevanceNotes: normalizeText(row.relevance_notes as string | null),
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url),
    confidenceScore: toNumber(row.confidence_score) ?? 0,
    dataQualityFlag: FREIGHT_QUALITY_FLAGS.includes(row.data_quality_flag as FreightQualityFlag) ? (row.data_quality_flag as FreightQualityFlag) : 'needs_human_review',
    notes: normalizeText(row.notes as string | null) ?? '',
  }
}

function buildFallbackResponse(message: string): FreightLogisticsResponse {
  return { success: true, status: 'fallback', lastUpdated: new Date().toISOString(), count: 0, data: [], errors: [message] }
}

function isRelationMissing(message: string) {
  return message.includes('relation') || message.includes('does not exist')
}

async function getRowsFromView(viewName: string, limit: number) {
  const client = getSupabaseReadClient()
  if (!client) return null
  const { data, error } = await client.from(viewName).select('*').limit(limit)
  if (error) throw error
  return (data ?? []) as FreightViewRow[]
}

export async function getFreightLogisticsResponse(limit = 200): Promise<FreightLogisticsResponse> {
  if (!getSupabaseRuntimeStatus().hasReadConfig) return buildFallbackResponse('Freight logistics proxy requires Supabase curated data')
  try {
    const rows = await getRowsFromView('vw_coffee_logistics_context', Math.max(1, Math.min(limit, 500)))
    const data = (rows ?? []).map(toFreightItem)
    return { success: true, status: 'live', lastUpdated: data[0]?.observationDate ?? new Date().toISOString(), count: data.length, data, errors: [] }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) console.error('[Supabase Freight Logistics] Falling back:', error)
    return buildFallbackResponse('Freight logistics proxy is unavailable')
  }
}

export async function getFreightLogisticsEventsResponse(limit = 200): Promise<FreightLogisticsResponse> {
  if (!getSupabaseRuntimeStatus().hasReadConfig) return buildFallbackResponse('Freight logistics events require Supabase curated data')
  try {
    const rows = await getRowsFromView('vw_coffee_logistics_events', Math.max(1, Math.min(limit, 500)))
    const data = (rows ?? []).map(toFreightItem)
    return { success: true, status: 'live', lastUpdated: data[0]?.observationDate ?? new Date().toISOString(), count: data.length, data, errors: [] }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) console.error('[Supabase Freight Events] Falling back:', error)
    return buildFallbackResponse('Freight logistics events are unavailable')
  }
}

export async function getFreightLogisticsMonthlyResponse(limit = 100) {
  if (!getSupabaseRuntimeStatus().hasReadConfig) return { success: true, status: 'fallback', count: 0, data: [], errors: ['Freight monthly proxy requires Supabase curated data'] }
  try {
    const rows = await getRowsFromView('vw_freight_proxy_monthly', Math.max(1, Math.min(limit, 500)))
    return { success: true, status: 'live', count: rows?.length ?? 0, data: rows ?? [], errors: [] }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) console.error('[Supabase Freight Monthly] Falling back:', error)
    return { success: true, status: 'fallback', count: 0, data: [], errors: ['Freight monthly proxy is unavailable'] }
  }
}
