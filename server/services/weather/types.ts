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

export type WeatherLocationType = 'province' | 'city'

export type WeatherMacroRegion = 'north' | 'central' | 'highland' | 'south'

export type AdvisorySignal = 'rain' | 'temperature' | 'humidity' | 'wind' | 'uv' | 'et0'

export interface WeatherLocationSummary {
  code: string
  nameVi: string
  type: WeatherLocationType
  macroRegion: WeatherMacroRegion
  lat: number
  lon: number
  elevationM: number | null
  featured: boolean
}

export interface WeatherProviderCurrent {
  time: string
  tempC: number | null
  humidityPct: number | null
  rainMm: number | null
  windKph: number | null
  uv: number | null
  conditionKey: WeatherConditionKey
}

export interface WeatherProviderHourlyForecast {
  time: string
  tempC: number | null
  humidityPct: number | null
  rainMm: number | null
  rainProbabilityPct: number | null
  windKph: number | null
  uv: number | null
  et0Mm: number | null
  soilTemperatureC: number | null
  soilMoistureRatio: number | null
  conditionKey: WeatherConditionKey
}

export interface WeatherProviderDailyForecast {
  date: string
  tempMinC: number | null
  tempMaxC: number | null
  humidityAvgPct: number | null
  rainMm: number | null
  rainProbabilityPct: number | null
  windMaxKph: number | null
  uvMax: number | null
  et0Mm: number | null
  conditionKey: WeatherConditionKey
}

export interface WeatherProviderForecast {
  provider: WeatherProviderId
  updatedAt: string
  current: WeatherProviderCurrent | null
  hourly: WeatherProviderHourlyForecast[]
  daily: WeatherProviderDailyForecast[]
}

export interface WeatherSourceStatus {
  provider: WeatherProviderId
  success: boolean
  updatedAt: string | null
  horizonDays: number
  latencyMs: number | null
  error: string | null
}

export interface WeatherCurrentSummary {
  time: string
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
  basedOn: AdvisorySignal[]
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
  status: 'live' | 'partial' | 'stale'
  updatedAt: string
  location: WeatherLocationSummary
  current: WeatherCurrentSummary | null
  hourly72h: ForecastHour[]
  daily7d: ForecastDay[]
  advisories: AgriAdvisory[]
  sourceStatus: WeatherSourceStatus[]
  comparison: DailyComparisonRow[]
  providerErrors: string[]
}
