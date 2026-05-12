import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeMetNoForecast } from '../services/weather/providers/metNo.js'
import { normalizeOpenMeteoForecast } from '../services/weather/providers/openMeteo.js'
import { normalizeWeatherApiForecast } from '../services/weather/providers/weatherApi.js'
import { buildAgriAdvisories } from '../services/weather/advisories.js'
import { buildDailyConsensus, buildHourlyConsensus } from '../services/weather/consensus.js'
import type { ForecastDay, ForecastHour } from '../services/weather/types.js'

function readFixture<T>(filename: string): T {
  const content = readFileSync(new URL(`../fixtures/${filename}`, import.meta.url), 'utf-8')
  return JSON.parse(content) as T
}

test('normalizeOpenMeteoForecast maps hourly and daily fields', () => {
  const fixture = readFixture<Parameters<typeof normalizeOpenMeteoForecast>[0]>('weather-open-meteo-sample.json')
  const result = normalizeOpenMeteoForecast(fixture)

  assert.equal(result.provider, 'open_meteo')
  assert.equal(result.hourly.length, 3)
  assert.equal(result.daily.length, 2)
  assert.equal(result.current?.tempC, 27.2)
  assert.equal(result.daily[1]?.rainProbabilityPct, 85)
})

test('normalizeMetNoForecast derives daily rows from timeseries', () => {
  const fixture = readFixture<Parameters<typeof normalizeMetNoForecast>[0]>('weather-met-no-sample.json')
  const result = normalizeMetNoForecast(fixture)

  assert.equal(result.provider, 'met_no')
  assert.equal(result.hourly.length, 4)
  assert.ok(result.daily.length >= 1)
  assert.equal(result.current?.conditionKey, 'cloudy')
})

test('normalizeWeatherApiForecast preserves forecast day summaries', () => {
  const fixture = readFixture<Parameters<typeof normalizeWeatherApiForecast>[0]>('weather-weatherapi-sample.json')
  const result = normalizeWeatherApiForecast(fixture)

  assert.equal(result.provider, 'weatherapi')
  assert.equal(result.daily.length, 2)
  assert.equal(result.hourly.length, 4)
  assert.equal(result.daily[1]?.conditionKey, 'rain')
})

test('consensus combines multiple providers using median values', () => {
  const openMeteo = normalizeOpenMeteoForecast(
    readFixture<Parameters<typeof normalizeOpenMeteoForecast>[0]>('weather-open-meteo-sample.json'),
  )
  const metNo = normalizeMetNoForecast(readFixture<Parameters<typeof normalizeMetNoForecast>[0]>('weather-met-no-sample.json'))
  const weatherApi = normalizeWeatherApiForecast(
    readFixture<Parameters<typeof normalizeWeatherApiForecast>[0]>('weather-weatherapi-sample.json'),
  )

  const hourly = buildHourlyConsensus([openMeteo, metNo, weatherApi])
  const daily = buildDailyConsensus([openMeteo, metNo, weatherApi])

  assert.ok(hourly.length >= 3)
  assert.ok(daily.length >= 2)
  assert.ok(hourly[0].providerCount >= 2)
  assert.ok(['high', 'medium', 'low'].includes(daily[0].agreement))
})

test('buildAgriAdvisories emits expected rule-based warnings', () => {
  const hourly72h: ForecastHour[] = Array.from({ length: 48 }, (_, index) => ({
    time: new Date(Date.UTC(2026, 4, 12, index)).toISOString(),
    tempC: index >= 20 && index <= 28 ? 36 : 29,
    humidityPct: index <= 4 ? 88 : 54,
    rainMm: index <= 8 ? 2 : 0,
    rainProbabilityPct: index <= 8 ? 86 : 15,
    windKph: index <= 6 ? 24 : 8,
    uv: index >= 20 && index <= 26 ? 9 : 2,
    conditionKey: index <= 8 ? 'rain' : 'clear',
    providerCount: 3,
    agreement: 'medium',
  }))

  const daily7d: ForecastDay[] = [
    {
      date: '2026-05-12',
      tempMinC: 25,
      tempMaxC: 36,
      humidityAvgPct: 78,
      rainMm: 22,
      rainProbabilityPct: 88,
      windMaxKph: 26,
      uvMax: 9,
      et0Mm: 4.5,
      providerCount: 3,
      agreement: 'medium',
      conditionKey: 'rain',
    },
    {
      date: '2026-05-13',
      tempMinC: 26,
      tempMaxC: 35,
      humidityAvgPct: 55,
      rainMm: 0,
      rainProbabilityPct: 12,
      windMaxKph: 10,
      uvMax: 8,
      et0Mm: 4.7,
      providerCount: 2,
      agreement: 'high',
      conditionKey: 'clear',
    },
  ]

  const advisories = buildAgriAdvisories({ hourly72h, daily7d })
  const ids = advisories.map(advisory => advisory.id)

  assert.ok(ids.includes('rain_warning'))
  assert.ok(ids.includes('spray_caution'))
  assert.ok(ids.includes('heat_stress'))
})
