import type {
  DailyComparisonRow,
  ForecastDay,
  ForecastHour,
  WeatherCurrentSummary,
  WeatherProviderDailyForecast,
  WeatherProviderForecast,
  WeatherProviderHourlyForecast,
  WeatherProviderId,
} from './types.js'
import {
  averageNumbers,
  getAgreementLevel,
  getProviderPriority,
  pickConsensusCondition,
  uniqueSorted,
} from './utils.js'

function sortProviders<T extends { provider: WeatherProviderId }>(values: T[]) {
  return [...values].sort((left, right) => getProviderPriority(left.provider) - getProviderPriority(right.provider))
}

export function buildHourlyConsensus(forecasts: WeatherProviderForecast[], limit = 72): ForecastHour[] {
  const hourlyMaps = forecasts.map(forecast => ({
    provider: forecast.provider,
    entries: new Map(forecast.hourly.map(entry => [entry.time, entry])),
  }))

  const timeline = uniqueSorted(forecasts.flatMap(forecast => forecast.hourly.map(entry => entry.time))).slice(0, limit)

  return timeline.map(time => {
    const providers = sortProviders(
      hourlyMaps
        .map(record => ({
          provider: record.provider,
          entry: record.entries.get(time) ?? null,
        }))
        .filter((record): record is { provider: WeatherProviderId; entry: WeatherProviderHourlyForecast } => record.entry !== null),
    )

    return {
      time,
      tempC: averageNumbers(providers.map(provider => provider.entry.tempC)),
      humidityPct: averageNumbers(providers.map(provider => provider.entry.humidityPct)),
      rainMm: averageNumbers(providers.map(provider => provider.entry.rainMm)),
      rainProbabilityPct: averageNumbers(providers.map(provider => provider.entry.rainProbabilityPct), 0),
      windKph: averageNumbers(providers.map(provider => provider.entry.windKph)),
      uv: averageNumbers(providers.map(provider => provider.entry.uv)),
      conditionKey: pickConsensusCondition(
        providers.map(provider => ({
          provider: provider.provider,
          conditionKey: provider.entry.conditionKey,
        })),
      ),
      providerCount: providers.length,
      agreement: getAgreementLevel(
        providers.map(provider => provider.entry.tempC),
        providers.map(provider => provider.entry.rainMm),
        {
          highTemp: 1.5,
          mediumTemp: 3,
          highRain: 3,
          mediumRain: 8,
        },
      ),
    }
  })
}

export function buildDailyConsensus(forecasts: WeatherProviderForecast[], limit = 7): ForecastDay[] {
  const dailyMaps = forecasts.map(forecast => ({
    provider: forecast.provider,
    entries: new Map(forecast.daily.map(entry => [entry.date, entry])),
  }))

  const dates = uniqueSorted(forecasts.flatMap(forecast => forecast.daily.map(entry => entry.date))).slice(0, limit)

  return dates.map(date => {
    const providers = sortProviders(
      dailyMaps
        .map(record => ({
          provider: record.provider,
          entry: record.entries.get(date) ?? null,
        }))
        .filter((record): record is { provider: WeatherProviderId; entry: WeatherProviderDailyForecast } => record.entry !== null),
    )

    return {
      date,
      tempMinC: averageNumbers(providers.map(provider => provider.entry.tempMinC)),
      tempMaxC: averageNumbers(providers.map(provider => provider.entry.tempMaxC)),
      humidityAvgPct: averageNumbers(providers.map(provider => provider.entry.humidityAvgPct)),
      rainMm: averageNumbers(providers.map(provider => provider.entry.rainMm)),
      rainProbabilityPct: averageNumbers(providers.map(provider => provider.entry.rainProbabilityPct), 0),
      windMaxKph: averageNumbers(providers.map(provider => provider.entry.windMaxKph)),
      uvMax: averageNumbers(providers.map(provider => provider.entry.uvMax)),
      et0Mm: averageNumbers(providers.map(provider => provider.entry.et0Mm)),
      providerCount: providers.length,
      agreement: getAgreementLevel(
        providers.map(provider => provider.entry.tempMaxC),
        providers.map(provider => provider.entry.rainMm),
        {
          highTemp: 2,
          mediumTemp: 4,
          highRain: 5,
          mediumRain: 15,
        },
      ),
      conditionKey: pickConsensusCondition(
        providers.map(provider => ({
          provider: provider.provider,
          conditionKey: provider.entry.conditionKey,
        })),
      ),
    }
  })
}

export function buildCurrentConsensus(
  forecasts: WeatherProviderForecast[],
  hourly72h: ForecastHour[],
): WeatherCurrentSummary | null {
  const currentProviders = sortProviders(
    forecasts
      .map(forecast => ({
        provider: forecast.provider,
        current: forecast.current ?? forecast.hourly[0] ?? null,
      }))
      .filter(
        (record): record is {
          provider: WeatherProviderId
          current: NonNullable<WeatherProviderForecast['current']> | WeatherProviderHourlyForecast
        } => record.current !== null,
      ),
  )

  if (currentProviders.length === 0) {
    return hourly72h[0]
      ? {
          time: hourly72h[0].time,
          tempC: hourly72h[0].tempC,
          humidityPct: hourly72h[0].humidityPct,
          rainMm: hourly72h[0].rainMm,
          windKph: hourly72h[0].windKph,
          uv: hourly72h[0].uv,
          conditionKey: hourly72h[0].conditionKey,
          providerCount: hourly72h[0].providerCount,
          agreement: hourly72h[0].agreement,
        }
      : null
  }

  return {
    time: currentProviders[0].current.time,
    tempC: averageNumbers(currentProviders.map(provider => provider.current.tempC)),
    humidityPct: averageNumbers(currentProviders.map(provider => provider.current.humidityPct)),
    rainMm: averageNumbers(currentProviders.map(provider => provider.current.rainMm)),
    windKph: averageNumbers(currentProviders.map(provider => provider.current.windKph)),
    uv: averageNumbers(currentProviders.map(provider => provider.current.uv)),
    conditionKey: pickConsensusCondition(
      currentProviders.map(provider => ({
        provider: provider.provider,
        conditionKey: provider.current.conditionKey,
      })),
    ),
    providerCount: currentProviders.length,
    agreement: getAgreementLevel(
      currentProviders.map(provider => provider.current.tempC),
      currentProviders.map(provider => provider.current.rainMm),
      {
        highTemp: 1.5,
        mediumTemp: 3,
        highRain: 3,
        mediumRain: 8,
      },
    ),
  }
}

export function buildDailyComparisonRows(
  forecasts: WeatherProviderForecast[],
  consensus: ForecastDay[],
): DailyComparisonRow[] {
  const maps = forecasts.map(forecast => ({
    provider: forecast.provider,
    entries: new Map(forecast.daily.map(entry => [entry.date, entry])),
  }))

  return consensus.map(day => ({
    date: day.date,
    providerCount: day.providerCount,
    agreement: day.agreement,
    consensus: day,
    providers: maps
      .map(record => ({
        provider: record.provider,
        entry: record.entries.get(day.date) ?? null,
      }))
      .filter((record): record is { provider: WeatherProviderId; entry: WeatherProviderDailyForecast } => record.entry !== null)
      .sort((left, right) => getProviderPriority(left.provider) - getProviderPriority(right.provider))
      .map(record => ({
        provider: record.provider,
        tempMinC: record.entry.tempMinC,
        tempMaxC: record.entry.tempMaxC,
        rainMm: record.entry.rainMm,
        rainProbabilityPct: record.entry.rainProbabilityPct,
        windMaxKph: record.entry.windMaxKph,
        uvMax: record.entry.uvMax,
        conditionKey: record.entry.conditionKey,
      })),
  }))
}
