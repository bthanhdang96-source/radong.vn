import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from './supabaseClient.js'
import { retryTransient } from './transientNetwork.js'

export const ALLOWED_EVENT_TYPES = [
  'weather',
  'crop_outlook',
  'harvest',
  'export_policy',
  'import_policy',
  'regulation',
  'logistics',
  'inventory',
  'futures_market',
  'currency_fx',
  'demand_signal',
  'supply_signal',
  'trade_flow',
  'company_event',
  'macro',
  'other',
] as const

export const ALLOWED_IMPACT_DIRECTIONS = ['bullish', 'bearish', 'neutral', 'unclear'] as const
export const ALLOWED_IMPACT_AREAS = [
  'price',
  'supply',
  'demand',
  'logistics',
  'policy',
  'regulation',
  'fx',
  'inventory',
  'trade_flow',
  'market_sentiment',
  'other',
] as const
export const ALLOWED_TIME_HORIZONS = ['short_term', 'medium_term', 'long_term', 'unclear'] as const

export const ALLOWED_DATA_QUALITY_FLAGS = [
  'ok',
  'missing_event_date',
  'missing_source_url',
  'missing_event_title',
  'low_reliability_source',
  'possible_duplicate',
  'unclear_impact',
  'not_coffee_specific',
  'stale_event',
  'needs_human_review',
  'invalid_event_type',
  'invalid_impact_direction',
  'invalid_impact_score',
] as const

export type MarketEventType = (typeof ALLOWED_EVENT_TYPES)[number]
export type MarketImpactDirection = (typeof ALLOWED_IMPACT_DIRECTIONS)[number]
export type MarketImpactArea = (typeof ALLOWED_IMPACT_AREAS)[number]
export type MarketTimeHorizon = (typeof ALLOWED_TIME_HORIZONS)[number]
export type MarketEventQualityFlag = (typeof ALLOWED_DATA_QUALITY_FLAGS)[number]

type RawMarketEventItemRow = {
  fetched_at: string
  source_name: string | null
  source_url: string | null
  published_at: string | null
  title_raw: string | null
  summary_raw: string | null
  body_excerpt: string | null
  language: string | null
  detected_commodity: string | null
  detected_countries: string[]
  detected_event_type: string | null
  raw_payload: Record<string, unknown>
  processing_status: 'pending' | 'parsed' | 'rejected' | 'needs_human_review'
  notes: string | null
}

export type MarketEventFactRow = {
  event_date: string
  published_at: string | null
  commodity_group: string
  country_or_region: string | null
  country_iso: string | null
  event_type: MarketEventType
  event_title: string
  event_summary: string | null
  expected_impact_direction: MarketImpactDirection
  expected_impact_area: MarketImpactArea
  impact_score: number
  time_horizon: MarketTimeHorizon
  confidence_score: number
  source_name: string
  source_url: string
  source_reliability_score: number
  fetched_at: string
  event_cluster_id: string | null
  duplicate_of: string | null
  data_quality_flag: MarketEventQualityFlag
  entities: Record<string, unknown>
  raw_payload: Record<string, unknown>
  notes: string
}

export type MarketEventInputRow = {
  eventDate: string | null
  publishedAt: string | null
  commodityGroup: string | null
  countryOrRegion: string | null
  countryIso: string | null
  eventType: string | null
  eventTitle: string | null
  eventSummary: string | null
  expectedImpactDirection: string | null
  expectedImpactArea: string | null
  impactScore: number | null
  timeHorizon: string | null
  confidenceScore: number | null
  sourceName: string | null
  sourceUrl: string | null
  sourceReliabilityScore: number | null
  entities: Record<string, unknown> | null
  notes: string | null
  rawPayload: Record<string, unknown>
  fromRawFeed: boolean
}

export type CoffeeMarketEventItem = {
  eventDate: string
  publishedAt: string | null
  countryOrRegion: string | null
  countryIso: string | null
  eventType: MarketEventType
  eventTitle: string
  eventSummary: string | null
  expectedImpactDirection: MarketImpactDirection
  expectedImpactArea: MarketImpactArea
  impactScore: number
  timeHorizon: MarketTimeHorizon
  confidenceScore: number
  sourceName: string
  sourceUrl: string
  sourceReliabilityScore: number
  dataQualityFlag: MarketEventQualityFlag
  notes: string
}

export type CoffeeMarketEventsResponse = {
  success: boolean
  status: 'live' | 'fallback'
  lastUpdated: string
  count: number
  data: CoffeeMarketEventItem[]
  errors: string[]
}

export type MarketEventQcReport = {
  totalEvents: number
  eventDateRange: { min: string | null; max: string | null }
  countByEventType: Record<string, number>
  countByCountry: Record<string, number>
  countByImpactDirection: Record<string, number>
  countByQualityFlag: Record<MarketEventQualityFlag, number>
  lowReliabilityEvents: MarketEventFactRow[]
  unclearImpactEvents: MarketEventFactRow[]
  possibleDuplicateEvents: MarketEventFactRow[]
  usableForBriefEvents: MarketEventFactRow[]
  needsHumanReviewEvents: MarketEventFactRow[]
}

export type CoffeeMarketEventsPreparedRows = {
  rawRows: RawMarketEventItemRow[]
  factRows: MarketEventFactRow[]
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  qc: MarketEventQcReport
}

export type CoffeeMarketEventsSyncOptions = {
  dryRun?: boolean
  writeArtifacts?: boolean
  workspaceRoot?: string
  staleDays?: number
  fetchedAt?: string
  seedCsvPath?: string
  rawCsvPath?: string
  fetchSources?: boolean
  probeSources?: boolean
  sourceHealthOnly?: boolean
  maxItemsPerSource?: number
  sourceIds?: string[]
  sourceRows?: MarketEventInputRow[]
}

export type CoffeeMarketEventSourceError = {
  sourceId: string
  sourceName: string
  sourceUrl: string
  message: string
}

export type CoffeeMarketEventSourceFetchResult = {
  rows: MarketEventInputRow[]
  errors: CoffeeMarketEventSourceError[]
}

export const MARKET_EVENT_SOURCE_HEALTH_STATUSES = [
  'available',
  'empty',
  'auth_gated',
  'retired',
  'unsupported_html',
  'fetch_error',
] as const

export type MarketEventSourceHealthStatus = (typeof MARKET_EVENT_SOURCE_HEALTH_STATUSES)[number]

export type MarketEventSourceHealthRow = {
  sourceId: string
  sourceName: string
  sourceUrl: string
  sourceType: MarketEventSourceDescriptor['sourceType']
  sourceMode: MarketEventSourceDescriptor['sourceMode']
  enabledByDefault: boolean
  requiresManualReview: boolean
  reliabilityScore: number
  probedAt: string
  status: MarketEventSourceHealthStatus
  httpStatus: number | null
  contentType: string | null
  itemCount: number
  coffeeHitCount: number
  notes: string
  errorMessage: string | null
}

export type CoffeeMarketEventsSyncResult = {
  fetchedAt: string
  rawRowsPrepared: number
  rawRowsPersisted: number
  factRowsPrepared: number
  factRowsPersisted: number
  duplicateRawRowsCollapsed: number
  duplicateFactRowsCollapsed: number
  qc: MarketEventQcReport
  rows: MarketEventFactRow[]
  sourceRowsFetched: number
  sourceErrors: CoffeeMarketEventSourceError[]
  sourceHealth: MarketEventSourceHealthRow[]
  artifacts: {
    rawSourceCsvPath: string | null
    factCsvPath: string | null
    qcReportPath: string | null
    sourceResearchPath: string | null
    sourceHealthPath: string | null
    methodologyPath: string | null
  }
}

const COMMODITY_GROUP = 'coffee'
const DEFAULT_STALE_DAYS = 90
const BRIEF_MIN_CONFIDENCE = 0.60
const BRIEF_MIN_RELIABILITY = 0.60
const BRIEF_LOOKBACK_DAYS = 14

const feedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  trimValues: true,
})

type MarketEventSourceDescriptor = {
  id: string
  sourceName: string
  sourceUrl: string
  sourceType: 'rss' | 'api_research' | 'official_html_probe'
  sourceMode: 'enabled' | 'probe_only'
  reliabilityScore: number
  enabledByDefault: boolean
  requiresManualReview: boolean
  countryOrRegion: string | null
  countryIso: string | null
  notes: string
}

export const COFFEE_MARKET_EVENT_SOURCES: MarketEventSourceDescriptor[] = [
  {
    id: 'eurostat_agriculture_rss',
    sourceName: 'Eurostat Agriculture RSS',
    sourceUrl: 'https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss',
    sourceType: 'rss',
    sourceMode: 'enabled',
    reliabilityScore: 0.90,
    enabledByDefault: true,
    requiresManualReview: true,
    countryOrRegion: 'EU',
    countryIso: 'EUU',
    notes: 'Official EU statistics RSS. Coffee-specific rows are rare, so source health reports coffee hit counts separately.',
  },
  {
    id: 'usda_fas_gain_search_api',
    sourceName: 'USDA FAS GAIN public search',
    sourceUrl: 'https://gain.fas.usda.gov/#/search',
    sourceType: 'api_research',
    sourceMode: 'probe_only',
    reliabilityScore: 0.93,
    enabledByDefault: false,
    requiresManualReview: true,
    countryOrRegion: null,
    countryIso: null,
    notes: 'GAIN search is the preferred USDA/FAS coffee source, but the observed API requires auth at implementation time; keep disabled until a stable public endpoint or key is provided.',
  },
  {
    id: 'ico_public_updates',
    sourceName: 'International Coffee Organization updates',
    sourceUrl: 'https://ico.org/press-releases/',
    sourceType: 'official_html_probe',
    sourceMode: 'probe_only',
    reliabilityScore: 0.88,
    enabledByDefault: false,
    requiresManualReview: true,
    countryOrRegion: null,
    countryIso: null,
    notes: 'ICO is authoritative for coffee context, but this public page is HTML-only; numeric/event ingestion stays disabled without a stable RSS/API feed.',
  },
  {
    id: 'vietnam_official_portals',
    sourceName: 'Vietnam official coffee policy portals',
    sourceUrl: 'https://www.mard.gov.vn/',
    sourceType: 'official_html_probe',
    sourceMode: 'probe_only',
    reliabilityScore: 0.92,
    enabledByDefault: false,
    requiresManualReview: true,
    countryOrRegion: 'Vietnam',
    countryIso: 'VNM',
    notes: 'Vietnam official portals remain research-only until a stable RSS/API endpoint is confirmed; avoid brittle HTML scraping.',
  },
]

const SOURCE_RELIABILITY_HINTS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /(usda|fas|mard|customs|european commission|ec\.europa|government|gov\.vn)/i, score: 0.92 },
  { pattern: /(ico|international coffee organization|fao|world bank)/i, score: 0.88 },
  { pattern: /(reuters|bloomberg|associated press|ap news)/i, score: 0.85 },
  { pattern: /(association|federation|council)/i, score: 0.78 },
  { pattern: /(vietnambiz|congthuong|nongnghiepmoitruong|vietfood|kinhtenongthon)/i, score: 0.70 },
]

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function roundNumber(value: number, digits = 3) {
  return Number(value.toFixed(digits))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeText(value: string | null) {
  if (!value) {
    return null
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeCountryIso(value: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  const upper = normalized.toUpperCase()
  return /^[A-Z]{3}$/.test(upper) ? upper : null
}

function toIsoDate(value: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString().slice(0, 10)
}

function toIsoTimestamp(value: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map(item => (typeof item === 'string' ? normalizeText(item) : null))
    .filter((item): item is string => Boolean(item))
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

function stripHtml(value: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  return normalized.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function truncateText(value: string | null, maxLength = 260) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return normalized.slice(0, maxLength - 1).trimEnd()
}

function parseEntities(value: string | null): Record<string, unknown> | null {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  try {
    const parsed = JSON.parse(normalized)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function deriveSourceReliabilityScore(sourceName: string | null, sourceUrl: string | null) {
  const haystack = `${sourceName ?? ''} ${sourceUrl ?? ''}`.trim()
  if (!haystack) {
    return 0.55
  }
  for (const hint of SOURCE_RELIABILITY_HINTS) {
    if (hint.pattern.test(haystack)) {
      return hint.score
    }
  }
  return 0.65
}

function normalizeEventType(value: string | null): MarketEventType | null {
  const normalized = normalizeText(value)?.toLowerCase()
  if (!normalized) {
    return null
  }
  return (ALLOWED_EVENT_TYPES as readonly string[]).includes(normalized) ? (normalized as MarketEventType) : null
}

function normalizeImpactDirection(value: string | null): MarketImpactDirection | null {
  const normalized = normalizeText(value)?.toLowerCase()
  if (!normalized) {
    return null
  }
  return (ALLOWED_IMPACT_DIRECTIONS as readonly string[]).includes(normalized) ? (normalized as MarketImpactDirection) : null
}

function normalizeImpactArea(value: string | null): MarketImpactArea | null {
  const normalized = normalizeText(value)?.toLowerCase()
  if (!normalized) {
    return null
  }
  return (ALLOWED_IMPACT_AREAS as readonly string[]).includes(normalized) ? (normalized as MarketImpactArea) : null
}

function normalizeTimeHorizon(value: string | null): MarketTimeHorizon | null {
  const normalized = normalizeText(value)?.toLowerCase()
  if (!normalized) {
    return null
  }
  return (ALLOWED_TIME_HORIZONS as readonly string[]).includes(normalized) ? (normalized as MarketTimeHorizon) : null
}

function normalizeQualityFlag(value: string | null | undefined): MarketEventQualityFlag | null {
  const normalized = normalizeText(value ?? null)?.toLowerCase()
  if (!normalized) {
    return null
  }
  return (ALLOWED_DATA_QUALITY_FLAGS as readonly string[]).includes(normalized)
    ? (normalized as MarketEventQualityFlag)
    : null
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

function scoreConfidence(input: {
  providedConfidenceScore: number | null
  sourceReliabilityScore: number
  direction: MarketImpactDirection | null
  countryIso: string | null
  eventType: MarketEventType | null
  stale: boolean
  needsReview: boolean
}) {
  if (typeof input.providedConfidenceScore === 'number' && Number.isFinite(input.providedConfidenceScore)) {
    return roundNumber(clamp(input.providedConfidenceScore, 0, 1), 3)
  }

  let score = input.sourceReliabilityScore
  if (input.direction === 'unclear') {
    score -= 0.10
  }
  if (!input.countryIso) {
    score -= 0.05
  }
  if (input.eventType === 'other') {
    score -= 0.05
  }
  if (input.stale) {
    score -= 0.10
  }
  if (input.needsReview) {
    score -= 0.10
  }
  return roundNumber(clamp(score, 0.30, 0.95), 3)
}

function isStaleEvent(eventDate: string | null, staleDays: number, now = new Date()) {
  if (!eventDate) {
    return false
  }
  const eventTime = new Date(`${eventDate}T00:00:00.000Z`).getTime()
  if (Number.isNaN(eventTime)) {
    return false
  }
  const diffDays = Math.floor((now.getTime() - eventTime) / (24 * 60 * 60 * 1000))
  return diffDays > staleDays
}

function baseEntities(input: {
  countryOrRegion: string | null
  eventSummary: string | null
  eventTitle: string | null
  sourceName: string | null
  existingEntities: Record<string, unknown> | null
}) {
  const organizations: string[] = []
  const text = `${input.eventTitle ?? ''} ${input.eventSummary ?? ''} ${input.sourceName ?? ''}`.toLowerCase()
  if (text.includes('usda')) organizations.push('USDA')
  if (text.includes('ico')) organizations.push('ICO')
  if (text.includes('fao')) organizations.push('FAO')
  if (text.includes('world bank')) organizations.push('World Bank')

  const merged = {
    countries: input.countryOrRegion ? [input.countryOrRegion] : [],
    regions: [],
    commodities: ['coffee'],
    organizations,
    markets: [],
    ...(input.existingEntities ?? {}),
  }
  return merged as Record<string, unknown>
}

function normalizeSeedRecord(record: Record<string, string>): MarketEventInputRow {
  return {
    eventDate: normalizeText(record.event_date),
    publishedAt: normalizeText(record.published_at),
    commodityGroup: normalizeText(record.commodity_group),
    countryOrRegion: normalizeText(record.country_or_region),
    countryIso: normalizeText(record.country_iso),
    eventType: normalizeText(record.event_type),
    eventTitle: normalizeText(record.event_title),
    eventSummary: normalizeText(record.event_summary),
    expectedImpactDirection: normalizeText(record.expected_impact_direction),
    expectedImpactArea: normalizeText(record.expected_impact_area),
    impactScore: toNumber(record.impact_score),
    timeHorizon: normalizeText(record.time_horizon),
    confidenceScore: toNumber(record.confidence_score),
    sourceName: normalizeText(record.source_name),
    sourceUrl: normalizeText(record.source_url),
    sourceReliabilityScore: toNumber(record.source_reliability_score),
    entities: parseEntities(record.entities),
    notes: normalizeText(record.notes),
    rawPayload: { source: 'seed_csv', record },
    fromRawFeed: false,
  }
}

function normalizeRawRecord(record: Record<string, string>): MarketEventInputRow {
  let detectedCountries: string[] = []
  const detected = normalizeText(record.detected_countries)
  if (detected) {
    try {
      detectedCountries = asStringArray(JSON.parse(detected))
    } catch {
      detectedCountries = []
    }
  }
  const countryOrRegion = normalizeText(record.country_or_region) ?? detectedCountries[0] ?? null

  return {
    eventDate: normalizeText(record.event_date),
    publishedAt: normalizeText(record.published_at),
    commodityGroup: normalizeText(record.detected_commodity) ?? normalizeText(record.commodity_group),
    countryOrRegion,
    countryIso: normalizeText(record.country_iso),
    eventType: normalizeText(record.detected_event_type) ?? normalizeText(record.event_type),
    eventTitle: normalizeText(record.title_raw) ?? normalizeText(record.event_title),
    eventSummary: normalizeText(record.summary_raw) ?? normalizeText(record.event_summary) ?? normalizeText(record.body_excerpt),
    expectedImpactDirection: normalizeText(record.expected_impact_direction) ?? 'unclear',
    expectedImpactArea: normalizeText(record.expected_impact_area) ?? 'other',
    impactScore: toNumber(record.impact_score) ?? 0,
    timeHorizon: normalizeText(record.time_horizon) ?? 'unclear',
    confidenceScore: toNumber(record.confidence_score),
    sourceName: normalizeText(record.source_name),
    sourceUrl: normalizeText(record.source_url),
    sourceReliabilityScore: toNumber(record.source_reliability_score),
    entities: parseEntities(record.entities),
    notes: normalizeText(record.notes),
    rawPayload: { source: 'raw_csv', record, detectedCountries },
    fromRawFeed: true,
  }
}

function containsCoffeeSignal(text: string) {
  return /\b(coffee|robusta|arabica|green bean|cafe|café)\b/i.test(text)
}

function detectCountry(text: string, fallback: Pick<MarketEventSourceDescriptor, 'countryOrRegion' | 'countryIso'>) {
  const candidates: Array<{ pattern: RegExp; region: string; iso: string }> = [
    { pattern: /\bviet\s?nam|vietnam|dak lak|gia lai|lam dong|central highlands/i, region: 'Vietnam', iso: 'VNM' },
    { pattern: /\bbrazil|sao paulo|minas gerais/i, region: 'Brazil', iso: 'BRA' },
    { pattern: /\bindonesia|sumatra|java\b/i, region: 'Indonesia', iso: 'IDN' },
    { pattern: /\beuropean union|\beu\b|eurostat|eudr/i, region: 'EU', iso: 'EUU' },
    { pattern: /\bunited states|\bus\b|usa\b/i, region: 'United States', iso: 'USA' },
    { pattern: /\bgermany|deutschland/i, region: 'Germany', iso: 'DEU' },
    { pattern: /\bitaly|italia/i, region: 'Italy', iso: 'ITA' },
    { pattern: /\bjapan\b/i, region: 'Japan', iso: 'JPN' },
    { pattern: /\bsouth korea|korea\b/i, region: 'South Korea', iso: 'KOR' },
    { pattern: /\bcolombia\b/i, region: 'Colombia', iso: 'COL' },
    { pattern: /\bethiopia\b/i, region: 'Ethiopia', iso: 'ETH' },
    { pattern: /\buganda\b/i, region: 'Uganda', iso: 'UGA' },
  ]
  const found = candidates.find(candidate => candidate.pattern.test(text))
  return {
    countryOrRegion: found?.region ?? fallback.countryOrRegion,
    countryIso: found?.iso ?? fallback.countryIso,
  }
}

function classifyEventType(text: string): MarketEventType {
  if (/\b(drought|rain|frost|weather|heat|flood|dryness|el nino|la nina)\b/i.test(text)) return 'weather'
  if (/\b(harvest|harvesting)\b/i.test(text)) return 'harvest'
  if (/\b(crop|production|yield|flowering|outlook|forecast)\b/i.test(text)) return 'crop_outlook'
  if (/\b(export ban|export tax|export policy|shipment restriction)\b/i.test(text)) return 'export_policy'
  if (/\b(import|tariff|customs|border)\b/i.test(text)) return 'import_policy'
  if (/\b(regulation|eudr|law|compliance|due diligence|standard|certificate)\b/i.test(text)) return 'regulation'
  if (/\b(port|freight|shipping|container|logistics|truck)\b/i.test(text)) return 'logistics'
  if (/\b(stock|stocks|inventory|warehouse)\b/i.test(text)) return 'inventory'
  if (/\b(futures|ice|contract|settlement)\b/i.test(text)) return 'futures_market'
  if (/\b(currency|exchange rate|fx|dong|real|yen|euro|dollar)\b/i.test(text)) return 'currency_fx'
  if (/\b(demand|consumption|roaster|retail)\b/i.test(text)) return 'demand_signal'
  if (/\b(supply|availability|shortage)\b/i.test(text)) return 'supply_signal'
  if (/\b(trade|exports|imports|shipment|flow)\b/i.test(text)) return 'trade_flow'
  if (/\b(inflation|interest rate|macro|gdp)\b/i.test(text)) return 'macro'
  return 'other'
}

function classifyImpact(text: string, eventType: MarketEventType): {
  direction: MarketImpactDirection
  area: MarketImpactArea
  score: number
  horizon: MarketTimeHorizon
} {
  if (/\b(drought|frost|shortage|disruption|delay|congestion|lower production|crop loss)\b/i.test(text)) {
    return { direction: 'bullish', area: eventType === 'logistics' ? 'logistics' : 'supply', score: 1, horizon: 'short_term' }
  }
  if (/\b(record crop|higher production|bumper|improves export|eases|surplus|higher stocks)\b/i.test(text)) {
    return { direction: 'bearish', area: eventType === 'inventory' ? 'inventory' : 'supply', score: -1, horizon: 'short_term' }
  }
  if (eventType === 'demand_signal') {
    return { direction: 'bullish', area: 'demand', score: 1, horizon: 'short_term' }
  }
  if (eventType === 'regulation' || eventType === 'import_policy' || eventType === 'export_policy') {
    return { direction: 'neutral', area: 'policy', score: 0, horizon: 'medium_term' }
  }
  if (eventType === 'currency_fx') {
    return { direction: 'unclear', area: 'fx', score: 0, horizon: 'short_term' }
  }
  return { direction: 'unclear', area: 'other', score: 0, horizon: 'unclear' }
}

function pickRssLink(item: Record<string, unknown>) {
  const linkNode = item.link
  if (typeof linkNode === 'string') {
    return normalizeText(linkNode)
  }
  if (linkNode && typeof linkNode === 'object' && 'href' in linkNode && typeof linkNode.href === 'string') {
    return normalizeText(linkNode.href)
  }
  if (typeof item.guid === 'string' && /^https?:\/\//i.test(item.guid)) {
    return normalizeText(item.guid)
  }
  return null
}

function pickRssDate(item: Record<string, unknown>, fallback: string) {
  const rawDate =
    typeof item.pubDate === 'string'
      ? item.pubDate
      : typeof item.published === 'string'
        ? item.published
        : typeof item.updated === 'string'
          ? item.updated
          : typeof item.date === 'string'
            ? item.date
            : null
  return toIsoTimestamp(rawDate) ?? fallback
}

function countFeedItems(xml: string) {
  const parsed = feedParser.parse(xml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } }
    feed?: { entry?: Array<Record<string, unknown>> | Record<string, unknown> }
  }
  return [
    ...toArray(parsed.rss?.channel?.item),
    ...toArray(parsed.feed?.entry),
  ].length
}

export function parseCoffeeMarketEventRssItems(
  xml: string,
  source: MarketEventSourceDescriptor,
  options: { fetchedAt: string; maxItems?: number },
): MarketEventInputRow[] {
  const parsed = feedParser.parse(xml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } }
    feed?: { entry?: Array<Record<string, unknown>> | Record<string, unknown> }
  }
  const rawItems = [
    ...toArray(parsed.rss?.channel?.item),
    ...toArray(parsed.feed?.entry),
  ].slice(0, options.maxItems ?? 50)

  return rawItems.flatMap(item => {
    const title = stripHtml(typeof item.title === 'string' ? item.title : null)
    const summary = stripHtml(
      typeof item.description === 'string'
        ? item.description
        : typeof item.summary === 'string'
          ? item.summary
          : typeof item.content === 'string'
            ? item.content
            : null,
    )
    const text = `${title ?? ''} ${summary ?? ''}`
    if (!title || !containsCoffeeSignal(text)) {
      return []
    }

    const publishedAt = pickRssDate(item, options.fetchedAt)
    const eventType = classifyEventType(text)
    const impact = classifyImpact(text, eventType)
    const country = detectCountry(text, source)
    const sourceUrl = pickRssLink(item) ?? source.sourceUrl

    return [{
      eventDate: publishedAt.slice(0, 10),
      publishedAt,
      commodityGroup: COMMODITY_GROUP,
      countryOrRegion: country.countryOrRegion,
      countryIso: country.countryIso,
      eventType,
      eventTitle: title,
      eventSummary: truncateText(summary),
      expectedImpactDirection: impact.direction,
      expectedImpactArea: impact.area,
      impactScore: impact.score,
      timeHorizon: impact.horizon,
      confidenceScore: null,
      sourceName: source.sourceName,
      sourceUrl,
      sourceReliabilityScore: source.reliabilityScore,
      entities: {
        countries: country.countryOrRegion ? [country.countryOrRegion] : [],
        commodities: ['coffee'],
        organizations: [source.sourceName],
      },
      notes: `Adapter source=${source.id}; source rows require human review before brief use.`,
      rawPayload: { source: source.id, item },
      fromRawFeed: true,
    }]
  })
}

export function classifyCoffeeMarketEventSourceHealth(input: {
  source: MarketEventSourceDescriptor
  probedAt: string
  httpStatus: number | null
  contentType: string | null
  bodyText: string | null
  errorMessage?: string | null
  maxItems?: number
}): MarketEventSourceHealthRow {
  const base = {
    sourceId: input.source.id,
    sourceName: input.source.sourceName,
    sourceUrl: input.source.sourceUrl,
    sourceType: input.source.sourceType,
    sourceMode: input.source.sourceMode,
    enabledByDefault: input.source.enabledByDefault,
    requiresManualReview: input.source.requiresManualReview,
    reliabilityScore: input.source.reliabilityScore,
    probedAt: input.probedAt,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    itemCount: 0,
    coffeeHitCount: 0,
    notes: input.source.notes,
    errorMessage: input.errorMessage ?? null,
  }

  if (input.errorMessage) {
    const lower = input.errorMessage.toLowerCase()
    if (lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
      return { ...base, status: 'auth_gated' }
    }
    return { ...base, status: 'fetch_error' }
  }

  if (input.source.sourceType === 'api_research') {
    return { ...base, status: 'auth_gated', errorMessage: 'Research-only/API-gated source; provide approved endpoint or key before ingestion.' }
  }

  const bodyText = input.bodyText ?? ''
  if (/ipad retired|no longer available to the public|site no longer available/i.test(bodyText)) {
    return { ...base, status: 'retired' }
  }

  if (input.source.sourceType === 'official_html_probe') {
    return { ...base, status: 'unsupported_html', errorMessage: 'Official source is reachable as HTML, but no stable RSS/XML/JSON ingestion endpoint is configured.' }
  }

  if (input.source.sourceType === 'rss') {
    try {
      const itemCount = countFeedItems(bodyText)
      const coffeeHitCount = parseCoffeeMarketEventRssItems(bodyText, input.source, {
        fetchedAt: input.probedAt,
        maxItems: input.maxItems,
      }).length
      return {
        ...base,
        status: itemCount > 0 ? 'available' : 'empty',
        itemCount,
        coffeeHitCount,
        notes: `${input.source.notes} Source health item_count=${itemCount}; coffee_hit_count=${coffeeHitCount}.`,
      }
    } catch (error) {
      return {
        ...base,
        status: 'fetch_error',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { ...base, status: 'unsupported_html' }
}

async function fetchSourceText(url: string) {
  return retryTransient(async () => {
    const response = await fetch(url, {
      headers: {
        'accept': 'application/rss+xml, application/xml, text/xml, */*',
        'user-agent': 'NongSanVN coffee market event adapter/1.0',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }
    return response.text()
  }, { attempts: 3, initialDelayMs: 500 })
}

async function fetchSourceProbeResponse(url: string) {
  return retryTransient(async () => {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml, application/xml, application/json, text/html, text/xml, */*',
        'user-agent': 'NongSanVN coffee market event source probe/1.0',
      },
    })
    const text = await response.text()
    return {
      httpStatus: response.status,
      contentType: response.headers.get('content-type'),
      bodyText: text,
      ok: response.ok,
    }
  }, { attempts: 2, initialDelayMs: 500 })
}

export async function probeCoffeeMarketEventSources(options: {
  fetchedAt: string
  sourceIds?: string[]
  maxItemsPerSource?: number
}): Promise<MarketEventSourceHealthRow[]> {
  const requestedIds = new Set(options.sourceIds ?? [])
  const sources = COFFEE_MARKET_EVENT_SOURCES.filter(source => requestedIds.size > 0 ? requestedIds.has(source.id) : true)
  const rows: MarketEventSourceHealthRow[] = []

  for (const source of sources) {
    if (source.sourceType === 'api_research') {
      rows.push(classifyCoffeeMarketEventSourceHealth({
        source,
        probedAt: options.fetchedAt,
        httpStatus: null,
        contentType: null,
        bodyText: null,
      }))
      continue
    }

    try {
      const response = await fetchSourceProbeResponse(source.sourceUrl)
      rows.push(classifyCoffeeMarketEventSourceHealth({
        source,
        probedAt: options.fetchedAt,
        httpStatus: response.httpStatus,
        contentType: response.contentType,
        bodyText: response.bodyText,
        errorMessage: response.ok ? null : `HTTP ${response.httpStatus}`,
        maxItems: options.maxItemsPerSource,
      }))
    } catch (error) {
      rows.push(classifyCoffeeMarketEventSourceHealth({
        source,
        probedAt: options.fetchedAt,
        httpStatus: null,
        contentType: null,
        bodyText: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  return rows
}

export async function fetchCoffeeMarketEventSourceRows(options: {
  fetchedAt: string
  sourceIds?: string[]
  maxItemsPerSource?: number
}): Promise<CoffeeMarketEventSourceFetchResult> {
  const requestedIds = new Set(options.sourceIds ?? [])
  const sources = COFFEE_MARKET_EVENT_SOURCES.filter(source => {
    if (requestedIds.size > 0) {
      return requestedIds.has(source.id)
    }
    return source.enabledByDefault
  })
  const rows: MarketEventInputRow[] = []
  const errors: CoffeeMarketEventSourceError[] = []

  for (const source of sources) {
    if (source.sourceType !== 'rss') {
      errors.push({
        sourceId: source.id,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        message: `Source type ${source.sourceType} is ${source.sourceMode}; ingestion requires a stable RSS/XML/JSON endpoint`,
      })
      continue
    }

    try {
      const xml = await fetchSourceText(source.sourceUrl)
      rows.push(...parseCoffeeMarketEventRssItems(xml, source, {
        fetchedAt: options.fetchedAt,
        maxItems: options.maxItemsPerSource,
      }))
    } catch (error) {
      errors.push({
        sourceId: source.id,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { rows, errors }
}

async function loadInputRowsFromCsv(seedCsvPath: string, rawCsvPath: string) {
  const seedRows = parseCsv(await readFile(seedCsvPath, 'utf-8')).map(normalizeSeedRecord)
  let rawRows: MarketEventInputRow[] = []
  try {
    rawRows = parseCsv(await readFile(rawCsvPath, 'utf-8')).map(normalizeRawRecord)
  } catch {
    rawRows = []
  }
  return [...seedRows, ...rawRows]
}

function resolveQualityFlag(input: {
  eventDate: string | null
  sourceUrl: string | null
  eventTitle: string | null
  commodityGroup: string
  eventType: MarketEventType | null
  impactDirection: MarketImpactDirection | null
  impactScore: number | null
  sourceReliabilityScore: number
  stale: boolean
  needsReview: boolean
}) {
  if (!input.sourceUrl) {
    return 'missing_source_url' satisfies MarketEventQualityFlag
  }
  if (!input.eventTitle) {
    return 'missing_event_title' satisfies MarketEventQualityFlag
  }
  if (input.commodityGroup !== COMMODITY_GROUP) {
    return 'not_coffee_specific' satisfies MarketEventQualityFlag
  }
  if (!input.eventType) {
    return 'invalid_event_type' satisfies MarketEventQualityFlag
  }
  if (!input.impactDirection) {
    return 'invalid_impact_direction' satisfies MarketEventQualityFlag
  }
  if (typeof input.impactScore !== 'number' || !Number.isFinite(input.impactScore) || input.impactScore < -3 || input.impactScore > 3) {
    return 'invalid_impact_score' satisfies MarketEventQualityFlag
  }
  if (!input.eventDate) {
    return 'missing_event_date' satisfies MarketEventQualityFlag
  }
  if (input.sourceReliabilityScore < BRIEF_MIN_RELIABILITY) {
    return 'low_reliability_source' satisfies MarketEventQualityFlag
  }
  if (input.stale) {
    return 'stale_event' satisfies MarketEventQualityFlag
  }
  if (input.impactDirection === 'unclear') {
    return 'unclear_impact' satisfies MarketEventQualityFlag
  }
  if (input.needsReview) {
    return 'needs_human_review' satisfies MarketEventQualityFlag
  }
  return 'ok' satisfies MarketEventQualityFlag
}

function canonicalTitle(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function areTitlesSimilar(left: string, right: string) {
  const a = canonicalTitle(left)
  const b = canonicalTitle(right)
  if (a === b) {
    return true
  }
  if (a.length > 20 && b.length > 20 && (a.includes(b) || b.includes(a))) {
    return true
  }
  const wordsA = new Set(a.split(' ').filter(Boolean))
  const wordsB = new Set(b.split(' ').filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) {
    return false
  }
  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection += 1
    }
  }
  const overlap = intersection / Math.min(wordsA.size, wordsB.size)
  return overlap >= 0.7
}

function daysBetween(left: string, right: string) {
  const leftDate = new Date(`${left}T00:00:00.000Z`).getTime()
  const rightDate = new Date(`${right}T00:00:00.000Z`).getTime()
  if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
    return Number.POSITIVE_INFINITY
  }
  return Math.abs(leftDate - rightDate) / (24 * 60 * 60 * 1000)
}

function applyDuplicateFlags(rows: MarketEventFactRow[]) {
  const grouped = new Map<string, number[]>()
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const key = `${row.commodity_group}|${row.country_or_region ?? 'unknown'}|${row.event_type}`
    const bucket = grouped.get(key) ?? []
    bucket.push(index)
    grouped.set(key, bucket)
  }

  for (const indices of grouped.values()) {
    for (const currentIndex of indices) {
      const current = rows[currentIndex]
      for (const previousIndex of indices) {
        if (previousIndex >= currentIndex) {
          break
        }
        const previous = rows[previousIndex]
        if (daysBetween(current.event_date, previous.event_date) > 3) {
          continue
        }
        if (!areTitlesSimilar(current.event_title, previous.event_title)) {
          continue
        }

        const clusterId = previous.event_cluster_id ?? `${previous.event_date}|${canonicalTitle(previous.event_title).slice(0, 32)}`
        previous.event_cluster_id = clusterId
        current.event_cluster_id = clusterId
        current.duplicate_of = previous.source_url
        if (current.data_quality_flag === 'ok') {
          current.data_quality_flag = 'possible_duplicate'
        }
        if (!current.notes.toLowerCase().includes('possible duplicate')) {
          current.notes = `${current.notes} Possible duplicate event cluster; verify before brief use.`.trim()
        }
        break
      }
    }
  }
}

function toRawRow(input: MarketEventInputRow, fetchedAt: string): RawMarketEventItemRow {
  return {
    fetched_at: fetchedAt,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    published_at: toIsoTimestamp(input.publishedAt),
    title_raw: input.eventTitle,
    summary_raw: input.eventSummary,
    body_excerpt: input.eventSummary,
    language: 'en',
    detected_commodity: input.commodityGroup ?? COMMODITY_GROUP,
    detected_countries: input.countryOrRegion ? [input.countryOrRegion] : [],
    detected_event_type: input.eventType,
    raw_payload: input.rawPayload ?? {},
    processing_status: input.fromRawFeed ? 'pending' : 'parsed',
    notes: input.notes,
  }
}

function normalizeInputToFactRow(input: MarketEventInputRow, fetchedAt: string, staleDays: number): MarketEventFactRow | null {
  const publishedAt = toIsoTimestamp(input.publishedAt)
  const explicitEventDate = toIsoDate(input.eventDate)
  const approximatedEventDate = explicitEventDate ?? (publishedAt ? publishedAt.slice(0, 10) : null)
  const usedApproxDate = explicitEventDate === null && approximatedEventDate !== null
  const sourceReliabilityScore = roundNumber(
    clamp(
      input.sourceReliabilityScore ?? deriveSourceReliabilityScore(input.sourceName, input.sourceUrl),
      0,
      1,
    ),
    3,
  )
  const eventType = normalizeEventType(input.eventType)
  const impactDirection = normalizeImpactDirection(input.expectedImpactDirection)
  const impactArea = normalizeImpactArea(input.expectedImpactArea) ?? 'other'
  const timeHorizon = normalizeTimeHorizon(input.timeHorizon) ?? 'unclear'
  const impactScore = input.impactScore === null ? null : roundNumber(input.impactScore, 2)
  const commodityGroup = normalizeText(input.commodityGroup)?.toLowerCase() ?? COMMODITY_GROUP
  const countryOrRegion = normalizeText(input.countryOrRegion)
  const countryIso = normalizeCountryIso(input.countryIso)
  const eventTitle = normalizeText(input.eventTitle)
  const eventSummary = normalizeText(input.eventSummary)
  const stale = isStaleEvent(approximatedEventDate, staleDays)
  const needsReview = Boolean(usedApproxDate || input.fromRawFeed)

  const qualityFlag = resolveQualityFlag({
    eventDate: approximatedEventDate,
    sourceUrl: normalizeText(input.sourceUrl),
    eventTitle,
    commodityGroup,
    eventType,
    impactDirection,
    impactScore,
    sourceReliabilityScore,
    stale,
    needsReview,
  })

  const confidenceScore = scoreConfidence({
    providedConfidenceScore: input.confidenceScore,
    sourceReliabilityScore,
    direction: impactDirection,
    countryIso,
    eventType,
    stale,
    needsReview: qualityFlag === 'needs_human_review',
  })

  if (!approximatedEventDate || !eventTitle || !normalizeText(input.sourceName) || !normalizeText(input.sourceUrl) || !eventType || !impactDirection || impactScore === null) {
    if (!approximatedEventDate || !eventTitle || !normalizeText(input.sourceName) || !normalizeText(input.sourceUrl)) {
      return {
        event_date: approximatedEventDate ?? fetchedAt.slice(0, 10),
        published_at: publishedAt,
        commodity_group: commodityGroup,
        country_or_region: countryOrRegion,
        country_iso: countryIso,
        event_type: eventType ?? 'other',
        event_title: eventTitle ?? 'Missing event title',
        event_summary: eventSummary,
        expected_impact_direction: impactDirection ?? 'unclear',
        expected_impact_area: impactArea,
        impact_score: impactScore ?? 0,
        time_horizon: timeHorizon,
        confidence_score: confidenceScore,
        source_name: normalizeText(input.sourceName) ?? 'Unknown source',
        source_url: normalizeText(input.sourceUrl) ?? `missing-source-url://${fetchedAt}`,
        source_reliability_score: sourceReliabilityScore,
        fetched_at: fetchedAt,
        event_cluster_id: null,
        duplicate_of: null,
        data_quality_flag: qualityFlag,
        entities: baseEntities({
          countryOrRegion,
          eventSummary,
          eventTitle,
          sourceName: input.sourceName,
          existingEntities: input.entities,
        }),
        raw_payload: input.rawPayload ?? {},
        notes: `${input.notes ?? ''}${usedApproxDate ? ' event_date approximated from published_at.' : ''}`.trim(),
      }
    }
  }

  return {
    event_date: approximatedEventDate ?? fetchedAt.slice(0, 10),
    published_at: publishedAt,
    commodity_group: commodityGroup,
    country_or_region: countryOrRegion,
    country_iso: countryIso,
    event_type: eventType ?? 'other',
    event_title: eventTitle ?? 'Untitled event',
    event_summary: eventSummary,
    expected_impact_direction: impactDirection ?? 'unclear',
    expected_impact_area: impactArea,
    impact_score: impactScore ?? 0,
    time_horizon: timeHorizon,
    confidence_score: confidenceScore,
    source_name: normalizeText(input.sourceName) ?? 'Unknown source',
    source_url: normalizeText(input.sourceUrl) ?? `missing-source-url://${fetchedAt}`,
    source_reliability_score: sourceReliabilityScore,
    fetched_at: fetchedAt,
    event_cluster_id: null,
    duplicate_of: null,
    data_quality_flag: qualityFlag,
    entities: baseEntities({
      countryOrRegion,
      eventSummary,
      eventTitle,
      sourceName: input.sourceName,
      existingEntities: input.entities,
    }),
    raw_payload: input.rawPayload ?? {},
    notes: `${input.notes ?? ''}${usedApproxDate ? ' event_date approximated from published_at.' : ''}`.trim(),
  }
}

function buildRawKey(row: RawMarketEventItemRow) {
  return `${row.source_url ?? ''}|${row.published_at ?? ''}|${row.title_raw ?? ''}`
}

function buildFactKey(row: MarketEventFactRow) {
  return `${row.event_date}|${row.commodity_group}|${row.country_or_region ?? ''}|${row.event_type}|${row.source_url}`
}

function buildMarketEventQcReport(rows: MarketEventFactRow[]): MarketEventQcReport {
  const countByEventType: Record<string, number> = {}
  const countByCountry: Record<string, number> = {}
  const countByImpactDirection: Record<string, number> = {}
  const countByQualityFlag: Record<MarketEventQualityFlag, number> = {
    ok: 0,
    missing_event_date: 0,
    missing_source_url: 0,
    missing_event_title: 0,
    low_reliability_source: 0,
    possible_duplicate: 0,
    unclear_impact: 0,
    not_coffee_specific: 0,
    stale_event: 0,
    needs_human_review: 0,
    invalid_event_type: 0,
    invalid_impact_direction: 0,
    invalid_impact_score: 0,
  }

  for (const row of rows) {
    countByEventType[row.event_type] = (countByEventType[row.event_type] ?? 0) + 1
    const countryKey = row.country_or_region ?? 'unknown'
    countByCountry[countryKey] = (countByCountry[countryKey] ?? 0) + 1
    countByImpactDirection[row.expected_impact_direction] = (countByImpactDirection[row.expected_impact_direction] ?? 0) + 1
    countByQualityFlag[row.data_quality_flag] += 1
  }

  const lowReliabilityEvents = rows.filter(row => row.source_reliability_score < BRIEF_MIN_RELIABILITY)
  const unclearImpactEvents = rows.filter(row => row.expected_impact_direction === 'unclear')
  const possibleDuplicateEvents = rows.filter(row => row.data_quality_flag === 'possible_duplicate')
  const usableForBriefEvents = rows.filter(row => {
    if (row.data_quality_flag !== 'ok') {
      return false
    }
    if (row.confidence_score < BRIEF_MIN_CONFIDENCE || row.source_reliability_score < BRIEF_MIN_RELIABILITY) {
      return false
    }
    return daysBetween(row.event_date, new Date().toISOString().slice(0, 10)) <= BRIEF_LOOKBACK_DAYS
  })
  const needsHumanReviewEvents = rows.filter(row => row.data_quality_flag === 'needs_human_review')

  const eventDates = rows.map(row => row.event_date).sort()
  return {
    totalEvents: rows.length,
    eventDateRange: {
      min: eventDates[0] ?? null,
      max: eventDates.at(-1) ?? null,
    },
    countByEventType,
    countByCountry,
    countByImpactDirection,
    countByQualityFlag,
    lowReliabilityEvents,
    unclearImpactEvents,
    possibleDuplicateEvents,
    usableForBriefEvents,
    needsHumanReviewEvents,
  }
}

export function renderCoffeeMarketEventsQcMarkdown(report: MarketEventQcReport, options: {
  generatedAt: string
  sourceRowsFetched?: number
  sourceErrors?: CoffeeMarketEventSourceError[]
  sourceHealth?: MarketEventSourceHealthRow[]
}) {
  const lines: string[] = [
    '# Coffee Market Event QC Report',
    '',
    `- Generated at: ${options.generatedAt}`,
    `- Total events: ${report.totalEvents}`,
    `- Event date range: ${report.eventDateRange.min ?? 'n/a'} -> ${report.eventDateRange.max ?? 'n/a'}`,
    `- Adapter rows fetched: ${options.sourceRowsFetched ?? 0}`,
    '',
    '## Count By Event Type',
    '',
  ]

  for (const [eventType, count] of Object.entries(report.countByEventType).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${eventType}: ${count}`)
  }

  lines.push('', '## Count By Country Or Region', '')
  for (const [country, count] of Object.entries(report.countByCountry).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${country}: ${count}`)
  }

  lines.push('', '## Count By Impact Direction', '')
  for (const [direction, count] of Object.entries(report.countByImpactDirection).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${direction}: ${count}`)
  }

  lines.push('', '## Count By Data Quality Flag', '')
  for (const [flag, count] of Object.entries(report.countByQualityFlag)) {
    lines.push(`- ${flag}: ${count}`)
  }

  lines.push('', '## Events With Low Reliability', '')
  if (report.lowReliabilityEvents.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.lowReliabilityEvents.slice(0, 20)) {
      lines.push(`- ${row.event_date} | ${row.event_title} | reliability=${row.source_reliability_score} | ${row.source_url}`)
    }
  }

  lines.push('', '## Events With Unclear Impact', '')
  if (report.unclearImpactEvents.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.unclearImpactEvents.slice(0, 20)) {
      lines.push(`- ${row.event_date} | ${row.country_or_region ?? 'n/a'} | ${row.event_title}`)
    }
  }

  lines.push('', '## Possible Duplicate Events', '')
  if (report.possibleDuplicateEvents.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.possibleDuplicateEvents.slice(0, 20)) {
      lines.push(`- ${row.event_date} | cluster=${row.event_cluster_id ?? 'n/a'} | ${row.event_title}`)
    }
  }

  lines.push('', '## Events Usable For Coffee Brief', '')
  if (report.usableForBriefEvents.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.usableForBriefEvents.slice(0, 30)) {
      lines.push(`- ${row.event_date} | ${row.event_type} | ${row.event_title} | impact=${row.impact_score} | conf=${row.confidence_score}`)
    }
  }

  lines.push('', '## Events Needing Human Review', '')
  if (report.needsHumanReviewEvents.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.needsHumanReviewEvents.slice(0, 20)) {
      lines.push(`- ${row.event_date} | ${row.event_title} | flag=${row.data_quality_flag} | ${row.notes}`)
    }
  }

  lines.push('', '## Source Health Summary', '')
  if (!options.sourceHealth || options.sourceHealth.length === 0) {
    lines.push('- not probed in this run')
  } else {
    for (const row of options.sourceHealth) {
      lines.push(`- ${row.sourceId} | status=${row.status} | mode=${row.sourceMode} | items=${row.itemCount} | coffee_hits=${row.coffeeHitCount}`)
    }
  }

  lines.push('', '## Source Errors', '')
  if (!options.sourceErrors || options.sourceErrors.length === 0) {
    lines.push('- none')
  } else {
    for (const error of options.sourceErrors) {
      lines.push(`- ${error.sourceId} | ${error.message}`)
    }
  }

  lines.push('', '## Official Source Limitations', '')
  lines.push(
    '- USDA FAS GAIN, ICO, and Vietnam official portals remain probe-only until approved RSS/XML/JSON/API endpoints are configured.',
    '- HTML-only official pages are documented as source health evidence, not ingested as structured market events.',
    '- Adapter rows remain reviewable and are not promoted automatically into Coffee Brief candidates.',
  )

  lines.push(
    '',
    '## Methodology Warnings',
    '',
    '- Market events are contextual signals, not deterministic forecasts.',
    '- Impact direction and score are analytical labels and should be reviewed for high-impact claims.',
    '- Event summaries are short paraphrases and must keep source attribution via source_name and source_url.',
    '',
  )

  return lines.join('\n')
}

export function renderCoffeeMarketEventsMethodology() {
  return [
    '# Coffee Market Events Methodology',
    '',
    '## Scope',
    '',
    '- Commodity scope: coffee only (Week 1).',
    '- Structured fields: event type, impact direction, impact area, impact score, confidence score.',
    '- Country focus starts with Vietnam, Brazil, Indonesia, EU, United States, Germany, Italy, Japan, and South Korea.',
    '',
    '## Data Quality',
    '',
    '- Controlled vocabularies enforce event type and impact labels.',
    '- Reliability and confidence thresholds are applied before candidate selection for the Coffee Brief.',
    '- Duplicate events are flagged for review; duplicates are not hard-deleted automatically.',
    '',
    '## Interpretation',
    '',
    '- Events are contextual signals, not deterministic forecasts.',
    '- High-impact claims should prefer reliable sources and confidence >= 0.75.',
    '- Low-reliability or unclear-impact events require human review before customer-facing use.',
    '- Public source adapters ingest only RSS/API-like endpoints. HTML scraping of official portals is deferred until source terms and stability are clear.',
    '- Adapter rows are stored as raw-feed inputs and require human review before use in the Coffee Brief.',
    '',
  ].join('\n')
}

export function renderCoffeeMarketEventSourceResearchMarkdown(options: {
  generatedAt: string
  fetchedRows: number
  errors: CoffeeMarketEventSourceError[]
  sourceHealth?: MarketEventSourceHealthRow[]
}) {
  const lines = [
    '# Coffee Market Event Source Research',
    '',
    `- Generated at: ${options.generatedAt}`,
    `- Adapter rows fetched: ${options.fetchedRows}`,
    '- Source strategy: public RSS/API endpoints only; no generic HTML scraping.',
    '',
    '## Configured Sources',
    '',
  ]

  for (const source of COFFEE_MARKET_EVENT_SOURCES) {
    lines.push(
      `- ${source.id} | ${source.sourceName} | type=${source.sourceType} | mode=${source.sourceMode} | enabledByDefault=${source.enabledByDefault} | requiresManualReview=${source.requiresManualReview} | reliability=${source.reliabilityScore}`,
      `  Source: ${source.sourceUrl}`,
      `  Note: ${source.notes}`,
    )
  }

  lines.push('', '## Source Health', '')
  if (!options.sourceHealth || options.sourceHealth.length === 0) {
    lines.push('- not probed in this run')
  } else {
    for (const row of options.sourceHealth) {
      lines.push(`- ${row.sourceId} | status=${row.status} | mode=${row.sourceMode} | http=${row.httpStatus ?? 'n/a'} | items=${row.itemCount} | coffee_hits=${row.coffeeHitCount}`)
      if (row.errorMessage) {
        lines.push(`  Error: ${row.errorMessage}`)
      }
    }
  }

  lines.push('', '## Source Errors', '')
  if (options.errors.length === 0) {
    lines.push('- none')
  } else {
    for (const error of options.errors) {
      lines.push(`- ${error.sourceId} | ${error.message} | ${error.sourceUrl}`)
    }
  }

  lines.push(
    '',
    '## Guardrails',
    '',
    '- Source-derived rows remain reviewable raw-feed items.',
    '- Source registry states distinguish enabled ingestion from probe_only source research.',
    '- Missing or auth-gated official APIs are documented instead of bypassed with brittle scraping.',
    '- Coffee keyword filtering is deterministic and may miss indirectly relevant policy items.',
    '',
  )
  return lines.join('\n')
}

export function renderCoffeeMarketEventSourceHealthMarkdown(options: {
  generatedAt: string
  sourceHealth: MarketEventSourceHealthRow[]
}) {
  const lines = [
    '# Coffee Market Event Source Health',
    '',
    `- Generated at: ${options.generatedAt}`,
    `- Sources probed: ${options.sourceHealth.length}`,
    '',
    '## Probe Results',
    '',
  ]

  if (options.sourceHealth.length === 0) {
    lines.push('- none')
  } else {
    for (const row of options.sourceHealth) {
      lines.push(`- ${row.sourceId} | ${row.sourceName} | status=${row.status} | mode=${row.sourceMode} | enabled=${row.enabledByDefault} | review=${row.requiresManualReview}`)
      lines.push(`  URL: ${row.sourceUrl}`)
      lines.push(`  HTTP: ${row.httpStatus ?? 'n/a'} | content_type=${row.contentType ?? 'n/a'} | items=${row.itemCount} | coffee_hits=${row.coffeeHitCount}`)
      lines.push(`  Note: ${row.errorMessage ?? row.notes}`)
    }
  }

  lines.push(
    '',
    '## Interpretation',
    '',
    '- available means the endpoint is reachable and parseable; coffee_hits may still be zero for broad official feeds.',
    '- auth_gated and unsupported_html sources are not ingested until an approved stable endpoint is configured.',
    '- retired sources should stay disabled and be replaced with the official successor endpoint before ingestion.',
    '',
  )

  return lines.join('\n')
}

export function prepareCoffeeMarketEventsRows(
  inputs: MarketEventInputRow[],
  options: { fetchedAt: string; staleDays?: number },
): CoffeeMarketEventsPreparedRows {
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS
  const rawRowsByKey = new Map<string, RawMarketEventItemRow>()
  const factRowsByKey = new Map<string, MarketEventFactRow>()

  for (const input of inputs) {
    const rawRow = toRawRow(input, options.fetchedAt)
    const rawKey = buildRawKey(rawRow)
    const existingRaw = rawRowsByKey.get(rawKey)
    if (!existingRaw || (rawRow.fetched_at >= existingRaw.fetched_at)) {
      rawRowsByKey.set(rawKey, rawRow)
    }

    const factRow = normalizeInputToFactRow(input, options.fetchedAt, staleDays)
    if (!factRow) {
      continue
    }
    const factKey = buildFactKey(factRow)
    const existingFact = factRowsByKey.get(factKey)
    if (!existingFact || factRow.fetched_at >= existingFact.fetched_at) {
      factRowsByKey.set(factKey, factRow)
    }
  }

  const rawRows = [...rawRowsByKey.values()].sort((left, right) => {
    if ((left.published_at ?? '') !== (right.published_at ?? '')) {
      return (right.published_at ?? '').localeCompare(left.published_at ?? '')
    }
    return (left.source_url ?? '').localeCompare(right.source_url ?? '')
  })

  const factRows = [...factRowsByKey.values()].sort((left, right) => {
    if (left.event_date !== right.event_date) {
      return right.event_date.localeCompare(left.event_date)
    }
    return left.event_title.localeCompare(right.event_title)
  })
  applyDuplicateFlags(factRows)
  const qc = buildMarketEventQcReport(factRows)

  return {
    rawRows,
    factRows,
    duplicateRawRowsCollapsed: inputs.length - rawRows.length,
    duplicateFactRowsCollapsed: rawRows.length - factRows.length,
    qc,
  }
}

export function isCoffeeMarketEventReviewQueueCandidate(row: Pick<MarketEventFactRow, 'data_quality_flag' | 'notes' | 'event_date'>, options: { asOfDate: string }) {
  if (['needs_human_review', 'unclear_impact', 'missing_source_url', 'possible_duplicate'].includes(row.data_quality_flag)) {
    return true
  }
  if (!row.notes.includes('Adapter source=')) {
    return false
  }
  return daysBetween(row.event_date, options.asOfDate) <= 30
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
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await client.from(tableName).upsert(chunk, { onConflict })
    if (error) {
      throw error
    }
  }
  return rows.length
}

const FACT_COLUMNS: Array<keyof MarketEventFactRow> = [
  'event_date',
  'published_at',
  'commodity_group',
  'country_or_region',
  'country_iso',
  'event_type',
  'event_title',
  'event_summary',
  'expected_impact_direction',
  'expected_impact_area',
  'impact_score',
  'time_horizon',
  'confidence_score',
  'source_name',
  'source_url',
  'source_reliability_score',
  'fetched_at',
  'event_cluster_id',
  'duplicate_of',
  'data_quality_flag',
  'entities',
  'raw_payload',
  'notes',
]

const RAW_SOURCE_COLUMNS: Array<keyof MarketEventInputRow> = [
  'eventDate',
  'publishedAt',
  'commodityGroup',
  'countryOrRegion',
  'countryIso',
  'eventType',
  'eventTitle',
  'eventSummary',
  'expectedImpactDirection',
  'expectedImpactArea',
  'impactScore',
  'timeHorizon',
  'confidenceScore',
  'sourceName',
  'sourceUrl',
  'sourceReliabilityScore',
  'entities',
  'notes',
  'rawPayload',
  'fromRawFeed',
]

export async function syncCoffeeMarketEvents(options: CoffeeMarketEventsSyncOptions = {}): Promise<CoffeeMarketEventsSyncResult> {
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const writeArtifacts = options.writeArtifacts ?? true
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd())
  const seedCsvPath = resolve(options.seedCsvPath ?? resolve(workspaceRoot, 'data', 'seed', 'coffee_market_events_seed.csv'))
  const rawCsvPath = resolve(options.rawCsvPath ?? resolve(workspaceRoot, 'data', 'raw', 'market_event_items.csv'))
  const shouldProbeSources = options.probeSources || options.sourceHealthOnly || options.fetchSources
  const sourceHealth = shouldProbeSources
    ? await probeCoffeeMarketEventSources({
      fetchedAt,
      sourceIds: options.sourceIds,
      maxItemsPerSource: options.maxItemsPerSource,
    })
    : []
  const adapterResult = options.fetchSources
    ? await fetchCoffeeMarketEventSourceRows({
      fetchedAt,
      sourceIds: options.sourceIds,
      maxItemsPerSource: options.maxItemsPerSource,
    })
    : { rows: [], errors: [] }
  const inputRows = options.sourceHealthOnly
    ? []
    : [
      ...(options.sourceRows ?? (await loadInputRowsFromCsv(seedCsvPath, rawCsvPath))),
      ...adapterResult.rows,
    ]
  const prepared = prepareCoffeeMarketEventsRows(inputRows, {
    fetchedAt,
    staleDays: options.staleDays ?? DEFAULT_STALE_DAYS,
  })

  const rawSourceCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'raw', 'market_event_source_items.csv') : null
  const factCsvPath = writeArtifacts ? resolve(workspaceRoot, 'data', 'processed', 'fact_market_event.csv') : null
  const qcReportPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'market_event_qc.md') : null
  const sourceResearchPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'market_event_source_research.md') : null
  const sourceHealthPath = writeArtifacts ? resolve(workspaceRoot, 'reports', 'data_quality', 'market_event_source_health.md') : null
  const methodologyPath = writeArtifacts ? resolve(workspaceRoot, 'docs', 'methodology', 'coffee_market_events_methodology.md') : null

  if (rawSourceCsvPath) {
    await writeArtifactFile(rawSourceCsvPath, toCsv(adapterResult.rows, RAW_SOURCE_COLUMNS as string[]))
  }
  if (factCsvPath) {
    await writeArtifactFile(factCsvPath, toCsv(prepared.factRows, FACT_COLUMNS as string[]))
  }
  if (qcReportPath) {
    await writeArtifactFile(qcReportPath, renderCoffeeMarketEventsQcMarkdown(prepared.qc, {
      generatedAt: fetchedAt,
      sourceRowsFetched: adapterResult.rows.length,
      sourceErrors: adapterResult.errors,
      sourceHealth,
    }))
  }
  if (sourceResearchPath) {
    await writeArtifactFile(sourceResearchPath, renderCoffeeMarketEventSourceResearchMarkdown({
      generatedAt: fetchedAt,
      fetchedRows: adapterResult.rows.length,
      errors: adapterResult.errors,
      sourceHealth,
    }))
  }
  if (sourceHealthPath) {
    await writeArtifactFile(sourceHealthPath, renderCoffeeMarketEventSourceHealthMarkdown({
      generatedAt: fetchedAt,
      sourceHealth,
    }))
  }
  if (methodologyPath) {
    await writeArtifactFile(methodologyPath, renderCoffeeMarketEventsMethodology())
  }

  let rawRowsPersisted = 0
  let factRowsPersisted = 0
  if (!dryRun && !options.sourceHealthOnly && getSupabaseAdminClient()) {
    rawRowsPersisted = await upsertRowsInChunks(
      'raw_market_event_items',
      prepared.rawRows,
      'source_url,published_at,title_raw',
    )
    factRowsPersisted = await upsertRowsInChunks(
      'fact_market_event',
      prepared.factRows,
      'event_date,commodity_group,country_or_region,event_type,source_url',
    )
  }

  return {
    fetchedAt,
    rawRowsPrepared: prepared.rawRows.length,
    rawRowsPersisted,
    factRowsPrepared: prepared.factRows.length,
    factRowsPersisted,
    duplicateRawRowsCollapsed: prepared.duplicateRawRowsCollapsed,
    duplicateFactRowsCollapsed: prepared.duplicateFactRowsCollapsed,
    qc: prepared.qc,
    rows: prepared.factRows,
    sourceRowsFetched: adapterResult.rows.length,
    sourceErrors: adapterResult.errors,
    sourceHealth,
    artifacts: {
      rawSourceCsvPath,
      factCsvPath,
      qcReportPath,
      sourceResearchPath,
      sourceHealthPath,
      methodologyPath,
    },
  }
}

type CoffeeMarketEventViewRow = {
  event_date: string
  published_at: string | null
  country_or_region: string | null
  country_iso: string | null
  event_type: string
  event_title: string
  event_summary: string | null
  expected_impact_direction: string
  expected_impact_area: string
  impact_score: number | string | null
  time_horizon: string
  confidence_score: number | string | null
  source_name: string
  source_url: string
  source_reliability_score: number | string | null
  data_quality_flag?: string | null
  notes: string | null
}

function toCoffeeMarketEventItem(row: CoffeeMarketEventViewRow): CoffeeMarketEventItem {
  return {
    eventDate: row.event_date,
    publishedAt: row.published_at,
    countryOrRegion: row.country_or_region,
    countryIso: row.country_iso,
    eventType: normalizeEventType(row.event_type) ?? 'other',
    eventTitle: row.event_title,
    eventSummary: row.event_summary,
    expectedImpactDirection: normalizeImpactDirection(row.expected_impact_direction) ?? 'unclear',
    expectedImpactArea: normalizeImpactArea(row.expected_impact_area) ?? 'other',
    impactScore: toNumber(row.impact_score) ?? 0,
    timeHorizon: normalizeTimeHorizon(row.time_horizon) ?? 'unclear',
    confidenceScore: toNumber(row.confidence_score) ?? 0,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceReliabilityScore: toNumber(row.source_reliability_score) ?? 0,
    dataQualityFlag: normalizeQualityFlag(row.data_quality_flag) ?? 'ok',
    notes: row.notes ?? '',
  }
}

function buildFallbackResponse(message: string): CoffeeMarketEventsResponse {
  return {
    success: true,
    status: 'fallback',
    lastUpdated: new Date().toISOString(),
    count: 0,
    data: [],
    errors: [message],
  }
}

function isRelationMissing(message: string) {
  return message.includes('relation') || message.includes('does not exist')
}

async function getRowsFromView(
  viewName: string,
  options: {
    limit: number
    eventType?: string
    countryIso?: string
    fromDate?: string
    toDate?: string
  },
) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  let query = client
    .from(viewName)
    .select(
      [
        'event_date',
        'published_at',
        'country_or_region',
        'country_iso',
        'event_type',
        'event_title',
        'event_summary',
        'expected_impact_direction',
        'expected_impact_area',
        'impact_score',
        'time_horizon',
        'confidence_score',
        'source_name',
        'source_url',
        'source_reliability_score',
        'data_quality_flag',
        'notes',
      ].join(', '),
    )
    .limit(options.limit)
    .order('event_date', { ascending: false })
    .order('confidence_score', { ascending: false, nullsFirst: false })

  if (options.eventType) {
    query = query.eq('event_type', options.eventType)
  }
  if (options.countryIso) {
    query = query.eq('country_iso', options.countryIso)
  }
  if (options.fromDate) {
    query = query.gte('event_date', options.fromDate)
  }
  if (options.toDate) {
    query = query.lte('event_date', options.toDate)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data ?? []) as unknown as CoffeeMarketEventViewRow[]
}

export async function getCoffeeMarketEventsResponse(options?: {
  limit?: number
  eventType?: string
  countryIso?: string
  fromDate?: string
  toDate?: string
}): Promise<CoffeeMarketEventsResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackResponse('Coffee market events require Supabase curated data')
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 200, 500))
  try {
    const rows = await getRowsFromView('vw_coffee_market_events_recent', {
      limit,
      eventType: options?.eventType,
      countryIso: options?.countryIso,
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    })
    const data = (rows ?? []).map(toCoffeeMarketEventItem)
    return {
      success: true,
      status: 'live',
      lastUpdated: data[0]?.eventDate ?? new Date().toISOString(),
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Coffee Market Events] Falling back to empty payload:', error)
    }
    return buildFallbackResponse('Coffee market events are unavailable')
  }
}

export async function getCoffeePolicyWatchResponse(limit = 200): Promise<CoffeeMarketEventsResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackResponse('Coffee policy watch requires Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(limit, 500))
  try {
    const rows = await getRowsFromView('vw_coffee_policy_watch', { limit: rowLimit })
    const data = (rows ?? []).map(toCoffeeMarketEventItem)
    return {
      success: true,
      status: 'live',
      lastUpdated: data[0]?.eventDate ?? new Date().toISOString(),
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Coffee Policy Watch] Falling back to empty payload:', error)
    }
    return buildFallbackResponse('Coffee policy watch is unavailable')
  }
}

export async function getCoffeeSupplyRiskEventsResponse(limit = 200): Promise<CoffeeMarketEventsResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackResponse('Coffee supply risk events require Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(limit, 500))
  try {
    const rows = await getRowsFromView('vw_coffee_supply_risk_events', { limit: rowLimit })
    const data = (rows ?? []).map(toCoffeeMarketEventItem)
    return {
      success: true,
      status: 'live',
      lastUpdated: data[0]?.eventDate ?? new Date().toISOString(),
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Coffee Supply Risk Events] Falling back to empty payload:', error)
    }
    return buildFallbackResponse('Coffee supply risk events are unavailable')
  }
}

export async function getCoffeeMarketEventBriefCandidatesResponse(limit = 50): Promise<CoffeeMarketEventsResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackResponse('Coffee brief candidates require Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(limit, 500))
  try {
    const rows = await getRowsFromView('vw_coffee_market_event_brief_candidates', { limit: rowLimit })
    const data = (rows ?? []).map(toCoffeeMarketEventItem)
    return {
      success: true,
      status: 'live',
      lastUpdated: data[0]?.eventDate ?? new Date().toISOString(),
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Coffee Brief Candidates] Falling back to empty payload:', error)
    }
    return buildFallbackResponse('Coffee brief candidates are unavailable')
  }
}

export async function getCoffeeMarketEventReviewQueueResponse(limit = 100): Promise<CoffeeMarketEventsResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackResponse('Coffee market event review queue requires Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(limit, 500))
  try {
    const rows = await getRowsFromView('vw_coffee_market_event_review_queue', { limit: rowLimit })
    const data = (rows ?? []).map(toCoffeeMarketEventItem)
    return {
      success: true,
      status: 'live',
      lastUpdated: data[0]?.eventDate ?? new Date().toISOString(),
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Coffee Review Queue] Falling back to empty payload:', error)
    }
    return buildFallbackResponse('Coffee market event review queue is unavailable')
  }
}
