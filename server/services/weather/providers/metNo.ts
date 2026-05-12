import type {
  WeatherConditionKey,
  WeatherLocationSummary,
  WeatherProviderCurrent,
  WeatherProviderForecast,
  WeatherProviderHourlyForecast,
} from '../types.js'
import { fetchJson, summarizeHourlyToDaily } from '../utils.js'

type MetNoTimeSeriesEntry = {
  time: string
  data?: {
    instant?: {
      details?: {
        air_temperature?: number
        relative_humidity?: number
        ultraviolet_index_clear_sky?: number
        wind_speed?: number
        fog_area_fraction?: number
      }
    }
    next_1_hours?: {
      summary?: {
        symbol_code?: string
      }
      details?: {
        precipitation_amount?: number
      }
    }
    next_6_hours?: {
      summary?: {
        symbol_code?: string
      }
      details?: {
        precipitation_amount?: number
      }
    }
    next_12_hours?: {
      summary?: {
        symbol_code?: string
      }
    }
  }
}

type MetNoResponse = {
  properties?: {
    timeseries?: MetNoTimeSeriesEntry[]
  }
}

function mapMetNoSymbol(symbol: string | null | undefined, fogAreaFraction: number | null | undefined): WeatherConditionKey {
  const normalized = (symbol ?? '').toLowerCase()

  if (normalized.includes('thunder')) {
    return 'thunder'
  }

  if (normalized.includes('heavyrain')) {
    return 'heavy_rain'
  }

  if (normalized.includes('rain') || normalized.includes('drizzle') || normalized.includes('sleet')) {
    return 'rain'
  }

  if (normalized.includes('fog') || (typeof fogAreaFraction === 'number' && fogAreaFraction >= 60)) {
    return 'fog'
  }

  if (normalized.includes('wind')) {
    return 'windy'
  }

  if (normalized.includes('cloudy') || normalized.includes('fair') || normalized.includes('partlycloudy')) {
    return 'cloudy'
  }

  if (normalized.includes('clear')) {
    return 'clear'
  }

  return 'unknown'
}

export function normalizeMetNoForecast(payload: MetNoResponse): WeatherProviderForecast {
  const entries = payload.properties?.timeseries ?? []
  const hourly: WeatherProviderHourlyForecast[] = entries.slice(0, 72).map(entry => {
    const details = entry.data?.instant?.details
    const next1 = entry.data?.next_1_hours
    const next6 = entry.data?.next_6_hours
    const summarySymbol =
      next1?.summary?.symbol_code ??
      next6?.summary?.symbol_code ??
      entry.data?.next_12_hours?.summary?.symbol_code ??
      null

    return {
      time: entry.time,
      tempC: details?.air_temperature ?? null,
      humidityPct: details?.relative_humidity ?? null,
      rainMm: next1?.details?.precipitation_amount ?? next6?.details?.precipitation_amount ?? null,
      rainProbabilityPct: null,
      windKph: typeof details?.wind_speed === 'number' ? Number((details.wind_speed * 3.6).toFixed(2)) : null,
      uv: details?.ultraviolet_index_clear_sky ?? null,
      et0Mm: null,
      soilTemperatureC: null,
      soilMoistureRatio: null,
      conditionKey: mapMetNoSymbol(summarySymbol, details?.fog_area_fraction),
    }
  })

  const currentEntry = hourly[0]
  const current: WeatherProviderCurrent | null = currentEntry
    ? {
        time: currentEntry.time,
        tempC: currentEntry.tempC,
        humidityPct: currentEntry.humidityPct,
        rainMm: currentEntry.rainMm,
        windKph: currentEntry.windKph,
        uv: currentEntry.uv,
        conditionKey: currentEntry.conditionKey,
      }
    : null

  return {
    provider: 'met_no',
    updatedAt: current?.time ?? new Date().toISOString(),
    current,
    hourly,
    daily: summarizeHourlyToDaily(hourly, 7),
  }
}

export async function fetchMetNoForecast(location: WeatherLocationSummary, timeoutMs: number) {
  const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/complete')
  url.searchParams.set('lat', String(location.lat))
  url.searchParams.set('lon', String(location.lon))

  const userAgent = process.env.WEATHER_MET_USER_AGENT?.trim() || 'nongsanvn-weather/1.0'
  const payload = await fetchJson<MetNoResponse>(
    url.toString(),
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
    },
    timeoutMs,
  )

  return normalizeMetNoForecast(payload)
}
