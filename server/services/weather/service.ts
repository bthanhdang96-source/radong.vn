import { buildAgriAdvisories } from './advisories.js'
import { buildCurrentConsensus, buildDailyComparisonRows, buildDailyConsensus, buildHourlyConsensus } from './consensus.js'
import { getDefaultWeatherLocation, getWeatherLocation, listWeatherLocations } from './locations.js'
import { fetchMetNoForecast } from './providers/metNo.js'
import { fetchOpenMeteoForecast } from './providers/openMeteo.js'
import { fetchWeatherApiForecast } from './providers/weatherApi.js'
import { getSupabaseAdminClient, getSupabaseReadClient } from '../supabaseClient.js'
import type {
  AgriWeatherHistoryPayload,
  AgriWeatherHistorySnapshot,
  AgriWeatherPayload,
  WeatherLocationSummary,
  WeatherProviderForecast,
  WeatherProviderId,
  WeatherSourceStatus,
} from './types.js'
import { normalizeProviderError } from './utils.js'

const WEATHER_CACHE_TABLE = 'weather_cache'
const WEATHER_HISTORY_TABLE = 'weather_snapshots'
const DEFAULT_CACHE_TTL_MINUTES = 60
const DEFAULT_PROVIDER_TIMEOUT_MS = 6_000
const DEFAULT_HISTORY_LIMIT = 10
const MAX_HISTORY_LIMIT = 30
const LOCATION_REFRESH_CONCURRENCY = 3

const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

type WeatherProviderRunResult = {
  location: WeatherLocationSummary
  sourceStatus: WeatherSourceStatus[]
  providerErrors: string[]
  forecasts: WeatherProviderForecast[]
}

type PersistedWeatherRow = {
  province_code: string
  payload: AgriWeatherPayload
  fetched_at: string
  expires_at: string
}

type PersistedWeatherCacheRow = {
  province_code: string
  payload: AgriWeatherPayload | null
  fetched_at: string
  expires_at: string
}

type PersistedWeatherSnapshotRow = {
  province_code: string
  snapshot_date: string
  fetched_at: string
  payload: AgriWeatherPayload | null
}

type WeatherSnapshotInsertRow = {
  province_code: string
  snapshot_date: string
  fetched_at: string
  payload: AgriWeatherPayload
}

type WeatherRefreshResult = {
  payloadByCode: Map<string, AgriWeatherPayload>
  providerErrorsByCode: Map<string, string[]>
}

type WeatherHistoryQuery = {
  date?: string | null
  limit?: number
}

export type WeatherServiceDeps = {
  getDefaultLocation: () => WeatherLocationSummary
  getLocation: (code: string | null | undefined) => WeatherLocationSummary | null
  listLocations: () => WeatherLocationSummary[]
  now: () => Date
  readPersistedWeather: (provinceCode: string) => Promise<PersistedWeatherCacheRow | null>
  readLatestHistoricalSnapshot: (provinceCode: string) => Promise<PersistedWeatherSnapshotRow | null>
  listHistoricalSnapshots: (provinceCode: string, options: { date?: string | null; limit: number }) => Promise<PersistedWeatherSnapshotRow[]>
  runProviders: (locationCode: string) => Promise<WeatherProviderRunResult>
  upsertPersistedWeather: (rows: PersistedWeatherRow[]) => Promise<void>
  insertHistoricalSnapshots: (rows: WeatherSnapshotInsertRow[]) => Promise<void>
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

function getCacheTtlMs() {
  return parsePositiveInteger(process.env.WEATHER_CACHE_TTL_MINUTES, DEFAULT_CACHE_TTL_MINUTES) * 60 * 1000
}

function normalizeHistoryLimit(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_HISTORY_LIMIT
  }

  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.round(value!)))
}

function getProviderTimeoutMs() {
  return parsePositiveInteger(process.env.WEATHER_PROVIDER_TIMEOUT_MS, DEFAULT_PROVIDER_TIMEOUT_MS)
}

function providerLabel(provider: WeatherProviderId) {
  switch (provider) {
    case 'open_meteo':
      return 'Open-Meteo'
    case 'met_no':
      return 'MET Norway'
    case 'weatherapi':
      return 'WeatherAPI'
  }
}

function toSnapshotDate(value: string) {
  const parts = VN_DATE_FORMATTER.formatToParts(new Date(value))
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Unable to derive weather snapshot date from ${value}`)
  }

  return `${year}-${month}-${day}`
}

function buildPayload(data: WeatherProviderRunResult, updatedAt: string): AgriWeatherPayload {
  const status = data.forecasts.length === data.sourceStatus.length ? 'live' : 'partial'
  const hourly72h = buildHourlyConsensus(data.forecasts, 72)
  const daily7d = buildDailyConsensus(data.forecasts, 7)

  return {
    status,
    updatedAt,
    location: data.location,
    current: buildCurrentConsensus(data.forecasts, hourly72h),
    hourly72h,
    daily7d,
    advisories: buildAgriAdvisories({ hourly72h, daily7d }),
    sourceStatus: data.sourceStatus,
    comparison: buildDailyComparisonRows(data.forecasts, daily7d),
    providerErrors: data.providerErrors,
  }
}

function toHistorySnapshot(row: PersistedWeatherSnapshotRow): AgriWeatherHistorySnapshot | null {
  if (!row.payload) {
    return null
  }

  return {
    snapshotDate: row.snapshot_date,
    fetchedAt: row.fetched_at,
    payload: row.payload,
  }
}

function getWeatherReadClient() {
  return getSupabaseAdminClient() ?? getSupabaseReadClient()
}

async function readPersistedWeatherRow(provinceCode: string) {
  const client = getWeatherReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from(WEATHER_CACHE_TABLE)
    .select('province_code, payload, fetched_at, expires_at')
    .eq('province_code', provinceCode)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as PersistedWeatherCacheRow | null) ?? null
}

async function readLatestHistoricalSnapshotRow(provinceCode: string) {
  const client = getWeatherReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from(WEATHER_HISTORY_TABLE)
    .select('province_code, snapshot_date, fetched_at, payload')
    .eq('province_code', provinceCode)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as PersistedWeatherSnapshotRow | null) ?? null
}

async function listHistoricalSnapshotRows(provinceCode: string, options: { date?: string | null; limit: number }) {
  const client = getWeatherReadClient()
  if (!client) {
    return []
  }

  let query = client
    .from(WEATHER_HISTORY_TABLE)
    .select('province_code, snapshot_date, fetched_at, payload')
    .eq('province_code', provinceCode)
    .order('fetched_at', { ascending: false })
    .limit(options.limit)

  if (options.date) {
    query = query.eq('snapshot_date', options.date)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data as PersistedWeatherSnapshotRow[] | null) ?? []
}

async function upsertPersistedWeatherRows(rows: PersistedWeatherRow[]) {
  if (rows.length === 0) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to persist agricultural weather data')
  }

  const { error } = await client.from(WEATHER_CACHE_TABLE).upsert(rows, {
    onConflict: 'province_code',
  })

  if (error) {
    throw error
  }
}

async function insertHistoricalSnapshotRows(rows: WeatherSnapshotInsertRow[]) {
  if (rows.length === 0) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to persist agricultural weather snapshots')
  }

  const { error } = await client.from(WEATHER_HISTORY_TABLE).upsert(rows, {
    onConflict: 'province_code,fetched_at',
  })

  if (error) {
    throw error
  }
}

const defaultDeps: WeatherServiceDeps = {
  getDefaultLocation: getDefaultWeatherLocation,
  getLocation: getWeatherLocation,
  listLocations: listWeatherLocations,
  now: () => new Date(),
  readPersistedWeather: readPersistedWeatherRow,
  readLatestHistoricalSnapshot: readLatestHistoricalSnapshotRow,
  listHistoricalSnapshots: listHistoricalSnapshotRows,
  runProviders,
  upsertPersistedWeather: upsertPersistedWeatherRows,
  insertHistoricalSnapshots: insertHistoricalSnapshotRows,
}

function addMs(isoTimestamp: string, durationMs: number) {
  return new Date(new Date(isoTimestamp).getTime() + durationMs).toISOString()
}

function getTimestampMs(value: string) {
  return new Date(value).getTime()
}

function isRowFresh(row: PersistedWeatherCacheRow | null, nowMs: number) {
  return Boolean(row?.payload) && getTimestampMs(row!.expires_at) > nowMs
}

function toStalePayload(payload: AgriWeatherPayload, providerErrors: string[]) {
  return {
    ...payload,
    status: 'stale' as const,
    providerErrors: providerErrors.length > 0 ? providerErrors : payload.providerErrors,
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  if (items.length === 0) {
    return [] as R[]
  }

  const results = new Array<R>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) {
        return
      }

      results[index] = await mapper(items[index])
    }
  })

  await Promise.all(workers)
  return results
}

async function refreshAllPersistedWeather(deps: WeatherServiceDeps): Promise<WeatherRefreshResult> {
  const locations = deps.listLocations()
  const cacheTtlMs = getCacheTtlMs()
  const fetchedAt = deps.now().toISOString()
  const expiresAt = addMs(fetchedAt, cacheTtlMs)
  const snapshotDate = toSnapshotDate(fetchedAt)

  const results = await mapWithConcurrency(locations, LOCATION_REFRESH_CONCURRENCY, async location => {
    const providerData = await deps.runProviders(location.code)
    if (providerData.forecasts.length === 0) {
      return {
        code: location.code,
        payload: null,
        providerErrors: providerData.providerErrors,
      }
    }

    return {
      code: location.code,
      payload: buildPayload(providerData, fetchedAt),
      fetchedAt,
      expiresAt,
      snapshotDate,
      providerErrors: providerData.providerErrors,
    }
  })

  const cacheRows = results
    .filter((result): result is {
      code: string
      payload: AgriWeatherPayload
      fetchedAt: string
      expiresAt: string
      snapshotDate: string
      providerErrors: string[]
    } => result.payload !== null)
    .map(result => ({
      province_code: result.code,
      payload: result.payload,
      fetched_at: result.fetchedAt,
      expires_at: result.expiresAt,
    }))

  const historyRows: WeatherSnapshotInsertRow[] = cacheRows.map(row => ({
    province_code: row.province_code,
    snapshot_date: snapshotDate,
    fetched_at: row.fetched_at,
    payload: row.payload,
  }))

  await deps.upsertPersistedWeather(cacheRows)
  await deps.insertHistoricalSnapshots(historyRows)

  return {
    payloadByCode: new Map(cacheRows.map(row => [row.province_code, row.payload])),
    providerErrorsByCode: new Map(results.map(result => [result.code, result.providerErrors])),
  }
}

async function runProviders(locationCode: string): Promise<WeatherProviderRunResult> {
  const location = getWeatherLocation(locationCode)
  if (!location) {
    throw new Error(`Invalid weather location: ${locationCode}`)
  }

  const timeoutMs = getProviderTimeoutMs()
  const providers: Array<{
    provider: WeatherProviderId
    execute: () => Promise<WeatherProviderForecast>
  }> = [
    {
      provider: 'open_meteo',
      execute: () => fetchOpenMeteoForecast(location, timeoutMs),
    },
    {
      provider: 'met_no',
      execute: () => fetchMetNoForecast(location, timeoutMs),
    },
    {
      provider: 'weatherapi',
      execute: () => fetchWeatherApiForecast(location, timeoutMs),
    },
  ]

  const starts = new Map<WeatherProviderId, number>()
  for (const provider of providers) {
    starts.set(provider.provider, Date.now())
  }

  const settled = await Promise.allSettled(providers.map(provider => provider.execute()))
  const sourceStatus: WeatherSourceStatus[] = []
  const providerErrors: string[] = []
  const forecasts: WeatherProviderForecast[] = []

  settled.forEach((result, index) => {
    const provider = providers[index]
    const startedAt = starts.get(provider.provider) ?? Date.now()
    const latencyMs = Date.now() - startedAt

    if (result.status === 'fulfilled') {
      forecasts.push(result.value)
      sourceStatus.push({
        provider: provider.provider,
        success: true,
        updatedAt: result.value.updatedAt,
        horizonDays: result.value.daily.length,
        latencyMs,
        error: null,
      })
      return
    }

    const errorMessage = normalizeProviderError(result.reason)
    providerErrors.push(`${providerLabel(provider.provider)}: ${errorMessage}`)
    sourceStatus.push({
      provider: provider.provider,
      success: false,
      updatedAt: null,
      horizonDays: 0,
      latencyMs,
      error: errorMessage,
    })
  })

  return {
    location,
    sourceStatus,
    providerErrors,
    forecasts,
  }
}

async function getAgriWeatherWithDeps(
  deps: WeatherServiceDeps,
  locationCode: string | null | undefined,
  options: { forceRefresh?: boolean } = {},
) {
  const resolvedCode = resolveAgriWeatherLocationCode(locationCode, deps)
  const location = deps.getLocation(resolvedCode)
  if (!location) {
    throw new Error(`Invalid weather location: ${resolvedCode}`)
  }

  const persistedRow = await deps.readPersistedWeather(resolvedCode)
  const nowMs = deps.now().getTime()
  if (!options.forceRefresh && isRowFresh(persistedRow, nowMs) && persistedRow?.payload) {
    return persistedRow.payload
  }

  const refreshResult = await refreshAllPersistedWeather(deps)
  const refreshedPayload = refreshResult.payloadByCode.get(resolvedCode)
  if (refreshedPayload) {
    return refreshedPayload
  }

  const providerErrors = refreshResult.providerErrorsByCode.get(resolvedCode) ?? []
  if (persistedRow?.payload) {
    return toStalePayload(persistedRow.payload, providerErrors)
  }

  const historicalRow = await deps.readLatestHistoricalSnapshot(resolvedCode)
  if (historicalRow?.payload) {
    return toStalePayload(historicalRow.payload, providerErrors)
  }

  throw new Error(`No weather data available for ${location.nameVi}`)
}

async function listAgriWeatherHistoryWithDeps(
  deps: WeatherServiceDeps,
  locationCode: string | null | undefined,
  options: WeatherHistoryQuery = {},
): Promise<AgriWeatherHistoryPayload> {
  const resolvedCode = resolveAgriWeatherLocationCode(locationCode, deps)
  const location = deps.getLocation(resolvedCode)
  if (!location) {
    throw new Error(`Invalid weather location: ${resolvedCode}`)
  }

  const limit = normalizeHistoryLimit(options.limit)
  const rows = await deps.listHistoricalSnapshots(resolvedCode, {
    date: options.date ?? null,
    limit,
  })

  const snapshots = rows
    .map(toHistorySnapshot)
    .filter((snapshot): snapshot is AgriWeatherHistorySnapshot => snapshot !== null)

  if (snapshots.length > 0) {
    return {
      location,
      snapshots,
    }
  }

  const persistedRow = await deps.readPersistedWeather(resolvedCode)
  if (persistedRow?.payload) {
    const snapshotDate = toSnapshotDate(persistedRow.fetched_at)
    if (!options.date || options.date === snapshotDate) {
      return {
        location,
        snapshots: [
          {
            snapshotDate,
            fetchedAt: persistedRow.fetched_at,
            payload: persistedRow.payload,
          },
        ],
      }
    }
  }

  return {
    location,
    snapshots: [],
  }
}

function resolveAgriWeatherLocationCode(
  locationCode: string | null | undefined,
  deps: Pick<WeatherServiceDeps, 'getDefaultLocation'> = defaultDeps,
) {
  if (!locationCode || locationCode.trim().length === 0) {
    return deps.getDefaultLocation().code
  }

  return locationCode.trim().toUpperCase()
}

export function listAgriWeatherLocations() {
  return listWeatherLocations()
}

export function createAgriWeatherService(customDeps: Partial<WeatherServiceDeps> = {}) {
  const deps: WeatherServiceDeps = {
    ...defaultDeps,
    ...customDeps,
  }

  return {
    getAgriWeather(locationCode: string | null | undefined, options: { forceRefresh?: boolean } = {}) {
      return getAgriWeatherWithDeps(deps, locationCode, options)
    },
    listAgriWeatherHistory(locationCode: string | null | undefined, options: WeatherHistoryQuery = {}) {
      return listAgriWeatherHistoryWithDeps(deps, locationCode, options)
    },
  }
}

const agriWeatherService = createAgriWeatherService()

export { resolveAgriWeatherLocationCode }

export async function getAgriWeather(locationCode: string | null | undefined, options: { forceRefresh?: boolean } = {}) {
  return agriWeatherService.getAgriWeather(locationCode, options)
}

export async function listAgriWeatherHistory(locationCode: string | null | undefined, options: WeatherHistoryQuery = {}) {
  return agriWeatherService.listAgriWeatherHistory(locationCode, options)
}
