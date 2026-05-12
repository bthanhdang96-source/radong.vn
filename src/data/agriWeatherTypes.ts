export type WeatherProviderId = 'open_meteo' | 'met_no' | 'weatherapi'

export type AgreementLevel = 'high' | 'medium' | 'low'

export type WeatherConditionKey =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'thunder'
  | 'fog'
  | 'windy'
  | 'unknown'

export interface WeatherLocationSummary {
  code: string
  nameVi: string
  type: 'province' | 'city'
  macroRegion: 'north' | 'central' | 'highland' | 'south'
  lat: number
  lon: number
  elevationM: number | null
  featured: boolean
}

export interface WeatherCurrentSummary {
  time: string
  // Numeric weather values shown in the UI are arithmetic averages across available providers.
  tempC: number | null
  humidityPct: number | null
  rainMm: number | null
  windKph: number | null
  uv: number | null
  conditionKey: WeatherConditionKey
  providerCount: number
  agreement: AgreementLevel
}

export interface ForecastHour {
  time: string
  tempC: number | null
  humidityPct: number | null
  rainMm: number | null
  rainProbabilityPct: number | null
  windKph: number | null
  uv: number | null
  conditionKey: WeatherConditionKey
  providerCount: number
  agreement: AgreementLevel
}

export interface ForecastDay {
  date: string
  tempMinC: number | null
  tempMaxC: number | null
  humidityAvgPct: number | null
  rainMm: number | null
  rainProbabilityPct: number | null
  windMaxKph: number | null
  uvMax: number | null
  et0Mm: number | null
  providerCount: number
  agreement: AgreementLevel
  conditionKey: WeatherConditionKey
}

export interface AgriAdvisory {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  windowStart: string
  windowEnd: string
  basedOn: Array<'rain' | 'temperature' | 'humidity' | 'wind' | 'uv' | 'et0'>
}

export interface WeatherSourceStatus {
  provider: WeatherProviderId
  success: boolean
  updatedAt: string | null
  horizonDays: number
  latencyMs: number | null
  error: string | null
}

export interface DailyComparisonProviderValue {
  provider: WeatherProviderId
  tempMinC: number | null
  tempMaxC: number | null
  rainMm: number | null
  rainProbabilityPct: number | null
  windMaxKph: number | null
  uvMax: number | null
  conditionKey: WeatherConditionKey
}

export interface DailyComparisonRow {
  date: string
  providerCount: number
  agreement: AgreementLevel
  consensus: ForecastDay
  providers: DailyComparisonProviderValue[]
}

export interface AgriWeatherPayload {
  success: boolean
  status: 'live' | 'partial' | 'stale'
  updatedAt: string
  location: WeatherLocationSummary
  current: WeatherCurrentSummary | null
  hourly72h: ForecastHour[]
  daily7d: ForecastDay[]
  advisories: AgriAdvisory[]
  // Retained for internal diagnostics and admin tooling, not rendered on the main weather page.
  sourceStatus: WeatherSourceStatus[]
  comparison: DailyComparisonRow[]
  providerErrors: string[]
}

export const WEATHER_PROVIDER_META: Record<
  WeatherProviderId,
  {
    label: string
    sourceUrl: string
  }
> = {
  open_meteo: {
    label: 'Open-Meteo',
    sourceUrl: 'https://open-meteo.com/en/docs',
  },
  met_no: {
    label: 'MET.no',
    sourceUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/documentation',
  },
  weatherapi: {
    label: 'WeatherAPI',
    sourceUrl: 'https://www.weatherapi.com/docs/',
  },
}

export const AGREEMENT_LABELS: Record<AgreementLevel, string> = {
  high: 'Khớp cao',
  medium: 'Khớp vừa',
  low: 'Khớp thấp',
}

export const CONDITION_LABELS: Record<WeatherConditionKey, string> = {
  clear: 'Trời quang',
  cloudy: 'Nhiều mây',
  rain: 'Có mưa',
  heavy_rain: 'Mưa lớn',
  thunder: 'Dông',
  fog: 'Sương mù',
  windy: 'Nhiều gió',
  unknown: 'Chưa xác định',
}

export function formatHourLabel(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDayLabel(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}
