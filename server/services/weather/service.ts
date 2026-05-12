import { getCacheEntry, setCache } from '../cacheService.js'
import { buildAgriAdvisories } from './advisories.js'
import { buildCurrentConsensus, buildDailyComparisonRows, buildDailyConsensus, buildHourlyConsensus } from './consensus.js'
import { getDefaultWeatherLocation, getWeatherLocation, listWeatherLocations } from './locations.js'
import { fetchMetNoForecast } from './providers/metNo.js'
import { fetchOpenMeteoForecast } from './providers/openMeteo.js'
import { fetchWeatherApiForecast } from './providers/weatherApi.js'
import type { AgriWeatherPayload, WeatherProviderForecast, WeatherProviderId, WeatherSourceStatus } from './types.js'
import { buildWeatherCacheKey, normalizeProviderError } from './utils.js'

const DEFAULT_CACHE_TTL_MINUTES = 60
const DEFAULT_PROVIDER_TIMEOUT_MS = 6_000
const STALE_CACHE_WINDOW_MS = 6 * 60 * 60 * 1000

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

async function runProviders(locationCode: string) {
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

function buildPayload(data: Awaited<ReturnType<typeof runProviders>>): AgriWeatherPayload {
  const status = data.forecasts.length === data.sourceStatus.length ? 'live' : 'partial'
  const updatedAt = new Date().toISOString()
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

export function listAgriWeatherLocations() {
  return listWeatherLocations()
}

export function resolveAgriWeatherLocationCode(locationCode: string | null | undefined) {
  if (!locationCode || locationCode.trim().length === 0) {
    return getDefaultWeatherLocation().code
  }

  return locationCode.trim().toUpperCase()
}

export async function getAgriWeather(locationCode: string | null | undefined, options: { forceRefresh?: boolean } = {}) {
  const resolvedCode = resolveAgriWeatherLocationCode(locationCode)
  const location = getWeatherLocation(resolvedCode)
  if (!location) {
    throw new Error(`Invalid weather location: ${resolvedCode}`)
  }

  const cacheKey = buildWeatherCacheKey(resolvedCode)
  const cacheEntry = getCacheEntry<AgriWeatherPayload>(cacheKey)
  const cacheTtlMs = getCacheTtlMs()

  if (!options.forceRefresh && cacheEntry && Date.now() - cacheEntry.timestamp <= cacheTtlMs) {
    return cacheEntry.data
  }

  const providerData = await runProviders(resolvedCode)

  if (providerData.forecasts.length > 0) {
    const payload = buildPayload(providerData)
    setCache(cacheKey, payload, cacheTtlMs)
    return payload
  }

  if (cacheEntry && Date.now() - cacheEntry.timestamp <= STALE_CACHE_WINDOW_MS) {
    return {
      ...cacheEntry.data,
      status: 'stale',
      providerErrors: providerData.providerErrors,
    }
  }

  throw new Error(`No weather data available for ${location.nameVi}`)
}
