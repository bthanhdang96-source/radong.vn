import type {
  WeatherConditionKey,
  WeatherLocationSummary,
  WeatherProviderCurrent,
  WeatherProviderDailyForecast,
  WeatherProviderForecast,
  WeatherProviderHourlyForecast,
} from '../types.js'
import { fetchJson, toIsoFromVietnamLocal } from '../utils.js'

type WeatherApiHour = {
  time: string
  temp_c?: number
  humidity?: number
  precip_mm?: number
  chance_of_rain?: number
  wind_kph?: number
  uv?: number
  condition?: {
    text?: string
  }
}

type WeatherApiForecastDay = {
  date: string
  day?: {
    maxtemp_c?: number
    mintemp_c?: number
    avghumidity?: number
    totalprecip_mm?: number
    daily_chance_of_rain?: number
    maxwind_kph?: number
    uv?: number
    condition?: {
      text?: string
    }
  }
  hour?: WeatherApiHour[]
}

type WeatherApiResponse = {
  current?: {
    last_updated?: string
    temp_c?: number
    humidity?: number
    precip_mm?: number
    wind_kph?: number
    uv?: number
    condition?: {
      text?: string
    }
  }
  forecast?: {
    forecastday?: WeatherApiForecastDay[]
  }
}

function mapWeatherApiText(text: string | null | undefined): WeatherConditionKey {
  const normalized = (text ?? '').toLowerCase()

  if (normalized.includes('thunder')) {
    return 'thunder'
  }

  if (normalized.includes('heavy rain') || normalized.includes('torrential')) {
    return 'heavy_rain'
  }

  if (normalized.includes('rain') || normalized.includes('drizzle') || normalized.includes('shower')) {
    return 'rain'
  }

  if (normalized.includes('fog') || normalized.includes('mist')) {
    return 'fog'
  }

  if (normalized.includes('wind')) {
    return 'windy'
  }

  if (normalized.includes('cloud') || normalized.includes('overcast')) {
    return 'cloudy'
  }

  if (normalized.includes('clear') || normalized.includes('sunny')) {
    return 'clear'
  }

  return 'unknown'
}

export function normalizeWeatherApiForecast(payload: WeatherApiResponse): WeatherProviderForecast {
  const forecastDays = payload.forecast?.forecastday ?? []
  const hourly: WeatherProviderHourlyForecast[] = forecastDays
    .flatMap(day => day.hour ?? [])
    .slice(0, 72)
    .map(hour => ({
      time: toIsoFromVietnamLocal(hour.time),
      tempC: hour.temp_c ?? null,
      humidityPct: hour.humidity ?? null,
      rainMm: hour.precip_mm ?? null,
      rainProbabilityPct: hour.chance_of_rain ?? null,
      windKph: hour.wind_kph ?? null,
      uv: hour.uv ?? null,
      et0Mm: null,
      soilTemperatureC: null,
      soilMoistureRatio: null,
      conditionKey: mapWeatherApiText(hour.condition?.text),
    }))

  const daily: WeatherProviderDailyForecast[] = forecastDays.slice(0, 7).map(day => ({
    date: day.date,
    tempMinC: day.day?.mintemp_c ?? null,
    tempMaxC: day.day?.maxtemp_c ?? null,
    humidityAvgPct: day.day?.avghumidity ?? null,
    rainMm: day.day?.totalprecip_mm ?? null,
    rainProbabilityPct: day.day?.daily_chance_of_rain ?? null,
    windMaxKph: day.day?.maxwind_kph ?? null,
    uvMax: day.day?.uv ?? null,
    et0Mm: null,
    conditionKey: mapWeatherApiText(day.day?.condition?.text),
  }))

  const current: WeatherProviderCurrent | null = payload.current?.last_updated
    ? {
        time: toIsoFromVietnamLocal(payload.current.last_updated),
        tempC: payload.current.temp_c ?? null,
        humidityPct: payload.current.humidity ?? null,
        rainMm: payload.current.precip_mm ?? null,
        windKph: payload.current.wind_kph ?? null,
        uv: payload.current.uv ?? null,
        conditionKey: mapWeatherApiText(payload.current.condition?.text),
      }
    : null

  return {
    provider: 'weatherapi',
    updatedAt: current?.time ?? hourly[0]?.time ?? new Date().toISOString(),
    current,
    hourly,
    daily,
  }
}

export async function fetchWeatherApiForecast(location: WeatherLocationSummary, timeoutMs: number) {
  const apiKey = process.env.WEATHERAPI_KEY?.trim()
  if (!apiKey) {
    throw new Error('WEATHERAPI_KEY is not configured')
  }

  const url = new URL('https://api.weatherapi.com/v1/forecast.json')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', `${location.lat},${location.lon}`)
  url.searchParams.set('days', '3')
  url.searchParams.set('aqi', 'no')
  url.searchParams.set('alerts', 'no')

  const payload = await fetchJson<WeatherApiResponse>(url.toString(), {}, timeoutMs)
  return normalizeWeatherApiForecast(payload)
}
