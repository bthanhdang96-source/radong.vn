import { getCategories, getWorldPrices as getLegacyWorldPrices, type WorldCommodityItem } from './worldBankService.js'
import { getWorldCommodityDisplayMeta } from './worldBankService.js'
import {
  fetchLiveDayData,
  getVnPriceSourceStatus as getLegacyVnPriceSourceStatus,
  getVnPrices as getLegacyVnPrices,
  getVnPricesHistory as getLegacyVnPricesHistory,
} from './priceAggregator.js'
import { DURIAN_COMMODITY_SLUG, isDurianHeadlineQualityGrade } from './durianPricing.js'
import type { CrawledPriceItem, SourceId, SourceSnapshot, VnPricesResponse } from './crawlers/types.js'
import { enqueueDayData, isRedisQueueConfigured, shouldProcessInline } from './ingestion/queue.js'
import { loadCommodityLookup, processIngestionMessage, recordIngestionError, type IngestionQueueMessage } from './ingestion/pipeline.js'
import { processQueuedBatch } from './ingestion/worker.js'
import {
  COCONUT_COMMODITY_SLUG,
  getDisplayUnit,
  normalizeUnitKey,
  selectPreferredCoconutUnitCluster,
  type NormalizedUnitKey,
} from './coconutPricing.js'
import {
  getRegionLabelFromObservation,
  convertWorldPriceToUsdKg,
  SOURCE_BASE_CONFIDENCE,
  USD_VND_RATE,
  VN_COMMODITY_META,
  type PriceType,
} from './marketDataMappings.js'
import {
  buildCanonicalRegionSelections,
  buildSourcePriorityLookup,
  createRankedRegionCandidate,
  pickSummaryRegionSelections,
  toRegionPrices,
} from './priceQuality.js'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from './supabaseClient.js'
import { getTrendDirection, roundTrendNumber, type CommoditySparkPoint } from './trendUtils.js'
import { fetchWorldPriceProviderItems, type WorldPriceProviderItem } from './worldPriceProviders.js'

type LatestObservationRow = {
  recorded_at: string
  commodity_slug: string
  province_code: string | null
  variety: string | null
  quality_grade: string | null
  price_type?: string | null
  market_type?: string | null
  unit?: string | null
  price_vnd: number
  price_usd?: number | null
  source: string
  raw_payload: {
    region?: string
    commodityName?: string
    category?: string
    unit?: string
    unitRaw?: string | null
    normalizedUnitKey?: string | null
    unitQuantity?: number | null
    priceType?: PriceType
    marketName?: string
    articleTitle?: string
    provinceCode?: string
    commoditySlug?: string
    dedupeKey?: string | null
    extra?: Record<string, unknown> | null
    change?: number | null
    changePct?: number | null
    previousPrice?: number | null
    source?: string
  }
}

type CommodityWorldRow = {
  id: number
  slug: string
  world_to_kg_factor: number | null
}

type DailySummaryRow = {
  date: string
  commodity_slug: string
  province_code: string | null
  price_type: string
  avg_price_vnd: number
  min_price_vnd: number
  max_price_vnd: number
  observation_count: number
  sources: string[] | null
}

type CommodityTrendRow = {
  commodity_slug: string
  price_type: string
  avg_7d: number | null
  avg_30d: number | null
  trend_7d_pct: number | null
  trend_30d_pct: number | null
  updated_at: string
}

type RawCrawlLogRow = {
  source_name?: string
  source?: string
  source_url: string | null
  crawled_at: string
  raw_json: {
    snapshot?: SourceSnapshot
  }
}

type LatestWorldPriceRow = {
  recorded_at: string
  observed_on?: string | null
  crawl_recorded_at?: string | null
  commodity_slug: string
  exchange: string
  price_usd: number
  price_unit: string
  price_vnd_kg: number | null
  change_1d?: number | null
  change_1d_pct?: number | null
  change_1w_pct?: number | null
  data_granularity?: string | null
  temporal_coverage?: string | null
  benchmark_type?: string | null
  source_id?: string | null
  source_license_note?: string | null
  quality_grade?: string | null
  contract_symbol?: string | null
  source_observation_label?: string | null
  source_url: string | null
  raw_payload: Partial<WorldCommodityItem> & Record<string, unknown>
}

type WorldPricesResponse = {
  success: boolean
  status: 'live' | 'fallback'
  sourceMode: 'supabase_curated' | 'legacy'
  count: number
  exchangeRate: number
  categories: string[]
  lastUpdated: string
  data: Array<
    WorldCommodityItem & {
      priceVndKg?: number | null
      observedOn?: string | null
      crawlRecordedAt?: string | null
      dataGranularity?: string | null
      temporalCoverage?: string | null
      benchmarkType?: string | null
      sourceId?: string | null
      sourceLicenseNote?: string | null
      qualityGrade?: string | null
      contractSymbol?: string | null
      sourceObservationLabel?: string | null
      isDailySignal?: boolean
    }
  >
}

type WorldPriceSyncRunStatus = 'running' | 'success' | 'partial' | 'failed'

type WorldPriceSyncRunTrigger = 'scheduler' | 'admin_api' | 'manual' | 'unknown'

type WorldPriceSyncRunRow = {
  id: string
  started_at: string
  finished_at: string | null
  status: WorldPriceSyncRunStatus
  force_refresh: boolean
  trigger: WorldPriceSyncRunTrigger
  item_count: number
  upsert_count: number
  provider_error_count: number
  provider_errors: string[] | null
  error_message: string | null
  metadata: Record<string, unknown> | null
}

type WorldPriceSyncRunRecord = {
  id: string
  startedAt: string
  finishedAt: string | null
  status: WorldPriceSyncRunStatus
  forceRefresh: boolean
  trigger: WorldPriceSyncRunTrigger
  itemCount: number
  upsertCount: number
  providerErrorCount: number
  providerErrors: string[]
  errorMessage: string | null
  metadata: Record<string, unknown> | null
}

type WorldPriceSyncContext = {
  trigger?: WorldPriceSyncRunTrigger
}

type VnPriceQueryOptions = {
  priceTypes?: PriceType[]
}

type PriceChainRetailRegion = {
  provinceCode: string
  region: string
  avgPrice: number
  vsNationalAvgPct: number | null
  dataPoints: number
}

type PriceChainItem = {
  commodity: string
  commodityName: string
  category: string
  unit: string
  farmGateVnd: number | null
  wholesaleVnd: number | null
  retailVnd: number | null
  exportVnd: number | null
  exportUsd: number | null
  worldUsdKg: number | null
  worldExchange: string | null
  retailVsFarmgatePct: number | null
  exportVsFarmgatePct: number | null
  trend7dPct: number | null
  updatedAt: string
  retailRegions: PriceChainRetailRegion[]
}

type VnPriceChainResponse = {
  status: 'live' | 'fallback'
  lastUpdated: string
  sources: SourceSnapshot[]
  errors: string[]
  data: PriceChainItem[]
}

type WorldCoffeeBenchmarkDailyRow = {
  price_date: string
  commodity_group: string
  benchmark_name: string
  benchmark_type: string
  contract_code: string | null
  contract_month: string | null
  price_value: number | string | null
  currency: string | null
  unit: string | null
  price_usd_per_ton: number | string | null
  source_name: string
  source_url: string | null
  fetched_at: string
  confidence_score: number | string | null
  data_quality_flag: string
  notes: string | null
}

type WorldCoffeeBenchmarkMonthlyRow = {
  month_start: string
  period_label: string
  benchmark_name: string
  benchmark_type: string
  avg_price_usd_per_ton: number | string | null
  min_price_usd_per_ton: number | string | null
  max_price_usd_per_ton: number | string | null
  observations: number | string | null
  min_confidence_score: number | string | null
  fetched_at: string | null
}

type CoffeePriceStackRow = {
  period_label: string
  avg_export_unit_value_usd_per_ton: number | string | null
  avg_domestic_price_usd_per_ton: number | string | null
  avg_domestic_price_vnd_per_kg: number | string | null
  benchmark_name: string | null
  benchmark_type: string | null
  avg_world_benchmark_usd_per_ton: number | string | null
  export_vs_benchmark_gap_usd_per_ton: number | string | null
  export_vs_benchmark_gap_pct: number | string | null
  domestic_vs_benchmark_gap_usd_per_ton: number | string | null
  domestic_vs_benchmark_gap_pct: number | string | null
  interpretation_note: string | null
}

type CoffeeCompetitorBenchmarkRow = {
  period_type: string
  period_start: string
  period_label: string
  partner_country: string
  partner_iso: string | null
  vietnam_unit_value_usd_per_ton: number | string | null
  brazil_unit_value_usd_per_ton: number | string | null
  indonesia_unit_value_usd_per_ton: number | string | null
  vietnam_value_usd: number | string | null
  brazil_value_usd: number | string | null
  indonesia_value_usd: number | string | null
  vietnam_quantity_ton: number | string | null
  brazil_quantity_ton: number | string | null
  indonesia_quantity_ton: number | string | null
  vietnam_unit_value_flag: string | null
  brazil_unit_value_flag: string | null
  indonesia_unit_value_flag: string | null
  min_confidence_score: number | string | null
  vietnam_vs_brazil_gap_pct: number | string | null
  vietnam_vs_indonesia_gap_pct: number | string | null
  benchmark_quality_flag: string
  interpretation_note: string | null
}

type CoffeeCompetitorBenchmarkSummaryRow = {
  period_type: string
  period_label: string
  period_start: string
  vietnam_markets: number | string | null
  markets_with_brazil: number | string | null
  markets_with_indonesia: number | string | null
  ok_benchmark_markets: number | string | null
  avg_vietnam_vs_brazil_gap_pct: number | string | null
  avg_vietnam_vs_indonesia_gap_pct: number | string | null
  markets_vietnam_premium_vs_brazil: number | string | null
  markets_vietnam_discount_vs_brazil: number | string | null
  interpretation_note: string | null
}

export type WorldCoffeeBenchmarkDailyItem = {
  priceDate: string
  commodityGroup: string
  benchmarkName: string
  benchmarkType: string
  contractCode: string | null
  contractMonth: string | null
  priceValue: number | null
  currency: string | null
  unit: string | null
  priceUsdPerTon: number | null
  sourceName: string
  sourceUrl: string | null
  fetchedAt: string
  confidenceScore: number | null
  dataQualityFlag: string
  notes: string | null
}

export type WorldCoffeeBenchmarkMonthlyItem = {
  monthStart: string
  periodLabel: string
  benchmarkName: string
  benchmarkType: string
  avgPriceUsdPerTon: number | null
  minPriceUsdPerTon: number | null
  maxPriceUsdPerTon: number | null
  observations: number
  minConfidenceScore: number | null
  fetchedAt: string | null
}

export type CoffeePriceStackItem = {
  periodLabel: string
  avgExportUnitValueUsdPerTon: number | null
  avgDomesticPriceUsdPerTon: number | null
  avgDomesticPriceVndPerKg: number | null
  benchmarkName: string | null
  benchmarkType: string | null
  avgWorldBenchmarkUsdPerTon: number | null
  exportVsBenchmarkGapUsdPerTon: number | null
  exportVsBenchmarkGapPct: number | null
  domesticVsBenchmarkGapUsdPerTon: number | null
  domesticVsBenchmarkGapPct: number | null
  interpretationNote: string | null
}

export type CoffeeCompetitorBenchmarkItem = {
  periodType: string
  periodStart: string
  periodLabel: string
  partnerCountry: string
  partnerIso: string | null
  vietnamUnitValueUsdPerTon: number | null
  brazilUnitValueUsdPerTon: number | null
  indonesiaUnitValueUsdPerTon: number | null
  vietnamValueUsd: number | null
  brazilValueUsd: number | null
  indonesiaValueUsd: number | null
  vietnamQuantityTon: number | null
  brazilQuantityTon: number | null
  indonesiaQuantityTon: number | null
  vietnamUnitValueFlag: string | null
  brazilUnitValueFlag: string | null
  indonesiaUnitValueFlag: string | null
  minConfidenceScore: number | null
  vietnamVsBrazilGapPct: number | null
  vietnamVsIndonesiaGapPct: number | null
  benchmarkQualityFlag: string
  interpretationNote: string | null
}

export type CoffeeCompetitorBenchmarkSummaryItem = {
  periodType: string
  periodLabel: string
  periodStart: string
  vietnamMarkets: number
  marketsWithBrazil: number
  marketsWithIndonesia: number
  okBenchmarkMarkets: number
  avgVietnamVsBrazilGapPct: number | null
  avgVietnamVsIndonesiaGapPct: number | null
  marketsVietnamPremiumVsBrazil: number
  marketsVietnamDiscountVsBrazil: number
  interpretationNote: string | null
}

export type WorldCoffeeBenchmarkResponse = {
  success: boolean
  status: 'live' | 'fallback'
  lastUpdated: string
  dailyCount: number
  monthlyCount: number
  daily: WorldCoffeeBenchmarkDailyItem[]
  monthly: WorldCoffeeBenchmarkMonthlyItem[]
  errors: string[]
}

export type CoffeePriceStackResponse = {
  success: boolean
  status: 'live' | 'fallback'
  lastUpdated: string
  count: number
  data: CoffeePriceStackItem[]
  errors: string[]
}

export type CoffeeCompetitorBenchmarkResponse = {
  success: boolean
  status: 'live' | 'fallback'
  lastUpdated: string
  count: number
  data: CoffeeCompetitorBenchmarkItem[]
  errors: string[]
}

export type CoffeeCompetitorBenchmarkSummaryResponse = {
  success: boolean
  status: 'live' | 'fallback'
  lastUpdated: string
  count: number
  data: CoffeeCompetitorBenchmarkSummaryItem[]
  errors: string[]
}

const DEFAULT_VN_PRICE_TYPES: PriceType[] = ['farm_gate', 'wholesale']
const EXPORT_OBSERVATION_LOOKBACK_DAYS = 45
const SUMMARY_PRICE_TYPE_PREFERENCE: Partial<Record<string, PriceType>> = {
  cassava: 'farm_gate',
  'tea-avg': 'farm_gate',
  'thanh-long': 'farm_gate',
  'dua-tuoi': 'farm_gate',
}
const DEFAULT_SOURCE_SNAPSHOT_IDS: SourceId[] = [
  'nongnghiep',
  'vietnambiz',
  'congthuong',
  'chogia',
  'daklak_sct',
  'dongnai_sct_daugiay',
  'banggianongsan',
  'giahotieu',
  'kimhungmarket',
  'vietfood',
  'giaca_nsvl',
  'bhx',
  'coop',
  'customs',
  'agroinfo_fruit_report',
]

function roundNumber(value: number) {
  return Number(value.toFixed(2))
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

async function loadCommodityWorldLookup() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client.from('commodities').select('id, slug, world_to_kg_factor')
  if (error) {
    throw error
  }

  return new Map(((data ?? []) as CommodityWorldRow[]).map(row => [row.slug, row]))
}

function getRecommendation(changePct: number): 'Mua' | 'Bán' | 'Giữ' {
  if (changePct >= 1) {
    return 'Mua'
  }

  if (changePct <= -1) {
    return 'Bán'
  }

  return 'Giữ'
}

function isRelationMissing(message: string) {
  return message.includes('relation') || message.includes('does not exist')
}

function isWorldSyncLogTableMissing(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return (code === '42P01' || code === 'PGRST204' || code === '42703') && message.includes('world_price_sync_runs')
}

function isColumnMissing(error: unknown, columnName: string) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return (code === '42703' || code === 'PGRST204') && message.includes(columnName)
}

function normalizeDateKey(value: string) {
  return value.slice(0, 10)
}

function resolveWorldSyncTrigger(context?: WorldPriceSyncContext): WorldPriceSyncRunTrigger {
  return context?.trigger ?? 'unknown'
}

function toWorldPriceSyncRunRecord(row: WorldPriceSyncRunRow): WorldPriceSyncRunRecord {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    forceRefresh: row.force_refresh,
    trigger: row.trigger,
    itemCount: row.item_count,
    upsertCount: row.upsert_count,
    providerErrorCount: row.provider_error_count,
    providerErrors: row.provider_errors ?? [],
    errorMessage: row.error_message,
    metadata: row.metadata ?? null,
  }
}

function getRequestedPriceTypes(options?: VnPriceQueryOptions) {
  const requested = options?.priceTypes?.filter(Boolean)
  return requested && requested.length > 0 ? requested : DEFAULT_VN_PRICE_TYPES
}

function isDefaultPriceTypeQuery(priceTypes: PriceType[]) {
  return (
    priceTypes.length === DEFAULT_VN_PRICE_TYPES.length &&
    DEFAULT_VN_PRICE_TYPES.every(priceType => priceTypes.includes(priceType))
  )
}

export function resolveSourceSnapshotIds(sourceIds?: SourceSnapshot['id'][]) {
  const requested = sourceIds?.filter(Boolean)
  if (requested && requested.length > 0) {
    return [...new Set(requested)]
  }

  return [...DEFAULT_SOURCE_SNAPSHOT_IDS]
}

async function refreshCuratedViews() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client.rpc('refresh_curated_views')
  if (error) {
    throw error
  }
}

async function startWorldPriceSyncRun(forceRefresh: boolean, trigger: WorldPriceSyncRunTrigger) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('world_price_sync_runs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'running',
      force_refresh: forceRefresh,
      trigger,
    })
    .select('id')
    .single()

  if (error) {
    if (!isWorldSyncLogTableMissing(error)) {
      console.warn('[World Prices] Unable to write sync start log:', error)
    }
    return null
  }

  return (data as { id: string }).id
}

async function finishWorldPriceSyncRun(
  runId: string | null,
  payload: {
    status: Exclude<WorldPriceSyncRunStatus, 'running'>
    itemCount: number
    upsertCount: number
    providerErrors: string[]
    errorMessage?: string | null
    metadata?: Record<string, unknown>
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
    .from('world_price_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: payload.status,
      item_count: payload.itemCount,
      upsert_count: payload.upsertCount,
      provider_error_count: payload.providerErrors.length,
      provider_errors: payload.providerErrors,
      error_message: payload.errorMessage ?? null,
      metadata: payload.metadata ?? {},
    })
    .eq('id', runId)

  if (error && !isWorldSyncLogTableMissing(error)) {
    console.warn('[World Prices] Unable to write sync completion log:', error)
  }
}

async function persistSourceSnapshots(sourceSnapshots: SourceSnapshot[]) {
  if (sourceSnapshots.length === 0) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const modernRows = sourceSnapshots.map(source => ({
    source_name: source.id,
    source_url: source.latestArticleUrl ?? source.url,
    raw_json: {
      snapshot: source,
      coverage: source.coverage,
      syncedAt: new Date().toISOString(),
    },
  }))

  let { error } = await client.from('raw_crawl_logs').insert(modernRows)
  if (error) {
    const legacyRows = sourceSnapshots.map(source => ({
      source: source.id,
      source_url: source.latestArticleUrl ?? source.url,
      crawled_at: source.fetchedAt,
      raw_json: {
        snapshot: source,
        coverage: source.coverage,
        syncedAt: new Date().toISOString(),
      },
    }))
    const retry = await client.from('raw_crawl_logs').insert(legacyRows)
    error = retry.error
  }

  if (error) {
    throw error
  }
}

function buildQueueMessage(item: CrawledPriceItem, sourceSnapshots: SourceSnapshot[]): IngestionQueueMessage {
  const sourceSnapshot = sourceSnapshots.find(snapshot => snapshot.id === item.source)
  return {
    source: item.source,
    sourceUrl: sourceSnapshot?.latestArticleUrl ?? sourceSnapshot?.url ?? null,
    crawledAt: item.timestamp,
    raw: item,
  }
}

async function getLatestObservationRows(priceTypes: PriceType[]) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const modern = await client
    .from('latest_observation_details')
    .select('recorded_at, commodity_slug, province_code, variety, quality_grade, price_type, unit, price_vnd, price_usd, source, raw_payload')
    .in('price_type', priceTypes)
    .order('commodity_slug', { ascending: true })
    .order('price_vnd', { ascending: false })

  if (modern.error && isColumnMissing(modern.error, 'price_type')) {
    const legacy = await client
      .from('latest_observation_details')
      .select('recorded_at, commodity_slug, province_code, variety, quality_grade, market_type, unit, price_vnd, price_usd, source, raw_payload')
      .in('market_type', priceTypes)
      .order('commodity_slug', { ascending: true })
      .order('price_vnd', { ascending: false })

    if (legacy.error) {
      throw legacy.error
    }

    return (legacy.data ?? []) as LatestObservationRow[]
  }

  if (modern.error) {
    throw modern.error
  }

  return (modern.data ?? []) as LatestObservationRow[]
}

async function getRecentObservationRows(priceTypes: PriceType[], lookbackDays = 30) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const start = new Date()
  start.setDate(start.getDate() - lookbackDays)

  const modern = await client
    .from('price_observations')
    .select(
      'recorded_at, commodity_slug, province_code, variety, quality_grade, price_type, unit, price_vnd, price_usd, source_name, raw_payload',
    )
    .gte('recorded_at', start.toISOString())
    .in('price_type', priceTypes)
    .order('recorded_at', { ascending: false })
    .limit(5000)

  if (modern.error && isColumnMissing(modern.error, 'price_type')) {
    const legacy = await client
      .from('price_observations')
      .select('recorded_at, commodity_slug, province_code, variety, quality_grade, market_type, unit, price_vnd, price_usd, source, raw_payload')
      .gte('recorded_at', start.toISOString())
      .in('market_type', priceTypes)
      .order('recorded_at', { ascending: false })
      .limit(5000)

    if (legacy.error) {
      throw legacy.error
    }

    return ((legacy.data ?? []) as Array<{
      recorded_at: string
      commodity_slug: string
      province_code: string | null
      variety: string | null
      quality_grade: string | null
      market_type: string | null
      unit?: string | null
      price_vnd: number
      price_usd?: number | null
      source: string
      raw_payload: LatestObservationRow['raw_payload']
    }>).map(row => ({
      recorded_at: row.recorded_at,
      commodity_slug: row.commodity_slug,
      province_code: row.province_code,
      variety: row.variety,
      quality_grade: row.quality_grade,
      market_type: row.market_type,
      price_vnd: row.price_vnd,
      price_usd: row.price_usd ?? null,
      unit: row.unit ?? null,
      source: row.source,
      raw_payload: row.raw_payload ?? {},
    }))
  }

  if (modern.error) {
    throw modern.error
  }

  return ((modern.data ?? []) as Array<{
    recorded_at: string
    commodity_slug: string
    province_code: string | null
    variety: string | null
      quality_grade: string | null
      price_type: string | null
      unit?: string | null
      price_vnd: number
    price_usd?: number | null
    source_name: string
    raw_payload: LatestObservationRow['raw_payload']
  }>).map(row => ({
    recorded_at: row.recorded_at,
    commodity_slug: row.commodity_slug,
    province_code: row.province_code,
    variety: row.variety,
    quality_grade: row.quality_grade,
    price_type: row.price_type,
    unit: row.unit ?? null,
    price_vnd: row.price_vnd,
    price_usd: row.price_usd ?? null,
    source: row.source_name,
    raw_payload: row.raw_payload ?? {},
  }))
}

async function getDailySummaryRows(priceTypes: PriceType[]) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const start = new Date()
  start.setDate(start.getDate() - 365)

  const { data, error } = await client
    .from('daily_price_summary')
    .select('date, commodity_slug, province_code, price_type, avg_price_vnd, min_price_vnd, max_price_vnd, observation_count, sources')
    .gte('date', start.toISOString())
    .in('price_type', priceTypes)

  if (error && isColumnMissing(error, 'price_type')) {
    const legacy = await client
      .from('daily_price_summary')
      .select('date, commodity_slug, province_code, market_type, avg_price, min_price, max_price, observation_count, sources')
      .gte('date', start.toISOString())
      .in('market_type', priceTypes)

    if (legacy.error) {
      throw legacy.error
    }

    return ((legacy.data ?? []) as Array<{
      date: string
      commodity_slug: string
      province_code: string | null
      market_type: string
      avg_price: number
      min_price: number
      max_price: number
      observation_count: number
      sources: string[] | null
    }>).map(row => ({
      date: row.date,
      commodity_slug: row.commodity_slug,
      province_code: row.province_code,
      price_type: row.market_type,
      avg_price_vnd: row.avg_price,
      min_price_vnd: row.min_price,
      max_price_vnd: row.max_price,
      observation_count: row.observation_count,
      sources: row.sources,
    }))
  }

  if (error) {
    throw error
  }

  return data as DailySummaryRow[]
}

async function getCommodityTrendRows(priceTypes: PriceType[]) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const preferredPriceType = priceTypes.includes('wholesale') ? 'wholesale' : priceTypes[0]
  const { data, error } = await client
    .from('commodity_trends')
    .select('commodity_slug, price_type, avg_7d, avg_30d, trend_7d_pct, trend_30d_pct, updated_at')
    .eq('price_type', preferredPriceType)

  if (error && isColumnMissing(error, 'price_type')) {
    const legacy = await client
      .from('commodity_trends')
      .select('commodity_slug, avg_7d, avg_30d, trend_7d_pct, trend_30d_pct, updated_at')

    if (legacy.error) {
      throw legacy.error
    }

    return ((legacy.data ?? []) as Array<Omit<CommodityTrendRow, 'price_type'>>).map(row => ({
      ...row,
      price_type: preferredPriceType,
    }))
  }

  if (error) {
    throw error
  }

  return data as CommodityTrendRow[]
}

async function getAllCommodityTrendRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('commodity_trends')
    .select('commodity_slug, price_type, avg_7d, avg_30d, trend_7d_pct, trend_30d_pct, updated_at')

  if (error && isColumnMissing(error, 'price_type')) {
    const legacy = await client
      .from('commodity_trends')
      .select('commodity_slug, avg_7d, avg_30d, trend_7d_pct, trend_30d_pct, updated_at')

    if (legacy.error) {
      throw legacy.error
    }

    return ((legacy.data ?? []) as Array<Omit<CommodityTrendRow, 'price_type'>>).map(row => ({
      ...row,
      price_type: 'wholesale',
    }))
  }

  if (error) {
    throw error
  }

  return data as CommodityTrendRow[]
}

async function getLatestSourceSnapshots(sourceIds?: SourceSnapshot['id'][]) {
  const client = getSupabaseAdminClient() ?? getSupabaseReadClient()
  const requestedSourceIds = resolveSourceSnapshotIds(sourceIds)
  if (!client || requestedSourceIds.length === 0) {
    return []
  }

  const runQuery = async (sourceId: SourceSnapshot['id'], column: 'source' | 'source_name') => {
    const { data, error } = await client
      .from('raw_crawl_logs')
      .select('*')
      .eq(column, sourceId)
      .order('crawled_at', { ascending: false })
      .limit(50)

    return { data, error }
  }

  const bySource = new Map<string, SourceSnapshot>()
  for (const sourceId of requestedSourceIds) {
    let { data, error } = await runQuery(sourceId, 'source_name')
    if (error) {
      const retry = await runQuery(sourceId, 'source')
      data = retry.data
      error = retry.error
    }

    if (error) {
      throw error
    }

    const rows = (data as RawCrawlLogRow[] | null | undefined) ?? []
    if (rows.length === 0) {
      continue
    }

    const latestCrawledAt = rows[0].crawled_at
    const snapshots = rows
      .filter(row => row.crawled_at === latestCrawledAt)
      .map(row => row.raw_json?.snapshot)
      .filter((snapshot): snapshot is SourceSnapshot => Boolean(snapshot))
    const aggregated = aggregateSourceSnapshots(sourceId, snapshots)
    if (!aggregated || bySource.has(sourceId)) {
      continue
    }

    bySource.set(sourceId, aggregated)
  }

  return [...bySource.values()]
}

export function selectLatestObservationRows(rows: LatestObservationRow[]) {
  const sortedRows = [...rows].sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
  const bySignature = new Map<string, LatestObservationRow>()

  for (const row of sortedRows) {
    const priceType = getObservationPriceType(row)
    const provinceCode = row.province_code ?? ''
    const marketName =
      typeof row.raw_payload?.marketName === 'string' && row.raw_payload.marketName.length > 0
        ? row.raw_payload.marketName
        : ''
    const articleTitle =
      typeof row.raw_payload?.articleTitle === 'string' && row.raw_payload.articleTitle.length > 0
        ? row.raw_payload.articleTitle
        : ''
    const signature = [
      getObservationSource(row),
      row.commodity_slug,
      priceType,
      provinceCode,
      row.variety ?? '',
      row.quality_grade ?? '',
      marketName,
      articleTitle,
    ].join('::')

    if (!bySignature.has(signature)) {
      bySignature.set(signature, row)
    }
  }

  return [...bySignature.values()]
}

function buildHistoricalLookups(rows: DailySummaryRow[]) {
  const rangeByCommodity = new Map<string, { low: number; high: number }>()
  const dailyByCommodity = new Map<
    string,
    Map<string, { weightedSum: number; observationCount: number; minPrice: number; maxPrice: number }>
  >()

  for (const row of rows) {
    const range = rangeByCommodity.get(row.commodity_slug)
    if (!range) {
      rangeByCommodity.set(row.commodity_slug, {
        low: row.min_price_vnd,
        high: row.max_price_vnd,
      })
    } else {
      range.low = Math.min(range.low, row.min_price_vnd)
      range.high = Math.max(range.high, row.max_price_vnd)
    }

    const dateKey = normalizeDateKey(row.date)
    const byDate = dailyByCommodity.get(row.commodity_slug) ?? new Map()
    const aggregate = byDate.get(dateKey) ?? {
      weightedSum: 0,
      observationCount: 0,
      minPrice: row.min_price_vnd,
      maxPrice: row.max_price_vnd,
    }
    const weight = row.observation_count > 0 ? row.observation_count : 1

    aggregate.weightedSum += row.avg_price_vnd * weight
    aggregate.observationCount += weight
    aggregate.minPrice = Math.min(aggregate.minPrice, row.min_price_vnd)
    aggregate.maxPrice = Math.max(aggregate.maxPrice, row.max_price_vnd)

    byDate.set(dateKey, aggregate)
    dailyByCommodity.set(row.commodity_slug, byDate)
  }

  return {
    rangeByCommodity,
    dailyByCommodity,
  }
}

function buildHistoricalLookupsByCommodityAndPriceType(rows: DailySummaryRow[]) {
  const rangeByCommodityAndPriceType = new Map<string, { low: number; high: number }>()
  const dailyByCommodityAndPriceType = new Map<
    string,
    Map<string, { weightedSum: number; observationCount: number; minPrice: number; maxPrice: number }>
  >()

  for (const row of rows) {
    const key = `${row.commodity_slug}::${row.price_type}`
    const range = rangeByCommodityAndPriceType.get(key)
    if (!range) {
      rangeByCommodityAndPriceType.set(key, {
        low: row.min_price_vnd,
        high: row.max_price_vnd,
      })
    } else {
      range.low = Math.min(range.low, row.min_price_vnd)
      range.high = Math.max(range.high, row.max_price_vnd)
    }

    const dateKey = normalizeDateKey(row.date)
    const byDate = dailyByCommodityAndPriceType.get(key) ?? new Map()
    const aggregate = byDate.get(dateKey) ?? {
      weightedSum: 0,
      observationCount: 0,
      minPrice: row.min_price_vnd,
      maxPrice: row.max_price_vnd,
    }
    const weight = row.observation_count > 0 ? row.observation_count : 1

    aggregate.weightedSum += row.avg_price_vnd * weight
    aggregate.observationCount += weight
    aggregate.minPrice = Math.min(aggregate.minPrice, row.min_price_vnd)
    aggregate.maxPrice = Math.max(aggregate.maxPrice, row.max_price_vnd)

    byDate.set(dateKey, aggregate)
    dailyByCommodityAndPriceType.set(key, byDate)
  }

  return {
    rangeByCommodityAndPriceType,
    dailyByCommodityAndPriceType,
  }
}

function buildSparkline30d(
  dailyState?: Map<string, { weightedSum: number; observationCount: number; minPrice: number; maxPrice: number }>,
): CommoditySparkPoint[] {
  if (!dailyState || dailyState.size === 0) {
    return []
  }

  return [...dailyState.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .slice(-30)
    .map(([date, aggregate]) => ({
      date,
      priceAvg:
        aggregate.observationCount > 0
          ? roundNumber(aggregate.weightedSum / aggregate.observationCount)
          : roundNumber(aggregate.weightedSum),
    }))
}

function toSourceId(value: string): SourceSnapshot['id'] {
  return value in SOURCE_BASE_CONFIDENCE ? (value as SourceSnapshot['id']) : 'fallback'
}

function latestTimestamp(values: string[]) {
  return values.sort().at(-1) ?? new Date().toISOString()
}

function pickSourceLabel(snapshots: SourceSnapshot[]) {
  const labels = [...new Set(snapshots.map(snapshot => snapshot.label).filter(Boolean))]
  if (labels.length <= 1) {
    return labels[0] ?? snapshots[0]?.id ?? 'unknown'
  }

  const prefixes = labels.map(label => label.split(' - ')[0]?.trim()).filter((prefix): prefix is string => Boolean(prefix))
  const sharedPrefix = prefixes.length === labels.length && prefixes.every(prefix => prefix === prefixes[0])
    ? prefixes[0]
    : null

  return sharedPrefix ? `${sharedPrefix} - ${labels.length} crawlers` : `${snapshots[0]?.id ?? 'source'} - ${labels.length} crawlers`
}

function aggregateSourceSnapshots(sourceId: SourceSnapshot['id'], snapshots: SourceSnapshot[]): SourceSnapshot | null {
  if (snapshots.length === 0) {
    return null
  }

  if (snapshots.length === 1) {
    return snapshots[0]
  }

  const failedSnapshots = snapshots.filter(snapshot => !snapshot.success)
  const latestSnapshot = [...snapshots].sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0]
  const coverage = [...new Set(snapshots.flatMap(snapshot => snapshot.coverage))]
  const validationErrors = snapshots.flatMap(snapshot => snapshot.validationErrors ?? [])
  const hasAnyItems = snapshots.some(snapshot => snapshot.itemCount > 0)
  const fullFailure = failedSnapshots.length === snapshots.length || !hasAnyItems
  const errors = failedSnapshots
    .map(snapshot => `${snapshot.label}: ${snapshot.error ?? 'No rows parsed'}`)
    .filter(Boolean)

  return {
    id: sourceId,
    label: pickSourceLabel(snapshots),
    url: latestSnapshot.url,
    fetchedAt: latestTimestamp(snapshots.map(snapshot => snapshot.fetchedAt)),
    success: !fullFailure,
    itemCount: snapshots.reduce((sum, snapshot) => sum + snapshot.itemCount, 0),
    priority: Math.max(...snapshots.map(snapshot => snapshot.priority)),
    coverage,
    latestArticleUrl: latestSnapshot.latestArticleUrl,
    error: fullFailure && errors.length > 0 ? errors.join('; ') : undefined,
    droppedCount: snapshots.reduce((sum, snapshot) => sum + (snapshot.droppedCount ?? 0), 0),
    dedupCount: snapshots.reduce((sum, snapshot) => sum + (snapshot.dedupCount ?? 0), 0),
    validationErrors,
    metadata: {
      aggregatedSnapshotCount: snapshots.length,
      failedComponentCount: failedSnapshots.length,
      partialFailure: failedSnapshots.length > 0 && !fullFailure,
      componentStatuses: snapshots.map(snapshot => ({
        label: snapshot.label,
        success: snapshot.success,
        itemCount: snapshot.itemCount,
        coverage: snapshot.coverage,
        error: snapshot.error ?? null,
      })),
    },
  }
}

function getObservationSource(row: LatestObservationRow) {
  if (typeof row.source === 'string' && row.source.length > 0) {
    return row.source
  }

  if (typeof row.raw_payload?.source === 'string' && row.raw_payload.source.length > 0) {
    return row.raw_payload.source
  }

  return 'fallback'
}

function getObservationNormalizedUnitKey(row: LatestObservationRow): NormalizedUnitKey | null {
  return (
    normalizeUnitKey(row.raw_payload?.normalizedUnitKey) ??
    normalizeUnitKey(row.raw_payload?.unit) ??
    normalizeUnitKey(row.raw_payload?.unitRaw) ??
    normalizeUnitKey(row.unit) ??
    null
  )
}

function getObservationDisplayUnit(row: LatestObservationRow) {
  const rawDisplayUnit =
    typeof row.raw_payload?.unit === 'string' && row.raw_payload.unit.length > 0
      ? row.raw_payload.unit
      : typeof row.unit === 'string' && row.unit.includes('/')
        ? row.unit
        : null

  return getDisplayUnit(getObservationNormalizedUnitKey(row), rawDisplayUnit)
}

function getActiveSourceIds(rows: Array<{ source: string }>) {
  return [...new Set(rows.map(row => toSourceId(row.source)))]
}

function filterSourceSnapshotsForObservationRows(
  sourceSnapshots: SourceSnapshot[],
  observationRows: Array<{ source: string }>,
) {
  const activeSourceIds = new Set(getActiveSourceIds(observationRows))
  return sourceSnapshots.filter(snapshot => activeSourceIds.has(snapshot.id))
}

function buildPriceChainTrendLookup(rows: CommodityTrendRow[]) {
  const priorityByPriceType: Record<string, number> = {
    wholesale: 4,
    retail: 3,
    farm_gate: 2,
    export: 1,
  }
  const byCommodity = new Map<string, CommodityTrendRow>()

  for (const row of rows) {
    const current = byCommodity.get(row.commodity_slug)
    const currentPriority = current ? (priorityByPriceType[current.price_type] ?? 0) : -1
    const nextPriority = priorityByPriceType[row.price_type] ?? 0

    if (!current || nextPriority > currentPriority) {
      byCommodity.set(row.commodity_slug, row)
    }
  }

  return byCommodity
}

function preferDurianHeadlineObservationRows(rows: LatestObservationRow[]) {
  const premiumByPriceType = new Set<PriceType>()
  for (const row of rows) {
    if (row.commodity_slug !== DURIAN_COMMODITY_SLUG) {
      continue
    }

    const priceType = getObservationPriceType(row)
    if (isDurianHeadlineQualityGrade(row.quality_grade)) {
      premiumByPriceType.add(priceType)
    }
  }

  if (premiumByPriceType.size === 0) {
    return rows
  }

  return rows.filter(row => {
    if (row.commodity_slug !== DURIAN_COMMODITY_SLUG) {
      return true
    }

    const priceType = getObservationPriceType(row)
    if (!premiumByPriceType.has(priceType)) {
      return true
    }

    return isDurianHeadlineQualityGrade(row.quality_grade)
  })
}

function preferCoconutHeadlineObservationRows(rows: LatestObservationRow[]) {
  const preferredUnitCluster = selectPreferredCoconutUnitCluster(rows, row => ({
    commoditySlug: row.commodity_slug,
    sourceId: getObservationSource(row),
    recordedAt: row.recorded_at,
    displayUnit: getObservationDisplayUnit(row),
    normalizedUnitKey: getObservationNormalizedUnitKey(row),
  }))

  if (!preferredUnitCluster) {
    return rows
  }

  return rows.filter(row => {
    if (row.commodity_slug !== COCONUT_COMMODITY_SLUG) {
      return true
    }

    return getObservationNormalizedUnitKey(row) === preferredUnitCluster
  })
}

function preferCommodityHeadlineObservationRows(rows: LatestObservationRow[]) {
  return preferCoconutHeadlineObservationRows(preferDurianHeadlineObservationRows(rows))
}

function selectSummaryObservationRows(rows: LatestObservationRow[]) {
  if (rows.length === 0) {
    return rows
  }

  const preferredPriceType = SUMMARY_PRICE_TYPE_PREFERENCE[rows[0]?.commodity_slug ?? '']
  if (!preferredPriceType) {
    return rows
  }

  const preferredRows = rows.filter(row => getObservationPriceType(row) === preferredPriceType)
  return preferredRows.length > 0 ? preferredRows : rows
}

function buildVnResponseFromRows(
  observationRows: LatestObservationRow[],
  dailySummaryRows: DailySummaryRow[],
  trendRows: CommodityTrendRow[],
  sourceSnapshots: SourceSnapshot[],
): VnPricesResponse {
  const filteredObservationRows = preferCommodityHeadlineObservationRows(observationRows)
  const byCommodity = new Map<string, LatestObservationRow[]>()
  const activeSourceSnapshots = filterSourceSnapshotsForObservationRows(sourceSnapshots, filteredObservationRows)
  const sourcePriorityLookup = buildSourcePriorityLookup(activeSourceSnapshots)
  for (const row of filteredObservationRows) {
    const entries = byCommodity.get(row.commodity_slug) ?? []
    entries.push(row)
    byCommodity.set(row.commodity_slug, entries)
  }

  const { rangeByCommodity, dailyByCommodity } = buildHistoricalLookups(dailySummaryRows)
  const { rangeByCommodityAndPriceType, dailyByCommodityAndPriceType } = buildHistoricalLookupsByCommodityAndPriceType(
    dailySummaryRows,
  )
  const trendByCommodity = new Map(trendRows.map(row => [row.commodity_slug, row]))
  const latestSourceFetchedAt = activeSourceSnapshots.reduce(
    (latest, snapshot) => (snapshot.fetchedAt > latest ? snapshot.fetchedAt : latest),
    filteredObservationRows[0]?.recorded_at ?? new Date().toISOString(),
  )

  const summaries = [...byCommodity.entries()]
    .map(([commoditySlug, rows]) => {
      const summaryRows = selectSummaryObservationRows(rows)
      const summaryPriceType = getObservationPriceType(summaryRows[0] ?? rows[0])
      const historicalKey = `${commoditySlug}::${summaryPriceType}`
      const meta = VN_COMMODITY_META[commoditySlug] ?? {
        commodityName: summaryRows[0]?.raw_payload?.commodityName ?? rows[0].raw_payload?.commodityName ?? commoditySlug,
        category: summaryRows[0]?.raw_payload?.category ?? rows[0].raw_payload?.category ?? 'Khác',
        unit: summaryRows[0] ? getObservationDisplayUnit(summaryRows[0]) : getObservationDisplayUnit(rows[0]),
      }
      const regionSelections = pickSummaryRegionSelections(
        buildCanonicalRegionSelections(
          summaryRows.map(row => {
            const regionLabel = getRegionLabelFromObservation(
              row.province_code,
              row.variety,
              typeof row.raw_payload?.region === 'string' ? row.raw_payload.region : null,
            )
            const source = toSourceId(row.source)

            return createRankedRegionCandidate({
              region: regionLabel,
              price: row.price_vnd,
              change: typeof row.raw_payload?.change === 'number' ? row.raw_payload.change : null,
              changePct: typeof row.raw_payload?.changePct === 'number' ? row.raw_payload.changePct : null,
              source,
              timestamp: row.recorded_at,
              sourcePriority: sourcePriorityLookup.get(source),
            })
          }),
        ),
      )
      const summaryCandidates = regionSelections.map(selection => selection.primary)
      const prices = summaryCandidates.map(candidate => candidate.price)
      const fallbackPriceAvg = roundNumber(prices.reduce((sum, price) => sum + price, 0) / prices.length)
      const latestDate = summaryRows.reduce(
        (latest, row) => (row.recorded_at > latest ? row.recorded_at : latest),
        summaryRows[0]?.recorded_at ?? rows[0].recorded_at,
      )
      const currentDateKey = normalizeDateKey(latestDate)
      const dailyState = dailyByCommodityAndPriceType.get(historicalKey) ?? dailyByCommodity.get(commoditySlug)
      const currentDaily = dailyState?.get(currentDateKey)
      const previousDateKey = dailyState
        ? [...dailyState.keys()].filter(dateKey => dateKey < currentDateKey).sort().at(-1)
        : undefined
      const previousDaily = previousDateKey ? dailyState?.get(previousDateKey) : undefined
      const trend = trendByCommodity.get(commoditySlug)
      const priceAvg = fallbackPriceAvg
      const previousAvg =
        previousDaily && previousDaily.observationCount > 0
          ? roundNumber(previousDaily.weightedSum / previousDaily.observationCount)
          : trend?.avg_30d && trend.avg_30d > 0
            ? roundNumber(trend.avg_30d)
            : null
      const change = previousAvg && previousAvg > 0 ? roundNumber(priceAvg - previousAvg) : 0
      const changePct =
        previousAvg && previousAvg > 0
          ? roundNumber((change / previousAvg) * 100)
          : typeof trend?.trend_7d_pct === 'number'
            ? roundNumber(trend.trend_7d_pct)
            : 0
      const recommendationBasis =
        typeof trend?.trend_7d_pct === 'number' && Number.isFinite(trend.trend_7d_pct)
          ? trend.trend_7d_pct
          : changePct
      const historicalRange = rangeByCommodityAndPriceType.get(historicalKey) ?? rangeByCommodity.get(commoditySlug)
      const regions = toRegionPrices(regionSelections)
      const sparkline30d = buildSparkline30d(dailyState)
      const trend7dPct =
        typeof trend?.trend_7d_pct === 'number' && Number.isFinite(trend.trend_7d_pct)
          ? roundTrendNumber(trend.trend_7d_pct)
          : null

      return {
        commodity: commoditySlug,
        commodityName: meta.commodityName,
        category: meta.category,
        unit: summaryRows[0] ? getObservationDisplayUnit(summaryRows[0]) : meta.unit,
        priceHigh: Math.max(...prices),
        priceLow: Math.min(...prices),
        priceAvg,
        change,
        changePct,
        low52w: historicalRange?.low ?? (currentDaily?.minPrice ?? Math.min(...prices)),
        high52w: historicalRange?.high ?? (currentDaily?.maxPrice ?? Math.max(...prices)),
        regions,
        sources: [...new Set(summaryRows.map(row => toSourceId(row.source)))],
        recommendation: getRecommendation(recommendationBasis),
        trend7dPct,
        trendDirection: getTrendDirection(trend7dPct),
        sparkline30d,
        lastUpdated: latestDate,
      }
    })
    .sort((a, b) => b.priceAvg - a.priceAvg)

  return {
    status: 'live',
    fetchedAt: new Date().toISOString(),
    lastUpdated: latestSourceFetchedAt,
    data: summaries,
    sources: activeSourceSnapshots,
    errors: [],
  }
}

function buildFallbackPriceChainResponse(error: string): VnPriceChainResponse {
  return {
    status: 'fallback',
    lastUpdated: new Date().toISOString(),
    sources: [],
    errors: [error],
    data: [],
  }
}

function getObservationPriceType(row: LatestObservationRow): PriceType {
  const value = row.price_type ?? row.market_type ?? null
  if (value === 'farm_gate' || value === 'wholesale' || value === 'retail' || value === 'export') {
    return value
  }

  const rawValue = row.raw_payload?.priceType
  if (rawValue === 'farm_gate' || rawValue === 'wholesale' || rawValue === 'retail' || rawValue === 'export') {
    return rawValue
  }

  return 'wholesale'
}

function dedupeObservationRows(rows: LatestObservationRow[]) {
  const sortedRows = [...rows].sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
  const bySignature = new Map<string, LatestObservationRow>()

  for (const row of sortedRows) {
    const priceType = getObservationPriceType(row)
    const explicitDedupeKey =
      typeof row.raw_payload?.dedupeKey === 'string' && row.raw_payload.dedupeKey.length > 0
        ? row.raw_payload.dedupeKey
        : null
    const provinceCode =
      row.province_code ??
      (typeof row.raw_payload?.provinceCode === 'string' && row.raw_payload.provinceCode.length > 0
        ? row.raw_payload.provinceCode
        : '')
    const marketName =
      typeof row.raw_payload?.marketName === 'string' && row.raw_payload.marketName.length > 0
        ? row.raw_payload.marketName
        : ''
    const articleTitle =
      typeof row.raw_payload?.articleTitle === 'string' && row.raw_payload.articleTitle.length > 0
        ? row.raw_payload.articleTitle
        : ''
    const signature = explicitDedupeKey
      ? `${getObservationSource(row)}::${priceType}::${getObservationDisplayUnit(row)}::${getObservationNormalizedUnitKey(row) ?? ''}::${explicitDedupeKey}`
      : [
          getObservationSource(row),
          row.commodity_slug,
          priceType,
          provinceCode,
          row.variety ?? '',
          row.quality_grade ?? '',
          getObservationDisplayUnit(row),
          getObservationNormalizedUnitKey(row) ?? '',
          typeof row.raw_payload?.unitQuantity === 'number' ? row.raw_payload.unitQuantity : '',
          marketName,
          articleTitle,
          row.price_vnd,
        ].join('::')

    if (!bySignature.has(signature)) {
      bySignature.set(signature, row)
    }
  }

  return [...bySignature.values()]
}

function buildPriceChainResponseFromObservationRows(
  observationRows: LatestObservationRow[],
  trendRows: CommodityTrendRow[],
  sourceSnapshots: SourceSnapshot[],
  worldRows: LatestWorldPriceRow[],
): VnPriceChainResponse {
  const byCommodity = new Map<string, LatestObservationRow[]>()
  const trendByCommodity = buildPriceChainTrendLookup(trendRows)
  const worldByCommodity = new Map(worldRows.map(row => [row.commodity_slug, row]))

  for (const row of observationRows) {
    const entries = byCommodity.get(row.commodity_slug) ?? []
    entries.push(row)
    byCommodity.set(row.commodity_slug, entries)
  }

  const data = [...byCommodity.entries()]
    .map(([commoditySlug, rows]) => {
      const curatedRows = preferCommodityHeadlineObservationRows(rows)
      const meta = VN_COMMODITY_META[commoditySlug] ?? {
        commodityName: curatedRows[0]?.raw_payload?.commodityName ?? rows[0]?.raw_payload?.commodityName ?? commoditySlug,
        category: curatedRows[0]?.raw_payload?.category ?? rows[0]?.raw_payload?.category ?? 'Khác',
        unit: curatedRows[0] ? getObservationDisplayUnit(curatedRows[0]) : 'VND/kg',
      }
      const rowsByType = new Map<PriceType, LatestObservationRow[]>()
      for (const row of curatedRows) {
        const priceType = getObservationPriceType(row)
        const entries = rowsByType.get(priceType) ?? []
        entries.push(row)
        rowsByType.set(priceType, entries)
      }

      const getAveragePrice = (priceType: PriceType) => {
        const entries = rowsByType.get(priceType) ?? []
        if (entries.length === 0) {
          return null
        }

        return roundNumber(entries.reduce((sum, entry) => sum + entry.price_vnd, 0) / entries.length)
      }

      const farmGateVnd = getAveragePrice('farm_gate')
      const wholesaleVnd = getAveragePrice('wholesale')
      const retailVnd = getAveragePrice('retail')
      const exportVnd = getAveragePrice('export')
      const exportEntries = rowsByType.get('export') ?? []
      const exportUsd =
        exportEntries.length > 0
          ? roundNumber(
              exportEntries.reduce((sum, entry) => sum + (entry.price_usd ?? entry.price_vnd / USD_VND_RATE), 0) /
                exportEntries.length,
            )
          : null
      const retailRows = rowsByType.get('retail') ?? []
      const nationalRetailAvg =
        retailRows.length > 0
          ? retailRows.reduce((sum, row) => sum + row.price_vnd, 0) / retailRows.length
          : null
      const retailRegions = retailRows
        .reduce<Map<string, { provinceCode: string; prices: number[] }>>((acc, row) => {
          if (!row.province_code) {
            return acc
          }

          const existing = acc.get(row.province_code) ?? {
            provinceCode: row.province_code,
            prices: [],
          }
          existing.prices.push(row.price_vnd)
          acc.set(row.province_code, existing)
          return acc
        }, new Map())
      const retailRegionList = [...retailRegions.values()]
        .map(region => {
          const avgPrice = roundNumber(region.prices.reduce((sum, price) => sum + price, 0) / region.prices.length)
          return {
            provinceCode: region.provinceCode,
            region: getRegionLabelFromObservation(region.provinceCode, null, null),
            avgPrice,
            vsNationalAvgPct:
              nationalRetailAvg && nationalRetailAvg > 0 ? roundNumber((avgPrice / nationalRetailAvg - 1) * 100) : null,
            dataPoints: region.prices.length,
          } satisfies PriceChainRetailRegion
        })
        .sort((left, right) => right.avgPrice - left.avgPrice)
      const trend = trendByCommodity.get(commoditySlug)
      const world = worldByCommodity.get(commoditySlug)
      const updatedAt = curatedRows.reduce(
        (latest, row) => (row.recorded_at > latest ? row.recorded_at : latest),
        curatedRows[0]?.recorded_at ?? rows[0]?.recorded_at ?? new Date().toISOString(),
      )

      return {
        commodity: commoditySlug,
        commodityName: meta.commodityName,
        category: meta.category,
        unit: curatedRows[0] ? getObservationDisplayUnit(curatedRows[0]) : meta.unit,
        farmGateVnd,
        wholesaleVnd,
        retailVnd,
        exportVnd,
        exportUsd,
        worldUsdKg: typeof world?.price_vnd_kg === 'number' ? roundNumber(world.price_vnd_kg / USD_VND_RATE) : null,
        worldExchange: world?.exchange ?? null,
        retailVsFarmgatePct:
          farmGateVnd && retailVnd ? roundNumber(((retailVnd - farmGateVnd) / farmGateVnd) * 100) : null,
        exportVsFarmgatePct:
          farmGateVnd && exportVnd ? roundNumber(((exportVnd - farmGateVnd) / farmGateVnd) * 100) : null,
        trend7dPct: trend?.trend_7d_pct ?? null,
        updatedAt,
        retailRegions: retailRegionList,
      } satisfies PriceChainItem
    })
    .sort((left, right) => {
      const leftScore = left.retailVnd ?? left.wholesaleVnd ?? left.farmGateVnd ?? 0
      const rightScore = right.retailVnd ?? right.wholesaleVnd ?? right.farmGateVnd ?? 0
      return rightScore - leftScore
    })

  const lastUpdated = data.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    observationRows[0]?.recorded_at ?? new Date().toISOString(),
  )

  return {
    status: 'live',
    lastUpdated,
    sources: sourceSnapshots,
    errors: [],
    data,
  }
}

function buildUnsupportedPriceTypeResponse(priceTypes: PriceType[]): VnPricesResponse {
  return {
    status: 'fallback',
    fetchedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    data: [],
    sources: [],
    errors: [`Custom price type query (${priceTypes.join(',')}) requires Supabase curated data`],
  }
}

async function buildVnResponseFromSupabase(priceTypes: PriceType[]) {
  const observationRows = priceTypes.includes('export')
    ? selectLatestObservationRows((await getRecentObservationRows(priceTypes, EXPORT_OBSERVATION_LOOKBACK_DAYS)) ?? [])
    : await getLatestObservationRows(priceTypes)
  if (!observationRows || observationRows.length === 0) {
    return null
  }

  const [dailySummaryRows, sourceSnapshots, trendRows] = await Promise.all([
    getDailySummaryRows(priceTypes),
    getLatestSourceSnapshots(),
    getCommodityTrendRows(priceTypes),
  ])

  return buildVnResponseFromRows(observationRows, dailySummaryRows ?? [], trendRows ?? [], sourceSnapshots)
}

async function buildPriceChainResponseFromSupabase() {
  const [trendRows, observationRows, worldRows] = await Promise.all([
    getAllCommodityTrendRows(),
    getRecentObservationRows(['farm_gate', 'wholesale', 'retail', 'export']),
    getLatestWorldRows(),
  ])

  if (!observationRows || observationRows.length === 0) {
    return null
  }

  const dedupedObservationRows = dedupeObservationRows(observationRows)
  const sourceIds = getActiveSourceIds(
    dedupedObservationRows.map(row => ({
      source: getObservationSource(row),
    })),
  )
  const sourceSnapshots = await getLatestSourceSnapshots(sourceIds)

  return buildPriceChainResponseFromObservationRows(
    dedupedObservationRows,
    trendRows ?? [],
    sourceSnapshots,
    worldRows ?? [],
  )
}

async function syncVnPricesToSupabase() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return false
  }

  const commodityLookup = await loadCommodityLookup(client)
  if (!commodityLookup) {
    return false
  }

  const live = await fetchLiveDayData()

  if (!live.dayData) {
    for (const message of live.errors) {
      await recordIngestionError(
        client,
        {
          source: 'fallback',
          sourceUrl: null,
          crawledAt: new Date().toISOString(),
          raw: {
            commodity: 'crawler-error',
            commodityName: 'Crawler Error',
            category: 'system',
            region: 'system',
            price: 0,
            unit: 'VND/kg',
            change: null,
            changePct: null,
            timestamp: new Date().toISOString(),
            source: 'fallback',
            previousPrice: null,
          },
        },
        'schema_invalid',
        message,
      )
    }
    return false
  }

  if (isRedisQueueConfigured()) {
    await enqueueDayData(live.dayData)

    if (shouldProcessInline()) {
      while (true) {
        const batch = await processQueuedBatch(25)
        if (batch.processedCount === 0) {
          break
        }
      }
    }
  } else {
    for (const item of live.dayData.items) {
      await processIngestionMessage(client, commodityLookup, buildQueueMessage(item, live.dayData.sources))
    }
  }

  await persistSourceSnapshots(live.dayData.sources)
  await refreshCuratedViews()
  return true
}

function convertWorldPriceToVndKg(item: WorldCommodityItem, factor?: number | null) {
  const usdKg = convertWorldPriceToUsdKg(item.priceCurrent, item.unit, factor)
  return roundNumber(usdKg * USD_VND_RATE)
}

function isDailyWorldPriceItem(item: Pick<WorldPriceProviderItem, 'dataGranularity'>) {
  return item.dataGranularity === 'daily'
}

function buildWorldPriceRawPayload(item: WorldPriceProviderItem) {
  const canonicalMeta = getWorldCommodityDisplayMeta(item.id)

  return {
    ...item,
    name: canonicalMeta?.name ?? item.name,
    nameEn: canonicalMeta?.nameEn ?? item.nameEn,
    symbol: canonicalMeta?.symbol ?? item.symbol,
    category: canonicalMeta?.category ?? item.category,
    observedOn: item.observedOn,
    crawlRecordedAt: item.crawlRecordedAt,
    dataGranularity: item.dataGranularity,
    temporalCoverage: item.temporalCoverage,
    benchmarkType: item.benchmarkType,
    sourceId: item.sourceId,
    sourceLicenseNote: item.sourceLicenseNote,
    qualityGrade: item.qualityGrade,
    contractSymbol: item.contractSymbol,
    sourceObservationLabel: item.sourceObservationLabel,
    isDailySignal: isDailyWorldPriceItem(item),
  }
}

async function syncWorldPricesToSupabase(
  forceRefresh: boolean,
  context?: WorldPriceSyncContext,
) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return false
  }

  const runId = await startWorldPriceSyncRun(forceRefresh, resolveWorldSyncTrigger(context))
  let itemCount = 0
  let upsertCount = 0
  let providerErrors: string[] = []
  const skippedCommoditySlugs = new Set<string>()

  try {
    const commodityLookup = await loadCommodityLookup(client)
    const commodityWorldLookup = await loadCommodityWorldLookup()

    const providerResult = await fetchWorldPriceProviderItems(forceRefresh)
    const { items, errors } = providerResult
    itemCount = items.length
    providerErrors = errors

    if (errors.length > 0) {
      console.warn('[World Prices] Provider errors:', errors.join('; '))
    }

    const rows = items
      .map(item => {
        const commodityId = commodityLookup.get(item.id)
        const commodityMeta = commodityWorldLookup?.get(item.id)
        if (!commodityId || !commodityMeta) {
          skippedCommoditySlugs.add(item.id)
          return null
        }

        const priceUsdKg = convertWorldPriceToUsdKg(item.priceCurrent, item.unit, commodityMeta.world_to_kg_factor)
        const change1wPct =
          item.priceLastWeek > 0 && isDailyWorldPriceItem(item)
            ? roundNumber(((item.priceCurrent - item.priceLastWeek) / item.priceLastWeek) * 100)
            : null

        return {
          recorded_at: item.crawlRecordedAt,
          observed_on: item.observedOn,
          crawl_recorded_at: item.crawlRecordedAt,
          commodity_id: commodityId,
          commodity_slug: item.id,
          exchange: item.exchange,
          contract_month: null,
          contract_symbol: item.contractSymbol,
          price_raw: item.priceCurrent,
          price_unit_raw: item.unit,
          price_usd_kg: priceUsdKg,
          price_vnd_kg: convertWorldPriceToVndKg(item, commodityMeta.world_to_kg_factor),
          exchange_rate: USD_VND_RATE,
          change_1d: isDailyWorldPriceItem(item) ? item.change : null,
          change_1d_pct: isDailyWorldPriceItem(item) ? item.changePct : null,
          change_1w_pct: change1wPct,
          volume: null,
          open_interest: null,
          source_url: item.sourceUrl,
          data_granularity: item.dataGranularity,
          temporal_coverage: item.temporalCoverage,
          benchmark_type: item.benchmarkType,
          source_id: item.sourceId,
          source_license_note: item.sourceLicenseNote,
          quality_grade: item.qualityGrade,
          source_observation_label: item.sourceObservationLabel,
          raw_payload: buildWorldPriceRawPayload(item),
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    upsertCount = rows.length
    if (rows.length > 0) {
      const insertResponse = await client.from('world_prices').upsert(rows, {
        onConflict: 'source_id,commodity_slug,benchmark_type,observed_on,contract_symbol',
      })
      if (insertResponse.error) {
        throw insertResponse.error
      }
    }

    await finishWorldPriceSyncRun(runId, {
      status: providerErrors.length > 0 || skippedCommoditySlugs.size > 0 ? 'partial' : 'success',
      itemCount,
      upsertCount,
      providerErrors,
      metadata: {
        skippedCommodityCount: skippedCommoditySlugs.size,
        skippedCommoditySlugs: [...skippedCommoditySlugs],
      },
    })

    return true
  } catch (error) {
    await finishWorldPriceSyncRun(runId, {
      status: 'failed',
      itemCount,
      upsertCount,
      providerErrors,
      errorMessage: error instanceof Error ? error.message : 'Unknown world price sync error',
      metadata: {
        skippedCommodityCount: skippedCommoditySlugs.size,
        skippedCommoditySlugs: [...skippedCommoditySlugs],
      },
    })
    throw error
  }
}

async function getLatestWorldRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('latest_world_prices_public')
    .select(
      [
        'recorded_at',
        'observed_on',
        'crawl_recorded_at',
        'commodity_slug',
        'exchange',
        'price_usd',
        'price_unit',
        'price_vnd_kg',
        'change_1d',
        'change_1d_pct',
        'change_1w_pct',
        'data_granularity',
        'temporal_coverage',
        'benchmark_type',
        'source_id',
        'source_license_note',
        'quality_grade',
        'contract_symbol',
        'source_observation_label',
        'source_url',
        'raw_payload',
      ].join(', '),
    )
    .order('commodity_slug', { ascending: true })

  if (error) {
    throw error
  }

  return data as unknown as LatestWorldPriceRow[]
}

async function buildWorldResponseFromSupabase(): Promise<WorldPricesResponse | null> {
  const rows = await getLatestWorldRows()
  if (!rows || rows.length === 0) {
    return null
  }

  const data = rows.map(row => {
    const raw = row.raw_payload
    const canonicalMeta = getWorldCommodityDisplayMeta(row.commodity_slug)
    return {
      id: row.commodity_slug,
      name: canonicalMeta?.name ?? (typeof raw.name === 'string' ? raw.name : row.commodity_slug),
      nameEn: canonicalMeta?.nameEn ?? (typeof raw.nameEn === 'string' ? raw.nameEn : row.commodity_slug),
      symbol: canonicalMeta?.symbol ?? (typeof raw.symbol === 'string' ? raw.symbol : row.commodity_slug.toUpperCase()),
      category: canonicalMeta?.category ?? (typeof raw.category === 'string' ? raw.category : 'Khác'),
      exchange: row.exchange,
      unit: row.price_unit,
      priceCurrent: row.price_usd,
      priceYesterday: typeof raw.priceYesterday === 'number' ? raw.priceYesterday : row.price_usd,
      priceLastWeek: typeof raw.priceLastWeek === 'number' ? raw.priceLastWeek : row.price_usd,
      priceLastMonth: typeof raw.priceLastMonth === 'number' ? raw.priceLastMonth : row.price_usd,
      change: typeof row.change_1d === 'number' ? row.change_1d : typeof raw.change === 'number' ? raw.change : 0,
      changePct:
        typeof row.change_1d_pct === 'number' ? row.change_1d_pct : typeof raw.changePct === 'number' ? raw.changePct : 0,
      low52w: typeof raw.low52w === 'number' ? raw.low52w : row.price_usd,
      high52w: typeof raw.high52w === 'number' ? raw.high52w : row.price_usd,
      priceVndKg: row.price_vnd_kg,
      observedOn: row.observed_on ?? (typeof raw.observedOn === 'string' ? raw.observedOn : row.recorded_at.slice(0, 10)),
      crawlRecordedAt: row.crawl_recorded_at ?? row.recorded_at,
      dataGranularity:
        row.data_granularity ?? (typeof raw.dataGranularity === 'string' ? raw.dataGranularity : null),
      temporalCoverage:
        row.temporal_coverage ?? (typeof raw.temporalCoverage === 'string' ? raw.temporalCoverage : null),
      benchmarkType: row.benchmark_type ?? (typeof raw.benchmarkType === 'string' ? raw.benchmarkType : null),
      sourceId: row.source_id ?? (typeof raw.sourceId === 'string' ? raw.sourceId : null),
      sourceLicenseNote:
        row.source_license_note ?? (typeof raw.sourceLicenseNote === 'string' ? raw.sourceLicenseNote : null),
      qualityGrade: row.quality_grade ?? (typeof raw.qualityGrade === 'string' ? raw.qualityGrade : null),
      contractSymbol: row.contract_symbol ?? (typeof raw.contractSymbol === 'string' ? raw.contractSymbol : null),
      sourceObservationLabel:
        row.source_observation_label ??
        (typeof raw.sourceObservationLabel === 'string' ? raw.sourceObservationLabel : null),
      isDailySignal: (row.data_granularity ?? raw.dataGranularity) === 'daily',
      currency: 'USD' as const,
      lastUpdate: row.observed_on ? `${row.observed_on}T00:00:00.000Z` : row.recorded_at,
    }
  })
  const lastUpdated = rows.reduce(
    (latest, row) => (row.recorded_at > latest ? row.recorded_at : latest),
    rows[0]?.recorded_at ?? new Date().toISOString(),
  )

  return {
    success: true,
    status: 'live',
    sourceMode: 'supabase_curated',
    count: data.length,
    exchangeRate: USD_VND_RATE,
    categories: getCategories(),
    lastUpdated,
    data,
  }
}

export async function getVnPrices(forceRefresh = false, options?: VnPriceQueryOptions): Promise<VnPricesResponse> {
  const priceTypes = getRequestedPriceTypes(options)
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return isDefaultPriceTypeQuery(priceTypes)
      ? getLegacyVnPrices(forceRefresh)
      : buildUnsupportedPriceTypeResponse(priceTypes)
  }

  try {
    if (runtime.hasAdminConfig && forceRefresh) {
      await syncVnPricesToSupabase()
    }

    const dbResponse = await buildVnResponseFromSupabase(priceTypes)
    if (dbResponse) {
      return dbResponse
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase VN] Falling back to legacy service:', error)
    }
  }

  return isDefaultPriceTypeQuery(priceTypes)
    ? getLegacyVnPrices(forceRefresh)
    : buildUnsupportedPriceTypeResponse(priceTypes)
}

export async function getVnPriceSourceStatus() {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return getLegacyVnPriceSourceStatus()
  }

  try {
    const sourceSnapshots = await getLatestSourceSnapshots()
    if (sourceSnapshots.length > 0) {
      return sourceSnapshots
    }
  } catch (error) {
    console.error('[Supabase VN] Falling back to legacy source status:', error)
  }

  return getLegacyVnPriceSourceStatus()
}

export function getVnPricesHistory(date: string) {
  return getLegacyVnPricesHistory(date)
}

export async function getVnPriceChainResponse(): Promise<VnPriceChainResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackPriceChainResponse('VN price chain requires Supabase curated data')
  }

  try {
    const dbResponse = await buildPriceChainResponseFromSupabase()
    if (dbResponse) {
      return dbResponse
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase VN] Falling back to price-chain fallback:', error)
    }
  }

  return buildFallbackPriceChainResponse('VN price chain data is unavailable')
}

function buildFallbackWorldCoffeeBenchmarkResponse(message: string): WorldCoffeeBenchmarkResponse {
  return {
    success: true,
    status: 'fallback',
    lastUpdated: new Date().toISOString(),
    dailyCount: 0,
    monthlyCount: 0,
    daily: [],
    monthly: [],
    errors: [message],
  }
}

function buildFallbackCoffeePriceStackResponse(message: string): CoffeePriceStackResponse {
  return {
    success: true,
    status: 'fallback',
    lastUpdated: new Date().toISOString(),
    count: 0,
    data: [],
    errors: [message],
  }
}

function buildFallbackCoffeeCompetitorBenchmarkResponse(message: string): CoffeeCompetitorBenchmarkResponse {
  return {
    success: true,
    status: 'fallback',
    lastUpdated: new Date().toISOString(),
    count: 0,
    data: [],
    errors: [message],
  }
}

function buildFallbackCoffeeCompetitorBenchmarkSummaryResponse(message: string): CoffeeCompetitorBenchmarkSummaryResponse {
  return {
    success: true,
    status: 'fallback',
    lastUpdated: new Date().toISOString(),
    count: 0,
    data: [],
    errors: [message],
  }
}

function toWorldCoffeeBenchmarkDailyItem(row: WorldCoffeeBenchmarkDailyRow): WorldCoffeeBenchmarkDailyItem {
  return {
    priceDate: row.price_date,
    commodityGroup: row.commodity_group,
    benchmarkName: row.benchmark_name,
    benchmarkType: row.benchmark_type,
    contractCode: row.contract_code,
    contractMonth: row.contract_month,
    priceValue: toNumberOrNull(row.price_value),
    currency: row.currency,
    unit: row.unit,
    priceUsdPerTon: toNumberOrNull(row.price_usd_per_ton),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
    confidenceScore: toNumberOrNull(row.confidence_score),
    dataQualityFlag: row.data_quality_flag,
    notes: row.notes,
  }
}

function toWorldCoffeeBenchmarkMonthlyItem(row: WorldCoffeeBenchmarkMonthlyRow): WorldCoffeeBenchmarkMonthlyItem {
  const observations = toNumberOrNull(row.observations)

  return {
    monthStart: row.month_start,
    periodLabel: row.period_label,
    benchmarkName: row.benchmark_name,
    benchmarkType: row.benchmark_type,
    avgPriceUsdPerTon: toNumberOrNull(row.avg_price_usd_per_ton),
    minPriceUsdPerTon: toNumberOrNull(row.min_price_usd_per_ton),
    maxPriceUsdPerTon: toNumberOrNull(row.max_price_usd_per_ton),
    observations: observations === null ? 0 : Math.max(0, Math.trunc(observations)),
    minConfidenceScore: toNumberOrNull(row.min_confidence_score),
    fetchedAt: row.fetched_at,
  }
}

function toCoffeePriceStackItem(row: CoffeePriceStackRow): CoffeePriceStackItem {
  return {
    periodLabel: row.period_label,
    avgExportUnitValueUsdPerTon: toNumberOrNull(row.avg_export_unit_value_usd_per_ton),
    avgDomesticPriceUsdPerTon: toNumberOrNull(row.avg_domestic_price_usd_per_ton),
    avgDomesticPriceVndPerKg: toNumberOrNull(row.avg_domestic_price_vnd_per_kg),
    benchmarkName: row.benchmark_name,
    benchmarkType: row.benchmark_type,
    avgWorldBenchmarkUsdPerTon: toNumberOrNull(row.avg_world_benchmark_usd_per_ton),
    exportVsBenchmarkGapUsdPerTon: toNumberOrNull(row.export_vs_benchmark_gap_usd_per_ton),
    exportVsBenchmarkGapPct: toNumberOrNull(row.export_vs_benchmark_gap_pct),
    domesticVsBenchmarkGapUsdPerTon: toNumberOrNull(row.domestic_vs_benchmark_gap_usd_per_ton),
    domesticVsBenchmarkGapPct: toNumberOrNull(row.domestic_vs_benchmark_gap_pct),
    interpretationNote: row.interpretation_note,
  }
}

function toNonNegativeInteger(value: number | string | null | undefined) {
  const numeric = toNumberOrNull(value)
  return numeric === null ? 0 : Math.max(0, Math.trunc(numeric))
}

function toCoffeeCompetitorBenchmarkItem(row: CoffeeCompetitorBenchmarkRow): CoffeeCompetitorBenchmarkItem {
  return {
    periodType: row.period_type,
    periodStart: row.period_start,
    periodLabel: row.period_label,
    partnerCountry: row.partner_country,
    partnerIso: row.partner_iso,
    vietnamUnitValueUsdPerTon: toNumberOrNull(row.vietnam_unit_value_usd_per_ton),
    brazilUnitValueUsdPerTon: toNumberOrNull(row.brazil_unit_value_usd_per_ton),
    indonesiaUnitValueUsdPerTon: toNumberOrNull(row.indonesia_unit_value_usd_per_ton),
    vietnamValueUsd: toNumberOrNull(row.vietnam_value_usd),
    brazilValueUsd: toNumberOrNull(row.brazil_value_usd),
    indonesiaValueUsd: toNumberOrNull(row.indonesia_value_usd),
    vietnamQuantityTon: toNumberOrNull(row.vietnam_quantity_ton),
    brazilQuantityTon: toNumberOrNull(row.brazil_quantity_ton),
    indonesiaQuantityTon: toNumberOrNull(row.indonesia_quantity_ton),
    vietnamUnitValueFlag: row.vietnam_unit_value_flag,
    brazilUnitValueFlag: row.brazil_unit_value_flag,
    indonesiaUnitValueFlag: row.indonesia_unit_value_flag,
    minConfidenceScore: toNumberOrNull(row.min_confidence_score),
    vietnamVsBrazilGapPct: toNumberOrNull(row.vietnam_vs_brazil_gap_pct),
    vietnamVsIndonesiaGapPct: toNumberOrNull(row.vietnam_vs_indonesia_gap_pct),
    benchmarkQualityFlag: row.benchmark_quality_flag,
    interpretationNote: row.interpretation_note,
  }
}

function toCoffeeCompetitorBenchmarkSummaryItem(
  row: CoffeeCompetitorBenchmarkSummaryRow,
): CoffeeCompetitorBenchmarkSummaryItem {
  return {
    periodType: row.period_type,
    periodLabel: row.period_label,
    periodStart: row.period_start,
    vietnamMarkets: toNonNegativeInteger(row.vietnam_markets),
    marketsWithBrazil: toNonNegativeInteger(row.markets_with_brazil),
    marketsWithIndonesia: toNonNegativeInteger(row.markets_with_indonesia),
    okBenchmarkMarkets: toNonNegativeInteger(row.ok_benchmark_markets),
    avgVietnamVsBrazilGapPct: toNumberOrNull(row.avg_vietnam_vs_brazil_gap_pct),
    avgVietnamVsIndonesiaGapPct: toNumberOrNull(row.avg_vietnam_vs_indonesia_gap_pct),
    marketsVietnamPremiumVsBrazil: toNonNegativeInteger(row.markets_vietnam_premium_vs_brazil),
    marketsVietnamDiscountVsBrazil: toNonNegativeInteger(row.markets_vietnam_discount_vs_brazil),
    interpretationNote: row.interpretation_note,
  }
}

async function getWorldCoffeeBenchmarkDailyRows(limit: number): Promise<WorldCoffeeBenchmarkDailyRow[] | null> {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('vw_world_coffee_benchmark_daily')
    .select(
      [
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
        'confidence_score',
        'data_quality_flag',
        'notes',
      ].join(', '),
    )
    .limit(limit)
    .order('price_date', { ascending: false })
    .order('benchmark_name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as WorldCoffeeBenchmarkDailyRow[]
}

async function getWorldCoffeeBenchmarkMonthlyRows(limit: number): Promise<WorldCoffeeBenchmarkMonthlyRow[] | null> {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('vw_world_coffee_benchmark_monthly')
    .select(
      [
        'month_start',
        'period_label',
        'benchmark_name',
        'benchmark_type',
        'avg_price_usd_per_ton',
        'min_price_usd_per_ton',
        'max_price_usd_per_ton',
        'observations',
        'min_confidence_score',
        'fetched_at',
      ].join(', '),
    )
    .limit(limit)
    .order('month_start', { ascending: false })
    .order('benchmark_name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as WorldCoffeeBenchmarkMonthlyRow[]
}

async function getCoffeePriceStackRows(limit: number): Promise<CoffeePriceStackRow[] | null> {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('vw_coffee_price_stack')
    .select(
      [
        'period_label',
        'avg_export_unit_value_usd_per_ton',
        'avg_domestic_price_usd_per_ton',
        'avg_domestic_price_vnd_per_kg',
        'benchmark_name',
        'benchmark_type',
        'avg_world_benchmark_usd_per_ton',
        'export_vs_benchmark_gap_usd_per_ton',
        'export_vs_benchmark_gap_pct',
        'domestic_vs_benchmark_gap_usd_per_ton',
        'domestic_vs_benchmark_gap_pct',
        'interpretation_note',
      ].join(', '),
    )
    .limit(limit)
    .order('period_label', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as CoffeePriceStackRow[]
}

async function getCoffeeCompetitorBenchmarkRows(options: {
  limit: number
  periodLabel?: string
  qualityFlag?: string
}): Promise<CoffeeCompetitorBenchmarkRow[] | null> {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  let query = client
    .from('vw_coffee_competitor_benchmark_by_market')
    .select(
      [
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
      ].join(', '),
    )
    .limit(options.limit)
    .order('period_start', { ascending: false })
    .order('vietnam_value_usd', { ascending: false, nullsFirst: false })

  if (options.periodLabel) {
    query = query.eq('period_label', options.periodLabel)
  }
  if (options.qualityFlag) {
    query = query.eq('benchmark_quality_flag', options.qualityFlag)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data ?? []) as unknown as CoffeeCompetitorBenchmarkRow[]
}

async function getCoffeeCompetitorBenchmarkSummaryRows(limit: number): Promise<CoffeeCompetitorBenchmarkSummaryRow[] | null> {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('vw_coffee_competitor_benchmark_summary_by_period')
    .select(
      [
        'period_type',
        'period_label',
        'period_start',
        'vietnam_markets',
        'markets_with_brazil',
        'markets_with_indonesia',
        'ok_benchmark_markets',
        'avg_vietnam_vs_brazil_gap_pct',
        'avg_vietnam_vs_indonesia_gap_pct',
        'markets_vietnam_premium_vs_brazil',
        'markets_vietnam_discount_vs_brazil',
        'interpretation_note',
      ].join(', '),
    )
    .limit(limit)
    .order('period_start', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as CoffeeCompetitorBenchmarkSummaryRow[]
}

export async function getWorldCoffeeBenchmarkResponse(options?: {
  dailyLimit?: number
  monthlyLimit?: number
}): Promise<WorldCoffeeBenchmarkResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackWorldCoffeeBenchmarkResponse('World coffee benchmark requires Supabase curated data')
  }

  const dailyLimit = Math.max(1, Math.min(options?.dailyLimit ?? 120, 500))
  const monthlyLimit = Math.max(1, Math.min(options?.monthlyLimit ?? 240, 500))

  try {
    const [dailyRows, monthlyRows] = await Promise.all([
      getWorldCoffeeBenchmarkDailyRows(dailyLimit),
      getWorldCoffeeBenchmarkMonthlyRows(monthlyLimit),
    ])
    const daily = (dailyRows ?? []).map(toWorldCoffeeBenchmarkDailyItem)
    const monthly = (monthlyRows ?? []).map(toWorldCoffeeBenchmarkMonthlyItem)

    const lastUpdated = [daily[0]?.fetchedAt, monthly[0]?.fetchedAt]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort()
      .at(-1) ?? new Date().toISOString()

    return {
      success: true,
      status: 'live',
      lastUpdated,
      dailyCount: daily.length,
      monthlyCount: monthly.length,
      daily,
      monthly,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase World Benchmark] Falling back to empty payload:', error)
    }
    return buildFallbackWorldCoffeeBenchmarkResponse('World coffee benchmark data is unavailable')
  }
}

export async function getCoffeePriceStackResponse(limit = 180): Promise<CoffeePriceStackResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackCoffeePriceStackResponse('Coffee price stack requires Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(limit, 500))

  try {
    const rows = await getCoffeePriceStackRows(rowLimit)
    const data = (rows ?? []).map(toCoffeePriceStackItem)
    const lastUpdated = new Date().toISOString()

    return {
      success: true,
      status: 'live',
      lastUpdated,
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Coffee Stack] Falling back to empty payload:', error)
    }
    return buildFallbackCoffeePriceStackResponse('Coffee price stack data is unavailable')
  }
}

export async function getCoffeeCompetitorBenchmarkResponse(options?: {
  limit?: number
  periodLabel?: string
  qualityFlag?: string
}): Promise<CoffeeCompetitorBenchmarkResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackCoffeeCompetitorBenchmarkResponse('Coffee competitor benchmark requires Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(options?.limit ?? 200, 500))

  try {
    const rows = await getCoffeeCompetitorBenchmarkRows({
      limit: rowLimit,
      periodLabel: options?.periodLabel,
      qualityFlag: options?.qualityFlag,
    })
    const data = (rows ?? []).map(toCoffeeCompetitorBenchmarkItem)
    const lastUpdated = data.map(row => row.periodStart).sort().at(-1) ?? new Date().toISOString()

    return {
      success: true,
      status: 'live',
      lastUpdated,
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Competitor Coffee Benchmark] Falling back to empty payload:', error)
    }
    return buildFallbackCoffeeCompetitorBenchmarkResponse('Coffee competitor benchmark data is unavailable')
  }
}

export async function getCoffeeCompetitorBenchmarkSummaryResponse(limit = 20): Promise<CoffeeCompetitorBenchmarkSummaryResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return buildFallbackCoffeeCompetitorBenchmarkSummaryResponse('Coffee competitor benchmark summary requires Supabase curated data')
  }

  const rowLimit = Math.max(1, Math.min(limit, 100))

  try {
    const rows = await getCoffeeCompetitorBenchmarkSummaryRows(rowLimit)
    const data = (rows ?? []).map(toCoffeeCompetitorBenchmarkSummaryItem)
    const lastUpdated = data[0]?.periodStart ?? new Date().toISOString()

    return {
      success: true,
      status: 'live',
      lastUpdated,
      count: data.length,
      data,
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase Competitor Coffee Benchmark] Falling back to empty summary payload:', error)
    }
    return buildFallbackCoffeeCompetitorBenchmarkSummaryResponse('Coffee competitor benchmark summary data is unavailable')
  }
}

export async function getWorldPriceSyncRuns(limit = 20): Promise<WorldPriceSyncRunRecord[]> {
  const client = getSupabaseAdminClient() ?? getSupabaseReadClient()
  if (!client) {
    return []
  }

  const { data, error } = await client
    .from('world_price_sync_runs')
    .select(
      'id, started_at, finished_at, status, force_refresh, trigger, item_count, upsert_count, provider_error_count, provider_errors, error_message, metadata',
    )
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)))

  if (error) {
    if (isWorldSyncLogTableMissing(error)) {
      return []
    }
    throw error
  }

  return ((data ?? []) as WorldPriceSyncRunRow[]).map(toWorldPriceSyncRunRecord)
}

export async function getWorldPricesResponse(
  forceRefresh = false,
  context?: WorldPriceSyncContext,
): Promise<WorldPricesResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    const data = await getLegacyWorldPrices(forceRefresh)
    const lastUpdated = data.reduce(
      (latest, item) => (item.lastUpdate > latest ? item.lastUpdate : latest),
      data[0]?.lastUpdate ?? new Date().toISOString(),
    )
    return {
      success: true,
      status: 'fallback',
      sourceMode: 'legacy',
      count: data.length,
      exchangeRate: USD_VND_RATE,
      categories: getCategories(),
      lastUpdated,
      data,
    }
  }

  try {
    if (runtime.hasAdminConfig && forceRefresh) {
      await syncWorldPricesToSupabase(forceRefresh, context)
    }

    const dbResponse = await buildWorldResponseFromSupabase()
    if (dbResponse) {
      return dbResponse
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase World] Falling back to legacy service:', error)
    }
  }

  const data = await getLegacyWorldPrices(forceRefresh)
  const lastUpdated = data.reduce(
    (latest, item) => (item.lastUpdate > latest ? item.lastUpdate : latest),
    data[0]?.lastUpdate ?? new Date().toISOString(),
  )
  return {
    success: true,
    status: 'fallback',
    sourceMode: 'legacy',
    count: data.length,
    exchangeRate: USD_VND_RATE,
    categories: getCategories(),
    lastUpdated,
    data,
  }
}

