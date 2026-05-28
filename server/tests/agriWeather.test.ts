import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeMetNoForecast } from '../services/weather/providers/metNo.js'
import { normalizeOpenMeteoForecast } from '../services/weather/providers/openMeteo.js'
import { normalizeWeatherApiForecast } from '../services/weather/providers/weatherApi.js'
import { createAgriWeatherService } from '../services/weather/service.js'
import { buildAgriAdvisories } from '../services/weather/advisories.js'
import { buildCurrentConsensus, buildDailyConsensus, buildHourlyConsensus } from '../services/weather/consensus.js'
import type {
  AgriWeatherPayload,
  ForecastDay,
  ForecastHour,
  WeatherLocationSummary,
  WeatherProviderForecast,
} from '../services/weather/types.js'

function readFixture<T>(filename: string): T {
  const content = readFileSync(new URL(`../fixtures/${filename}`, import.meta.url), 'utf-8')
  return JSON.parse(content) as T
}

const TEST_LOCATIONS: WeatherLocationSummary[] = [
  { code: 'HCM', nameVi: 'TP. Ho Chi Minh', type: 'city', macroRegion: 'south', lat: 10.77689, lon: 106.70081, elevationM: null, featured: true },
  { code: 'DLK', nameVi: 'Dak Lak', type: 'province', macroRegion: 'highland', lat: 12.66747, lon: 108.03775, elevationM: null, featured: true },
]

function getTestLocation(code: string) {
  return TEST_LOCATIONS.find(location => location.code === code) ?? null
}

function createPersistedPayload(locationCode: string, updatedAt: string): AgriWeatherPayload {
  const location = getTestLocation(locationCode)
  if (!location) {
    throw new Error(`Missing test location ${locationCode}`)
  }

  return {
    status: 'live',
    updatedAt,
    location,
    current: null,
    hourly72h: [],
    daily7d: [],
    advisories: [],
    sourceStatus: [],
    comparison: [],
    providerErrors: [],
  }
}

function createProviderForecast(locationCode: string, updatedAt: string): WeatherProviderForecast {
  const tempBase = locationCode === 'HCM' ? 32 : 26

  return {
    provider: 'open_meteo',
    updatedAt,
    current: {
      time: updatedAt,
      tempC: tempBase,
      humidityPct: 70,
      rainMm: 1,
      windKph: 10,
      uv: 5,
      conditionKey: 'cloudy',
    },
    hourly: [
      {
        time: updatedAt,
        tempC: tempBase,
        humidityPct: 70,
        rainMm: 1,
        rainProbabilityPct: 40,
        windKph: 10,
        uv: 5,
        et0Mm: 0.2,
        soilTemperatureC: null,
        soilMoistureRatio: null,
        conditionKey: 'cloudy',
      },
    ],
    daily: [
      {
        date: updatedAt.slice(0, 10),
        tempMinC: tempBase - 4,
        tempMaxC: tempBase + 2,
        humidityAvgPct: 70,
        rainMm: 4,
        rainProbabilityPct: 40,
        windMaxKph: 14,
        uvMax: 6,
        et0Mm: 3.4,
        conditionKey: 'cloudy',
      },
    ],
  }
}

function createWeatherServiceHarness(options: {
  nowIso: string
  initialRows?: Array<{
    province_code: string
    payload: AgriWeatherPayload
    fetched_at: string
    expires_at: string
  }>
  initialSnapshots?: Array<{
    province_code: string
    snapshot_date: string
    fetched_at: string
    payload: AgriWeatherPayload
  }>
  runProvidersByCode: Record<
    string,
    {
      providerErrors: string[]
      forecasts: WeatherProviderForecast[]
    }
  >
}) {
  const store = new Map((options.initialRows ?? []).map(row => [row.province_code, row]))
  const snapshotStore = [...(options.initialSnapshots ?? [])]
  const refreshCalls: string[] = []
  const upsertedRows: Array<{
    province_code: string
    payload: AgriWeatherPayload
    fetched_at: string
    expires_at: string
  }> = []
  const insertedSnapshots: Array<{
    province_code: string
    snapshot_date: string
    fetched_at: string
    payload: AgriWeatherPayload
  }> = []

  const service = createAgriWeatherService({
    getDefaultLocation: () => TEST_LOCATIONS[0],
    getLocation: code => getTestLocation(code ?? ''),
    listLocations: () => TEST_LOCATIONS,
    now: () => new Date(options.nowIso),
    readPersistedWeather: async provinceCode => store.get(provinceCode) ?? null,
    readLatestHistoricalSnapshot: async provinceCode =>
      snapshotStore
        .filter(row => row.province_code === provinceCode)
        .sort((left, right) => right.fetched_at.localeCompare(left.fetched_at))[0] ?? null,
    listHistoricalSnapshots: async (provinceCode, query) =>
      snapshotStore
        .filter(row => row.province_code === provinceCode)
        .filter(row => !query.date || row.snapshot_date === query.date)
        .sort((left, right) => right.fetched_at.localeCompare(left.fetched_at))
        .slice(0, query.limit),
    runProviders: async locationCode => {
      refreshCalls.push(locationCode)

      const location = getTestLocation(locationCode)
      const result = options.runProvidersByCode[locationCode]
      if (!location || !result) {
        throw new Error(`Missing provider stub for ${locationCode}`)
      }

      return {
        location,
        sourceStatus: result.forecasts.length > 0
          ? [{
              provider: 'open_meteo' as const,
              success: true,
              updatedAt: result.forecasts[0].updatedAt,
              horizonDays: result.forecasts[0].daily.length,
              latencyMs: 10,
              error: null,
            }]
          : [{
              provider: 'open_meteo' as const,
              success: false,
              updatedAt: null,
              horizonDays: 0,
              latencyMs: 10,
              error: result.providerErrors[0] ?? 'provider failed',
            }],
        providerErrors: result.providerErrors,
        forecasts: result.forecasts,
      }
    },
    upsertPersistedWeather: async rows => {
      upsertedRows.push(...rows)
      for (const row of rows) {
        store.set(row.province_code, row)
      }
    },
    insertHistoricalSnapshots: async rows => {
      insertedSnapshots.push(...rows)
      snapshotStore.push(...rows)
    },
  })

  return {
    service,
    store,
    snapshotStore,
    refreshCalls,
    upsertedRows,
    insertedSnapshots,
  }
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

test('consensus averages numeric values across available providers', () => {
  const providers: WeatherProviderForecast[] = [
    {
      provider: 'open_meteo',
      updatedAt: '2026-05-12T00:00:00.000Z',
      current: {
        time: '2026-05-12T00:00:00.000Z',
        tempC: 30,
        humidityPct: 80,
        rainMm: 3,
        windKph: 12,
        uv: 6,
        conditionKey: 'rain',
      },
      hourly: [
        {
          time: '2026-05-12T01:00:00.000Z',
          tempC: 30,
          humidityPct: 80,
          rainMm: 3,
          rainProbabilityPct: 60,
          windKph: 10,
          uv: 5,
          et0Mm: 0.2,
          soilTemperatureC: null,
          soilMoistureRatio: null,
          conditionKey: 'rain',
        },
      ],
      daily: [
        {
          date: '2026-05-12',
          tempMinC: 24,
          tempMaxC: 32,
          humidityAvgPct: 76,
          rainMm: 8,
          rainProbabilityPct: 60,
          windMaxKph: 18,
          uvMax: 8,
          et0Mm: 4.2,
          conditionKey: 'rain',
        },
      ],
    },
    {
      provider: 'met_no',
      updatedAt: '2026-05-12T00:00:00.000Z',
      current: {
        time: '2026-05-12T00:00:00.000Z',
        tempC: 32,
        humidityPct: 74,
        rainMm: 1,
        windKph: 18,
        uv: 4,
        conditionKey: 'rain',
      },
      hourly: [
        {
          time: '2026-05-12T01:00:00.000Z',
          tempC: 32,
          humidityPct: 74,
          rainMm: 1,
          rainProbabilityPct: 30,
          windKph: 14,
          uv: 4,
          et0Mm: 0.3,
          soilTemperatureC: null,
          soilMoistureRatio: null,
          conditionKey: 'rain',
        },
      ],
      daily: [
        {
          date: '2026-05-12',
          tempMinC: 25,
          tempMaxC: 34,
          humidityAvgPct: 70,
          rainMm: 10,
          rainProbabilityPct: 30,
          windMaxKph: 24,
          uvMax: 7,
          et0Mm: 4.8,
          conditionKey: 'cloudy',
        },
      ],
    },
    {
      provider: 'weatherapi',
      updatedAt: '2026-05-12T00:00:00.000Z',
      current: {
        time: '2026-05-12T00:00:00.000Z',
        tempC: 34,
        humidityPct: 68,
        rainMm: 2,
        windKph: 15,
        uv: 5,
        conditionKey: 'cloudy',
      },
      hourly: [
        {
          time: '2026-05-12T01:00:00.000Z',
          tempC: 34,
          humidityPct: 68,
          rainMm: 2,
          rainProbabilityPct: 90,
          windKph: 16,
          uv: 6,
          et0Mm: 0.5,
          soilTemperatureC: null,
          soilMoistureRatio: null,
          conditionKey: 'cloudy',
        },
      ],
      daily: [
        {
          date: '2026-05-12',
          tempMinC: 26,
          tempMaxC: 36,
          humidityAvgPct: 68,
          rainMm: 12,
          rainProbabilityPct: 90,
          windMaxKph: 30,
          uvMax: 9,
          et0Mm: 5.1,
          conditionKey: 'rain',
        },
      ],
    },
  ]

  const hourly = buildHourlyConsensus(providers)
  const daily = buildDailyConsensus(providers)
  const current = buildCurrentConsensus(providers, hourly)

  assert.equal(hourly[0]?.tempC, 32)
  assert.equal(hourly[0]?.humidityPct, 74)
  assert.equal(hourly[0]?.rainMm, 2)
  assert.equal(hourly[0]?.rainProbabilityPct, 60)
  assert.equal(hourly[0]?.windKph, 13.33)
  assert.equal(hourly[0]?.uv, 5)
  assert.equal(hourly[0]?.providerCount, 3)
  assert.equal(hourly[0]?.conditionKey, 'rain')

  assert.equal(daily[0]?.tempMinC, 25)
  assert.equal(daily[0]?.tempMaxC, 34)
  assert.equal(daily[0]?.humidityAvgPct, 71.33)
  assert.equal(daily[0]?.rainMm, 10)
  assert.equal(daily[0]?.rainProbabilityPct, 60)
  assert.equal(daily[0]?.windMaxKph, 24)
  assert.equal(daily[0]?.uvMax, 8)
  assert.equal(daily[0]?.et0Mm, 4.7)
  assert.equal(daily[0]?.agreement, 'medium')
  assert.equal(daily[0]?.conditionKey, 'rain')

  assert.equal(current?.tempC, 32)
  assert.equal(current?.humidityPct, 74)
  assert.equal(current?.rainMm, 2)
  assert.equal(current?.windKph, 15)
  assert.equal(current?.uv, 5)
  assert.equal(current?.providerCount, 3)
  assert.equal(current?.conditionKey, 'rain')
})

test('consensus falls back to available providers without changing the output shape', () => {
  const baseProviders: WeatherProviderForecast[] = [
    {
      provider: 'open_meteo',
      updatedAt: '2026-05-12T00:00:00.000Z',
      current: {
        time: '2026-05-12T00:00:00.000Z',
        tempC: 28,
        humidityPct: 82,
        rainMm: 4,
        windKph: 9,
        uv: 3,
        conditionKey: 'rain',
      },
      hourly: [
        {
          time: '2026-05-12T01:00:00.000Z',
          tempC: 28,
          humidityPct: 82,
          rainMm: 4,
          rainProbabilityPct: 70,
          windKph: 9,
          uv: 3,
          et0Mm: 0.1,
          soilTemperatureC: null,
          soilMoistureRatio: null,
          conditionKey: 'rain',
        },
      ],
      daily: [
        {
          date: '2026-05-12',
          tempMinC: 23,
          tempMaxC: 30,
          humidityAvgPct: 82,
          rainMm: 14,
          rainProbabilityPct: 70,
          windMaxKph: 18,
          uvMax: 5,
          et0Mm: 3.6,
          conditionKey: 'rain',
        },
      ],
    },
    {
      provider: 'met_no',
      updatedAt: '2026-05-12T00:00:00.000Z',
      current: {
        time: '2026-05-12T00:00:00.000Z',
        tempC: 30,
        humidityPct: 78,
        rainMm: 2,
        windKph: 11,
        uv: 4,
        conditionKey: 'rain',
      },
      hourly: [
        {
          time: '2026-05-12T01:00:00.000Z',
          tempC: 30,
          humidityPct: 78,
          rainMm: 2,
          rainProbabilityPct: 50,
          windKph: 11,
          uv: 4,
          et0Mm: 0.2,
          soilTemperatureC: null,
          soilMoistureRatio: null,
          conditionKey: 'rain',
        },
      ],
      daily: [
        {
          date: '2026-05-12',
          tempMinC: 24,
          tempMaxC: 32,
          humidityAvgPct: 78,
          rainMm: 10,
          rainProbabilityPct: 50,
          windMaxKph: 22,
          uvMax: 6,
          et0Mm: 4,
          conditionKey: 'rain',
        },
      ],
    },
  ]

  const twoProviderHourly = buildHourlyConsensus(baseProviders)
  const twoProviderDaily = buildDailyConsensus(baseProviders)
  const oneProviderHourly = buildHourlyConsensus(baseProviders.slice(0, 1))
  const oneProviderDaily = buildDailyConsensus(baseProviders.slice(0, 1))

  assert.equal(twoProviderHourly[0]?.tempC, 29)
  assert.equal(twoProviderHourly[0]?.rainProbabilityPct, 60)
  assert.equal(twoProviderHourly[0]?.providerCount, 2)
  assert.equal(twoProviderDaily[0]?.windMaxKph, 20)
  assert.equal(twoProviderDaily[0]?.providerCount, 2)

  assert.equal(oneProviderHourly[0]?.tempC, 28)
  assert.equal(oneProviderHourly[0]?.rainProbabilityPct, 70)
  assert.equal(oneProviderHourly[0]?.providerCount, 1)
  assert.equal(oneProviderDaily[0]?.tempMaxC, 30)
  assert.equal(oneProviderDaily[0]?.providerCount, 1)
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

  const advisoryCopy = advisories.map(advisory => `${advisory.title} ${advisory.message}`).join(' ')
  assert.doesNotMatch(advisoryCopy, /ngoài ruộng|ra đồng|tưới|phun|bón lá|nấm bệnh|lao động ngoài trời/i)
  assert.match(advisoryCopy, /nguồn hàng|logistics|chất lượng|sản lượng|giá/i)
})

test('getAgriWeather returns a fresh persisted Supabase row without re-fetching providers', async () => {
  const nowIso = '2026-05-16T03:00:00.000Z'
  const persistedPayload = createPersistedPayload('HCM', '2026-05-16T02:30:00.000Z')
  const harness = createWeatherServiceHarness({
    nowIso,
    initialRows: [
      {
        province_code: 'HCM',
        payload: persistedPayload,
        fetched_at: '2026-05-16T02:30:00.000Z',
        expires_at: '2026-05-16T03:30:00.000Z',
      },
    ],
    runProvidersByCode: {
      HCM: { providerErrors: [], forecasts: [createProviderForecast('HCM', nowIso)] },
      DLK: { providerErrors: [], forecasts: [createProviderForecast('DLK', nowIso)] },
    },
  })

  const result = await harness.service.getAgriWeather('HCM')

  assert.deepEqual(result, persistedPayload)
  assert.deepEqual(harness.refreshCalls, [])
  assert.equal(harness.upsertedRows.length, 0)
})

test('force refreshing one weather location refreshes and persists every configured location', async () => {
  const nowIso = '2026-05-16T04:00:00.000Z'
  const harness = createWeatherServiceHarness({
    nowIso,
    runProvidersByCode: {
      HCM: { providerErrors: [], forecasts: [createProviderForecast('HCM', nowIso)] },
      DLK: { providerErrors: [], forecasts: [createProviderForecast('DLK', nowIso)] },
    },
  })

  const result = await harness.service.getAgriWeather('HCM', { forceRefresh: true })

  assert.equal(result.location.code, 'HCM')
  assert.deepEqual(new Set(harness.refreshCalls), new Set(['HCM', 'DLK']))
  assert.equal(harness.upsertedRows.length, 2)
  assert.equal(harness.insertedSnapshots.length, 2)
  assert.ok(harness.store.has('HCM'))
  assert.ok(harness.store.has('DLK'))
  assert.equal(harness.snapshotStore.length, 2)
})

test('getAgriWeather falls back to the latest historical snapshot when refresh fails and no cache row is available', async () => {
  const nowIso = '2026-05-16T05:00:00.000Z'
  const persistedPayload = createPersistedPayload('HCM', '2026-05-16T01:00:00.000Z')
  const harness = createWeatherServiceHarness({
    nowIso,
    initialSnapshots: [
      {
        province_code: 'HCM',
        snapshot_date: '2026-05-16',
        payload: persistedPayload,
        fetched_at: '2026-05-16T01:00:00.000Z',
      },
    ],
    runProvidersByCode: {
      HCM: { providerErrors: ['Open-Meteo: timeout'], forecasts: [] },
      DLK: { providerErrors: ['Open-Meteo: timeout'], forecasts: [] },
    },
  })

  const result = await harness.service.getAgriWeather('HCM')

  assert.equal(result.status, 'stale')
  assert.deepEqual(result.providerErrors, ['Open-Meteo: timeout'])
  assert.deepEqual(new Set(harness.refreshCalls), new Set(['HCM', 'DLK']))
})

test('listAgriWeatherHistory returns snapshots ordered newest first and supports date filters', async () => {
  const nowIso = '2026-05-16T06:00:00.000Z'
  const morningPayload = createPersistedPayload('HCM', '2026-05-16T01:00:00.000Z')
  const noonPayload = createPersistedPayload('HCM', '2026-05-16T05:00:00.000Z')
  const previousDayPayload = createPersistedPayload('HCM', '2026-05-15T08:00:00.000Z')
  const harness = createWeatherServiceHarness({
    nowIso,
    initialSnapshots: [
      {
        province_code: 'HCM',
        snapshot_date: '2026-05-15',
        fetched_at: '2026-05-15T08:00:00.000Z',
        payload: previousDayPayload,
      },
      {
        province_code: 'HCM',
        snapshot_date: '2026-05-16',
        fetched_at: '2026-05-16T01:00:00.000Z',
        payload: morningPayload,
      },
      {
        province_code: 'HCM',
        snapshot_date: '2026-05-16',
        fetched_at: '2026-05-16T05:00:00.000Z',
        payload: noonPayload,
      },
    ],
    runProvidersByCode: {
      HCM: { providerErrors: [], forecasts: [createProviderForecast('HCM', nowIso)] },
      DLK: { providerErrors: [], forecasts: [createProviderForecast('DLK', nowIso)] },
    },
  })

  const latestHistory = await harness.service.listAgriWeatherHistory('HCM', { limit: 2 })
  const dayHistory = await harness.service.listAgriWeatherHistory('HCM', { date: '2026-05-16', limit: 5 })

  assert.equal(latestHistory.snapshots.length, 2)
  assert.equal(latestHistory.snapshots[0]?.fetchedAt, '2026-05-16T05:00:00.000Z')
  assert.equal(latestHistory.snapshots[1]?.fetchedAt, '2026-05-16T01:00:00.000Z')
  assert.equal(dayHistory.snapshots.length, 2)
  assert.ok(dayHistory.snapshots.every(snapshot => snapshot.snapshotDate === '2026-05-16'))
})
