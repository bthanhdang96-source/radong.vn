import type {
  AgreementLevel,
  WeatherConditionKey,
  WeatherProviderDailyForecast,
  WeatherProviderHourlyForecast,
  WeatherProviderId,
} from './types.js'

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000

const PROVIDER_PRIORITY: WeatherProviderId[] = ['open_meteo', 'met_no', 'weatherapi']

const CONDITION_PRIORITY: WeatherConditionKey[] = [
  'thunder',
  'heavy_rain',
  'rain',
  'fog',
  'windy',
  'cloudy',
  'clear',
  'unknown',
]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

export function averageNumbers(values: Array<number | null | undefined>, digits = 2): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) {
    return null
  }

  const total = numeric.reduce((sum, value) => sum + value, 0)
  return roundNumber(total / numeric.length, digits)
}

export function medianNumbers(values: Array<number | null | undefined>, digits = 2): number | null {
  const numeric = values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right)

  if (numeric.length === 0) {
    return null
  }

  const middle = Math.floor(numeric.length / 2)
  if (numeric.length % 2 === 1) {
    return roundNumber(numeric[middle], digits)
  }

  return roundNumber((numeric[middle - 1] + numeric[middle]) / 2, digits)
}

export function maxNumber(values: Array<number | null | undefined>, digits = 2): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) {
    return null
  }

  return roundNumber(Math.max(...numeric), digits)
}

export function minNumber(values: Array<number | null | undefined>, digits = 2): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) {
    return null
  }

  return roundNumber(Math.min(...numeric), digits)
}

export function sumNumbers(values: Array<number | null | undefined>, digits = 2): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) {
    return null
  }

  return roundNumber(numeric.reduce((sum, value) => sum + value, 0), digits)
}

export function getProviderPriority(provider: WeatherProviderId) {
  const index = PROVIDER_PRIORITY.indexOf(provider)
  return index === -1 ? PROVIDER_PRIORITY.length : index
}

export function pickConsensusCondition(
  values: Array<{ provider: WeatherProviderId; conditionKey: WeatherConditionKey | null | undefined }>,
): WeatherConditionKey {
  const counts = new Map<WeatherConditionKey, number>()
  for (const value of values) {
    if (!value.conditionKey || value.conditionKey === 'unknown') {
      continue
    }

    counts.set(value.conditionKey, (counts.get(value.conditionKey) ?? 0) + 1)
  }

  if (counts.size === 0) {
    return 'unknown'
  }

  const ranked = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    const severityDelta = CONDITION_PRIORITY.indexOf(left[0]) - CONDITION_PRIORITY.indexOf(right[0])
    if (severityDelta !== 0) {
      return severityDelta
    }

    const leftPriority = Math.min(
      ...values.filter(value => value.conditionKey === left[0]).map(value => getProviderPriority(value.provider)),
    )
    const rightPriority = Math.min(
      ...values.filter(value => value.conditionKey === right[0]).map(value => getProviderPriority(value.provider)),
    )
    return leftPriority - rightPriority
  })

  return ranked[0]?.[0] ?? 'unknown'
}

export function getAgreementLevel(
  tempValues: Array<number | null | undefined>,
  rainValues: Array<number | null | undefined>,
  thresholds: {
    highTemp: number
    mediumTemp: number
    highRain: number
    mediumRain: number
  },
): AgreementLevel {
  const numericTemps = tempValues.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const numericRain = rainValues.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const providerCount = Math.max(numericTemps.length, numericRain.length)

  if (providerCount <= 1) {
    return 'low'
  }

  const tempSpread = numericTemps.length > 0 ? Math.max(...numericTemps) - Math.min(...numericTemps) : 0
  const rainSpread = numericRain.length > 0 ? Math.max(...numericRain) - Math.min(...numericRain) : 0

  if (tempSpread <= thresholds.highTemp && rainSpread <= thresholds.highRain) {
    return 'high'
  }

  if (tempSpread <= thresholds.mediumTemp && rainSpread <= thresholds.mediumRain) {
    return 'medium'
  }

  return 'low'
}

export function normalizeProviderError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown weather provider error'
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 6_000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function toIsoFromVietnamLocal(value: string) {
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized
  return new Date(`${withSeconds}+07:00`).toISOString()
}

export function toVietnamDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  const shifted = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function summarizeHourlyToDaily(
  hourly: WeatherProviderHourlyForecast[],
  limit = 7,
): WeatherProviderDailyForecast[] {
  const byDate = new Map<string, WeatherProviderHourlyForecast[]>()

  for (const entry of hourly) {
    const dateKey = toVietnamDateKey(entry.time)
    const existing = byDate.get(dateKey) ?? []
    existing.push(entry)
    byDate.set(dateKey, existing)
  }

  return [...byDate.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([date, entries]) => ({
      date,
      tempMinC: minNumber(entries.map(entry => entry.tempC)),
      tempMaxC: maxNumber(entries.map(entry => entry.tempC)),
      humidityAvgPct: averageNumbers(entries.map(entry => entry.humidityPct)),
      rainMm: sumNumbers(entries.map(entry => entry.rainMm)),
      rainProbabilityPct: maxNumber(entries.map(entry => entry.rainProbabilityPct), 0),
      windMaxKph: maxNumber(entries.map(entry => entry.windKph)),
      uvMax: maxNumber(entries.map(entry => entry.uv)),
      et0Mm: sumNumbers(entries.map(entry => entry.et0Mm)),
      conditionKey: pickConsensusCondition(entries.map(entry => ({ provider: 'met_no', conditionKey: entry.conditionKey }))),
    }))
}

export function buildWeatherCacheKey(locationCode: string) {
  return `agri-weather:${locationCode}`
}

export function uniqueSorted<T>(values: T[]) {
  return [...new Set(values)].sort()
}
