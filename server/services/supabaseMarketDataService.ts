import { getCategories, getWorldPrices as getLegacyWorldPrices, type WorldCommodityItem } from './worldBankService.js'
import {
  fetchLiveDayData,
  getVnPriceSourceStatus as getLegacyVnPriceSourceStatus,
  getVnPrices as getLegacyVnPrices,
  getVnPricesHistory as getLegacyVnPricesHistory,
} from './priceAggregator.js'
import type { CrawledPriceItem, SourceSnapshot, VnPricesResponse } from './crawlers/types.js'
import { enqueueDayData, isRedisQueueConfigured, shouldProcessInline } from './ingestion/queue.js'
import { loadCommodityLookup, processIngestionMessage, recordIngestionError, type IngestionQueueMessage } from './ingestion/pipeline.js'
import { processQueuedBatch } from './ingestion/worker.js'
import {
  getRegionLabelFromObservation,
  convertWorldPriceToUsdKg,
  SOURCE_BASE_CONFIDENCE,
  USD_VND_RATE,
  VN_COMMODITY_META,
} from './marketDataMappings.js'
import {
  buildCanonicalRegionSelections,
  buildSourcePriorityLookup,
  createRankedRegionCandidate,
  pickSummaryRegionSelections,
  toRegionPrices,
} from './priceQuality.js'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from './supabaseClient.js'

type LatestObservationRow = {
  recorded_at: string
  commodity_slug: string
  province_code: string | null
  variety: string | null
  quality_grade: string | null
  price_vnd: number
  source: string
  raw_payload: {
    region?: string
    commodityName?: string
    category?: string
    unit?: string
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
  avg_7d: number | null
  avg_30d: number | null
  trend_7d_pct: number | null
  trend_30d_pct: number | null
  updated_at: string
}

type RawCrawlLogRow = {
  source_name: string
  source_url: string | null
  crawled_at: string
  raw_json: {
    snapshot?: SourceSnapshot
  }
}

type LatestWorldPriceRow = {
  recorded_at: string
  commodity_slug: string
  exchange: string
  price_usd: number
  price_unit: string
  price_vnd_kg: number | null
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
  data: Array<WorldCommodityItem & { priceVndKg?: number | null }>
}

function roundNumber(value: number) {
  return Number(value.toFixed(2))
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

function normalizeDateKey(value: string) {
  return value.slice(0, 10)
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

async function persistSourceSnapshots(sourceSnapshots: SourceSnapshot[]) {
  if (sourceSnapshots.length === 0) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const rows = sourceSnapshots.map(source => ({
    source_name: source.id,
    source_url: source.latestArticleUrl ?? source.url,
    raw_json: {
      snapshot: source,
      coverage: source.coverage,
      syncedAt: new Date().toISOString(),
    },
  }))

  const { error } = await client.from('raw_crawl_logs').insert(rows)
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

async function getLatestObservationRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('latest_observation_details')
    .select('recorded_at, commodity_slug, province_code, variety, quality_grade, price_vnd, source, raw_payload')
    .in('market_type', ['farm_gate', 'wholesale'])
    .order('commodity_slug', { ascending: true })
    .order('price_vnd', { ascending: false })

  if (error) {
    throw error
  }

  return data as LatestObservationRow[]
}

async function getDailySummaryRows() {
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
    .in('price_type', ['farm_gate', 'wholesale'])

  if (error) {
    throw error
  }

  return data as DailySummaryRow[]
}

async function getCommodityTrendRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('commodity_trends')
    .select('commodity_slug, avg_7d, avg_30d, trend_7d_pct, trend_30d_pct, updated_at')
    .eq('price_type', 'wholesale')

  if (error) {
    throw error
  }

  return data as CommodityTrendRow[]
}

async function getLatestSourceSnapshots() {
  const client = getSupabaseReadClient()
  if (!client) {
    return []
  }

  const { data, error } = await client
    .from('raw_crawl_logs')
    .select('source_name, source_url, crawled_at, raw_json')
    .order('crawled_at', { ascending: false })
    .limit(20)

  if (error) {
    throw error
  }

  const bySource = new Map<string, SourceSnapshot>()
  for (const row of data as RawCrawlLogRow[]) {
    const snapshot = row.raw_json?.snapshot
    if (!snapshot || bySource.has(row.source_name)) {
      continue
    }

    bySource.set(row.source_name, snapshot)
  }

  return [...bySource.values()]
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

function buildVnResponseFromRows(
  observationRows: LatestObservationRow[],
  dailySummaryRows: DailySummaryRow[],
  trendRows: CommodityTrendRow[],
  sourceSnapshots: SourceSnapshot[],
): VnPricesResponse {
  const byCommodity = new Map<string, LatestObservationRow[]>()
  const sourcePriorityLookup = buildSourcePriorityLookup(sourceSnapshots)
  for (const row of observationRows) {
    const entries = byCommodity.get(row.commodity_slug) ?? []
    entries.push(row)
    byCommodity.set(row.commodity_slug, entries)
  }

  const { rangeByCommodity, dailyByCommodity } = buildHistoricalLookups(dailySummaryRows)
  const trendByCommodity = new Map(trendRows.map(row => [row.commodity_slug, row]))
  const latestSourceFetchedAt = sourceSnapshots.reduce(
    (latest, snapshot) => (snapshot.fetchedAt > latest ? snapshot.fetchedAt : latest),
    observationRows[0]?.recorded_at ?? new Date().toISOString(),
  )

  const summaries = [...byCommodity.entries()]
    .map(([commoditySlug, rows]) => {
      const meta = VN_COMMODITY_META[commoditySlug] ?? {
        commodityName: rows[0].raw_payload?.commodityName ?? commoditySlug,
        category: rows[0].raw_payload?.category ?? 'Khac',
        unit: rows[0].raw_payload?.unit ?? 'VND/kg',
      }
      const regionSelections = pickSummaryRegionSelections(
        buildCanonicalRegionSelections(
          rows.map(row => {
            const regionLabel = getRegionLabelFromObservation(
              row.province_code,
              row.variety,
              typeof row.raw_payload?.region === 'string' ? row.raw_payload.region : null,
            )
            const source = (row.source in SOURCE_BASE_CONFIDENCE ? row.source : 'fallback') as SourceSnapshot['id']

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
      const latestDate = rows.reduce((latest, row) => (row.recorded_at > latest ? row.recorded_at : latest), rows[0].recorded_at)
      const currentDateKey = normalizeDateKey(latestDate)
      const dailyState = dailyByCommodity.get(commoditySlug)
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
      const historicalRange = rangeByCommodity.get(commoditySlug)
      const regions = toRegionPrices(regionSelections)

      return {
        commodity: commoditySlug,
        commodityName: meta.commodityName,
        category: meta.category,
        unit: meta.unit,
        priceHigh: Math.max(...prices),
        priceLow: Math.min(...prices),
        priceAvg,
        change,
        changePct,
        low52w: historicalRange?.low ?? (currentDaily?.minPrice ?? Math.min(...prices)),
        high52w: historicalRange?.high ?? (currentDaily?.maxPrice ?? Math.max(...prices)),
        regions,
        sources: [...new Set(rows.map(row => row.source as SourceSnapshot['id']))],
        recommendation: getRecommendation(recommendationBasis),
        lastUpdated: latestDate,
      }
    })
    .sort((a, b) => b.priceAvg - a.priceAvg)

  return {
    status: 'live',
    fetchedAt: new Date().toISOString(),
    lastUpdated: latestSourceFetchedAt,
    data: summaries,
    sources: sourceSnapshots,
    errors: [],
  }
}

async function buildVnResponseFromSupabase() {
  const observationRows = await getLatestObservationRows()
  if (!observationRows || observationRows.length === 0) {
    return null
  }

  const [dailySummaryRows, sourceSnapshots, trendRows] = await Promise.all([
    getDailySummaryRows(),
    getLatestSourceSnapshots(),
    getCommodityTrendRows(),
  ])

  return buildVnResponseFromRows(observationRows, dailySummaryRows ?? [], trendRows ?? [], sourceSnapshots)
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

async function syncWorldPricesToSupabase(forceRefresh: boolean) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return false
  }

  const commodityLookup = await loadCommodityLookup(client)
  const commodityWorldLookup = await loadCommodityWorldLookup()

  const items = await getLegacyWorldPrices(forceRefresh)
  const today = new Date().toISOString().slice(0, 10)

  const deleteResponse = await client
    .from('world_prices')
    .delete()
    .gte('recorded_at', `${today}T00:00:00.000Z`)
    .lt('recorded_at', `${today}T23:59:59.999Z`)

  if (deleteResponse.error) {
    throw deleteResponse.error
  }

  const rows = items
    .map(item => {
      const commodityId = commodityLookup.get(item.id)
      const commodityMeta = commodityWorldLookup?.get(item.id)
      if (!commodityId || !commodityMeta) {
        return null
      }

      const priceUsdKg = convertWorldPriceToUsdKg(item.priceCurrent, item.unit, commodityMeta.world_to_kg_factor)
      const change1wPct =
        item.priceLastWeek > 0 ? roundNumber(((item.priceCurrent - item.priceLastWeek) / item.priceLastWeek) * 100) : 0

      return {
        recorded_at: item.lastUpdate,
        commodity_id: commodityId,
        exchange: item.exchange,
        contract_month: null,
        price_raw: item.priceCurrent,
        price_unit_raw: item.unit,
        price_usd_kg: priceUsdKg,
        price_vnd_kg: convertWorldPriceToVndKg(item, commodityMeta.world_to_kg_factor),
        exchange_rate: USD_VND_RATE,
        change_1d: item.change,
        change_1d_pct: item.changePct,
        change_1w_pct: change1wPct,
        volume: null,
        open_interest: null,
        source_url: null,
        raw_payload: item,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (rows.length > 0) {
    const insertResponse = await client.from('world_prices').insert(rows)
    if (insertResponse.error) {
      throw insertResponse.error
    }
  }

  return true
}

async function getLatestWorldRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('latest_world_prices_public')
    .select('recorded_at, commodity_slug, exchange, price_usd, price_unit, price_vnd_kg, source_url, raw_payload')
    .order('commodity_slug', { ascending: true })

  if (error) {
    throw error
  }

  return data as LatestWorldPriceRow[]
}

async function buildWorldResponseFromSupabase(): Promise<WorldPricesResponse | null> {
  const rows = await getLatestWorldRows()
  if (!rows || rows.length === 0) {
    return null
  }

  const data = rows.map(row => {
    const raw = row.raw_payload
    return {
      id: row.commodity_slug,
      name: typeof raw.name === 'string' ? raw.name : row.commodity_slug,
      nameEn: typeof raw.nameEn === 'string' ? raw.nameEn : row.commodity_slug,
      symbol: typeof raw.symbol === 'string' ? raw.symbol : row.commodity_slug.toUpperCase(),
      category: typeof raw.category === 'string' ? raw.category : 'Khác',
      exchange: row.exchange,
      unit: row.price_unit,
      priceCurrent: row.price_usd,
      priceYesterday: typeof raw.priceYesterday === 'number' ? raw.priceYesterday : row.price_usd,
      priceLastWeek: typeof raw.priceLastWeek === 'number' ? raw.priceLastWeek : row.price_usd,
      priceLastMonth: typeof raw.priceLastMonth === 'number' ? raw.priceLastMonth : row.price_usd,
      change: typeof raw.change === 'number' ? raw.change : 0,
      changePct: typeof raw.changePct === 'number' ? raw.changePct : 0,
      low52w: typeof raw.low52w === 'number' ? raw.low52w : row.price_usd,
      high52w: typeof raw.high52w === 'number' ? raw.high52w : row.price_usd,
      priceVndKg: row.price_vnd_kg,
      currency: 'USD' as const,
      lastUpdate: row.recorded_at,
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

export async function getVnPrices(forceRefresh = false): Promise<VnPricesResponse> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return getLegacyVnPrices(forceRefresh)
  }

  try {
    if (runtime.hasAdminConfig && forceRefresh) {
      await syncVnPricesToSupabase()
    }

    const dbResponse = await buildVnResponseFromSupabase()
    if (dbResponse) {
      return dbResponse
    }
  } catch (error) {
    if (!(error instanceof Error) || !isRelationMissing(error.message)) {
      console.error('[Supabase VN] Falling back to legacy service:', error)
    }
  }

  return getLegacyVnPrices(forceRefresh)
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

export async function getWorldPricesResponse(forceRefresh = false): Promise<WorldPricesResponse> {
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
      await syncWorldPricesToSupabase(forceRefresh)
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
