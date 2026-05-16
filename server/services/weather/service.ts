import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAgriAdvisories } from './advisories.js'
import { buildCurrentConsensus, buildDailyComparisonRows, buildDailyConsensus, buildHourlyConsensus } from './consensus.js'
import { getDefaultWeatherLocation, getWeatherLocation, listWeatherLocations } from './locations.js'
import { fetchMetNoForecast } from './providers/metNo.js'
import { fetchOpenMeteoForecast } from './providers/openMeteo.js'
import { fetchWeatherApiForecast } from './providers/weatherApi.js'
import { getSupabaseAdminClient, getSupabaseReadClient } from '../supabaseClient.js'
import type {
  AgriWeatherPayload,
  WeatherLocationSummary,
  WeatherProviderForecast,
  WeatherProviderId,
  WeatherSourceStatus,
} from './types.js'
import { normalizeProviderError } from './utils.js'

const WEATHER_CACHE_TABLE = 'weather_cache'
const DEFAULT_CACHE_TTL_MINUTES = 60
const DEFAULT_PROVIDER_TIMEOUT_MS = 6_000
const LOCATION_REFRESH_CONCURRENCY = 3
const STALE_CACHE_WINDOW_MS = 6 * 60 * 60 * 1000

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

type WeatherRefreshResult = {
  payloadByCode: Map<string, AgriWeatherPayload>
  providerErrorsByCode: Map<string, string[]>
}

export type WeatherServiceDeps = {
  getDefaultLocation: () => WeatherLocationSummary
  getLocation: (code: string | null | undefined) => WeatherLocationSummary | null
  listLocations: () => WeatherLocationSummary[]
  now: () => Date
  readPersistedWeather: (provinceCode: string) => Promise<PersistedWeatherCacheRow | null>
  runProviders: (locationCode: string) => Promise<WeatherProviderRunResult>
  upsertPersistedWeather: (rows: PersistedWeatherRow[]) => Promise<void>
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

const defaultDeps: WeatherServiceDeps = {
  getDefaultLocation: getDefaultWeatherLocation,
  getLocation: getWeatherLocation,
  listLocations: listWeatherLocations,
  now: () => new Date(),
  readPersistedWeather: readPersistedWeatherRow,
  runProviders,
  upsertPersistedWeather: upsertPersistedWeatherRows,
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

function isRowReusableAsStale(row: PersistedWeatherCacheRow | null, nowMs: number) {
  return Boolean(row?.payload) && nowMs - getTimestampMs(row!.fetched_at) <= STALE_CACHE_WINDOW_MS
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

  const results = await mapWithConcurrency(locations, LOCATION_REFRESH_CONCURRENCY, async location => {
    const providerData = await deps.runProviders(location.code)
    if (providerData.forecasts.length === 0) {
      return {
        code: location.code,
        payload: null,
        providerErrors: providerData.providerErrors,
      }
    }

    const fetchedAt = deps.now().toISOString()
    return {
      code: location.code,
      payload: buildPayload(providerData, fetchedAt),
      fetchedAt,
      expiresAt: addMs(fetchedAt, cacheTtlMs),
      providerErrors: providerData.providerErrors,
    }
  })

  const rows = results
    .filter((result): result is {
      code: string
      payload: AgriWeatherPayload
      fetchedAt: string
      expiresAt: string
      providerErrors: string[]
    } => result.payload !== null)
    .map(result => ({
      province_code: result.code,
      payload: result.payload,
      fetched_at: result.fetchedAt,
      expires_at: result.expiresAt,
    }))

  await deps.upsertPersistedWeather(rows)

  return {
    payloadByCode: new Map(rows.map(row => [row.province_code, row.payload])),
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

  if (isRowReusableAsStale(persistedRow, deps.now().getTime()) && persistedRow?.payload) {
    return {
      ...persistedRow.payload,
      status: 'stale',
      providerErrors: refreshResult.providerErrorsByCode.get(resolvedCode) ?? persistedRow.payload.providerErrors,
    }
  }

  throw new Error(`No weather data available for ${location.nameVi}`)
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
  }
}

const agriWeatherService = createAgriWeatherService()

export { resolveAgriWeatherLocationCode }

export async function getAgriWeather(locationCode: string | null | undefined, options: { forceRefresh?: boolean } = {}) {
  return agriWeatherService.getAgriWeather(locationCode, options)
}
