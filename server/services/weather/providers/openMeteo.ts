import type {
  WeatherConditionKey,
  WeatherLocationSummary,
  WeatherProviderCurrent,
  WeatherProviderDailyForecast,
  WeatherProviderForecast,
  WeatherProviderHourlyForecast,
} from '../types.js'
import { fetchJson, toIsoFromVietnamLocal } from '../utils.js'

type OpenMeteoResponse = {
  current?: {
    time: string
    temperature_2m?: number
    relative_humidity_2m?: number
    precipitation?: number
    wind_speed_10m?: number
    uv_index?: number
    weather_code?: number
  }
  hourly?: {
    time: string[]
    temperature_2m?: Array<number | null>
    relative_humidity_2m?: Array<number | null>
    precipitation?: Array<number | null>
    precipitation_probability?: Array<number | null>
    wind_speed_10m?: Array<number | null>
    uv_index?: Array<number | null>
    et0_fao_evapotranspiration?: Array<number | null>
    soil_temperature_0cm?: Array<number | null>
    soil_moisture_0_to_1cm?: Array<number | null>
    weather_code?: Array<number | null>
  }
  daily?: {
    time: string[]
    weather_code?: Array<number | null>
    temperature_2m_min?: Array<number | null>
    temperature_2m_max?: Array<number | null>
    precipitation_sum?: Array<number | null>
    precipitation_probability_max?: Array<number | null>
    wind_speed_10m_max?: Array<number | null>
    uv_index_max?: Array<number | null>
    et0_fao_evapotranspiration_sum?: Array<number | null>
  }
}

function mapOpenMeteoCode(code: number | null | undefined): WeatherConditionKey {
  switch (code) {
    case 0:
      return 'clear'
    case 1:
    case 2:
    case 3:
      return 'cloudy'
    case 45:
    case 48:
      return 'fog'
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
      return 'rain'
    case 82:
      return 'heavy_rain'
    case 95:
    case 96:
    case 99:
      return 'thunder'
    default:
      return 'unknown'
  }
}

export function normalizeOpenMeteoForecast(payload: OpenMeteoResponse): WeatherProviderForecast {
  const current: WeatherProviderCurrent | null = payload.current
    ? {
        time: toIsoFromVietnamLocal(payload.current.time),
        tempC: payload.current.temperature_2m ?? null,
        humidityPct: payload.current.relative_humidity_2m ?? null,
        rainMm: payload.current.precipitation ?? null,
        windKph: payload.current.wind_speed_10m ?? null,
        uv: payload.current.uv_index ?? null,
        conditionKey: mapOpenMeteoCode(payload.current.weather_code),
      }
    : null

  const hourlyTimes = payload.hourly?.time ?? []
  const hourly: WeatherProviderHourlyForecast[] = hourlyTimes.slice(0, 72).map((time, index) => ({
    time: toIsoFromVietnamLocal(time),
    tempC: payload.hourly?.temperature_2m?.[index] ?? null,
    humidityPct: payload.hourly?.relative_humidity_2m?.[index] ?? null,
    rainMm: payload.hourly?.precipitation?.[index] ?? null,
    rainProbabilityPct: payload.hourly?.precipitation_probability?.[index] ?? null,
    windKph: payload.hourly?.wind_speed_10m?.[index] ?? null,
    uv: payload.hourly?.uv_index?.[index] ?? null,
    et0Mm: payload.hourly?.et0_fao_evapotranspiration?.[index] ?? null,
    soilTemperatureC: payload.hourly?.soil_temperature_0cm?.[index] ?? null,
    soilMoistureRatio: payload.hourly?.soil_moisture_0_to_1cm?.[index] ?? null,
    conditionKey: mapOpenMeteoCode(payload.hourly?.weather_code?.[index]),
  }))

  const dailyTimes = payload.daily?.time ?? []
  const daily: WeatherProviderDailyForecast[] = dailyTimes.slice(0, 7).map((date, index) => ({
    date,
    tempMinC: payload.daily?.temperature_2m_min?.[index] ?? null,
    tempMaxC: payload.daily?.temperature_2m_max?.[index] ?? null,
    humidityAvgPct: null,
    rainMm: payload.daily?.precipitation_sum?.[index] ?? null,
    rainProbabilityPct: payload.daily?.precipitation_probability_max?.[index] ?? null,
    windMaxKph: payload.daily?.wind_speed_10m_max?.[index] ?? null,
    uvMax: payload.daily?.uv_index_max?.[index] ?? null,
    et0Mm: payload.daily?.et0_fao_evapotranspiration_sum?.[index] ?? null,
    conditionKey: mapOpenMeteoCode(payload.daily?.weather_code?.[index]),
  }))

  return {
    provider: 'open_meteo',
    updatedAt: current?.time ?? hourly[0]?.time ?? new Date().toISOString(),
    current,
    hourly,
    daily,
  }
}

export async function fetchOpenMeteoForecast(location: WeatherLocationSummary, timeoutMs: number) {
  const baseUrl = process.env.WEATHER_OPEN_METEO_BASE_URL?.trim() || 'https://api.open-meteo.com/v1/forecast'
  const url = new URL(baseUrl)
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set('timezone', 'Asia/Ho_Chi_Minh')
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,uv_index,weather_code',
  )
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,uv_index,et0_fao_evapotranspiration,soil_temperature_0cm,soil_moisture_0_to_1cm,weather_code',
  )
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,et0_fao_evapotranspiration_sum',
  )

  const apiKey = process.env.WEATHER_OPEN_METEO_API_KEY?.trim()
  if (apiKey) {
    url.searchParams.set('apikey', apiKey)
  }

  const payload = await fetchJson<OpenMeteoResponse>(url.toString(), {}, timeoutMs)
  return normalizeOpenMeteoForecast(payload)
}
