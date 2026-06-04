import { getAppScheduleConfig } from './appRuntimeConfig.js'
import type {
  AssminReportResponse,
  ReportFreshnessLabel,
  ReportJobRow,
  ReportSeverity,
  ReportSourceRow,
  ReportWarning,
} from './assminReportTypes.js'
import { getCrawlerScheduleConfig } from './crawlerScheduler.js'
import {
  EXCHANGE_RATE_STALE_DATA_ALERT_DAYS,
  getExchangeRateLookupResponse,
  getExchangeRateSyncRuns,
} from './exchangeRatesService.js'
import { getExportRegistryHealth } from './exportRegistry/service.js'
import { getNewsSchedulerConfig } from './news/scheduler.js'
import { getNewsHealth, getNewsRuns, getNewsSources } from './news/service.js'
import { getSupabaseRuntimeStatus } from './supabaseClient.js'
import { getVnPriceChainResponse, getVnPriceSourceStatus, getVnPrices, getWorldPricesResponse } from './supabaseMarketDataService.js'
import { getAgriWeather } from './weather/service.js'
import type { WeatherProviderId } from './weather/types.js'

const FRESH_SOURCE_WINDOW_MS = 18 * 60 * 60 * 1000
const AGING_SOURCE_WINDOW_MS = 36 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const HIGH_LATENCY_MS = 5_000
const MIN_WEATHER_HORIZON_DAYS = 3
const EXPORT_REGISTRY_STALE_MS = 36 * 60 * 60 * 1000
const SCHEDULER_STALE_WINDOW_BY_JOB_KEY: Partial<Record<string, number>> = {
  // Customs runs weekly, so 36h would create false warnings between normal runs.
  'customs-crawl': 9 * DAY_MS,
}

const WEATHER_PROVIDER_META: Record<WeatherProviderId, { label: string; url: string }> = {
  open_meteo: {
    label: 'Open-Meteo',
    url: 'https://open-meteo.com/en/docs',
  },
  met_no: {
    label: 'MET Norway',
    url: 'https://api.met.no/weatherapi/locationforecast/2.0/documentation',
  },
  weatherapi: {
    label: 'WeatherAPI',
    url: 'https://www.weatherapi.com/docs/',
  },
}

function makeWarning(code: string, severity: Exclude<ReportSeverity, 'ok'>, message: string): ReportWarning {
  return { code, severity, message }
}

function severityRank(severity: ReportSeverity) {
  switch (severity) {
    case 'critical':
      return 4
    case 'warning':
      return 3
    case 'unknown':
      return 2
    case 'ok':
    default:
      return 1
  }
}

function maxSeverity(values: ReportSeverity[]): ReportSeverity {
  return values.reduce<ReportSeverity>((highest, current) => (
    severityRank(current) > severityRank(highest) ? current : highest
  ), 'ok')
}

function toFreshnessLabel(value: string | null | undefined): ReportFreshnessLabel {
  if (!value) {
    return 'unknown'
  }

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) {
    return 'unknown'
  }

  const ageMs = Date.now() - timestamp
  if (ageMs <= FRESH_SOURCE_WINDOW_MS) {
    return 'fresh'
  }

  if (ageMs <= AGING_SOURCE_WINDOW_MS) {
    return 'aging'
  }

  return 'stale'
}

function formatTimestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('vi-VN') : 'chưa có'
}

function formatObservedDate(value: string | null | undefined) {
  if (!value) {
    return 'chưa có'
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('vi-VN')
  }

  return formatTimestamp(value)
}

function isObservedDateStale(value: string | null | undefined, staleAfterDays: number) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const observed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(observed.getTime())) {
    return false
  }

  const now = new Date()
  const nowUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const observedUtcDay = Date.UTC(observed.getUTCFullYear(), observed.getUTCMonth(), observed.getUTCDate())
  const ageDays = Math.floor((nowUtcDay - observedUtcDay) / (24 * 60 * 60 * 1000))

  return ageDays > staleAfterDays
}

function maxTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort()
    .at(-1) ?? null
}

function sourceLastUpdatedById<T extends { id: string; fetchedAt: string }>(sources: T[], id: string) {
  return maxTimestamp(sources.filter(source => source.id === id).map(source => source.fetchedAt))
}

function getFailedSourceComponents(source: { itemCount: number; metadata?: Record<string, unknown> }) {
  if (!source.metadata || !Array.isArray(source.metadata.componentStatuses)) {
    return []
  }

  const components = source.metadata.componentStatuses
    .map(entry => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const value = entry as { label?: unknown; success?: unknown; error?: unknown }
      return {
        label: typeof value.label === 'string' ? value.label : 'unknown',
        success: value.success === true,
        error: typeof value.error === 'string' ? value.error : null,
      }
    })
    .filter((entry): entry is { label: string; success: boolean; error: string | null } => Boolean(entry))

  return components.filter(entry => !entry.success && source.itemCount > 0)
}

function latestSourceById<T extends { id: string; fetchedAt: string }>(sources: T[], id: string) {
  return sources
    .filter(source => source.id === id)
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))
    .at(0) ?? null
}

function isSchedulerJobStale(jobKey: string, lastUpdated: string | null) {
  if (!lastUpdated) {
    return false
  }

  const timestamp = new Date(lastUpdated).getTime()
  if (!Number.isFinite(timestamp)) {
    return false
  }

  const staleWindowMs = SCHEDULER_STALE_WINDOW_BY_JOB_KEY[jobKey] ?? AGING_SOURCE_WINDOW_MS
  return Date.now() - timestamp > staleWindowMs
}

function isFreshTimestamp(value: string | null | undefined) {
  return toFreshnessLabel(value) !== 'stale'
}

function isSuccessfulRecentRun(run: { status: string; finishedAt?: string | null; startedAt?: string | null } | undefined) {
  if (!run || run.status !== 'success') {
    return false
  }

  return isFreshTimestamp(run.finishedAt ?? run.startedAt ?? null)
}

function schedulerStatus(enabled: boolean, lastUpdated: string | null, warnings: ReportWarning[]): ReportSeverity {
  if (warnings.some(warning => warning.severity === 'critical')) {
    return 'critical'
  }

  if (!enabled) {
    return 'warning'
  }

  if (!lastUpdated) {
    return 'unknown'
  }

  if (warnings.some(warning => warning.severity === 'warning')) {
    return 'warning'
  }

  return 'ok'
}

function buildNewsSourceRows(
  newsSources: Awaited<ReturnType<typeof getNewsSources>>,
  newsHealth: Awaited<ReturnType<typeof getNewsHealth>>,
  latestRuns: Awaited<ReturnType<typeof getNewsRuns>>,
) {
  const staleKeys = new Set(newsHealth.staleSources.map(source => source.sourceKey))
  const latestRunBySource = new Map<string, (typeof latestRuns)[number]>()

  for (const run of latestRuns) {
    if (!latestRunBySource.has(run.sourceKey)) {
      latestRunBySource.set(run.sourceKey, run)
    }
  }

  return newsSources.map<ReportSourceRow>(source => {
    const warnings: ReportWarning[] = []
    const latestRun = latestRunBySource.get(source.key)
    const hasRecentSuccessfulRun = isSuccessfulRecentRun(latestRun)
    const freshnessLabel = staleKeys.has(source.key) && !hasRecentSuccessfulRun
      ? 'stale'
      : toFreshnessLabel(source.latestDetectedAt)

    if (!source.active) {
      warnings.push(makeWarning('inactive_source', 'critical', `${source.label} đang bị tắt trong registry.`))
    }

    if (source.accessState === 'blocked') {
      warnings.push(makeWarning('blocked_access', 'critical', `${source.label} đang bị chặn truy cập.`))
    }

    if (source.accessState === 'login_required') {
      warnings.push(makeWarning('login_required', 'critical', `${source.label} yêu cầu đăng nhập.`))
    }

    if (source.accessState === 'partial') {
      warnings.push(makeWarning('partial_access', 'warning', `${source.label} chỉ truy cập được một phần.`))
    }

    if (source.browserRequired) {
      warnings.push(makeWarning('browser_required', 'warning', `${source.label} cần browser automation.`))
    }

    if (staleKeys.has(source.key) && !hasRecentSuccessfulRun) {
      warnings.push(makeWarning('stale_source', 'warning', `${source.label} đã cũ, lần phát hiện mới nhất là ${formatTimestamp(source.latestDetectedAt)}.`))
    }

    if (!source.latestDetectedAt) {
      warnings.push(makeWarning('no_latest_detected', 'warning', `${source.label} chưa có timestamp bài mới nhất.`))
    }

    if (latestRun?.status === 'failed') {
      warnings.push(makeWarning('latest_run_failed', 'warning', `${source.label} có crawl run gần nhất thất bại.`))
    } else if (latestRun?.status === 'partial') {
      warnings.push(makeWarning('latest_run_partial', 'warning', `${source.label} có crawl run gần nhất ở trạng thái partial.`))
    }

    const status: ReportSeverity =
      warnings.some(warning => warning.severity === 'critical')
        ? 'critical'
        : warnings.some(warning => warning.severity === 'warning')
          ? 'warning'
          : source.latestDetectedAt
            ? 'ok'
            : 'unknown'

    const details = [
      `Discover mode: ${source.discoverMode}`,
      `Priority: ${source.priority}`,
      `Access: ${source.accessState}`,
      `Phase: ${source.phase}`,
      `Lần crawl gần nhất: ${latestRun ? `${latestRun.status} (${formatTimestamp(latestRun.finishedAt ?? latestRun.startedAt)})` : 'chưa có'}`,
    ]
    if (staleKeys.has(source.key) && hasRecentSuccessfulRun) {
      details.push(`Bài mới nhất: ${formatTimestamp(source.latestDetectedAt)}`)
    }

    return {
      key: source.key,
      label: source.label,
      group: 'news',
      kind: 'feed',
      status,
      freshnessLabel,
      lastUpdated: source.latestDetectedAt,
      checkedAt: source.freshnessCheckedAt,
      sourceUrl: source.discoverUrl,
      details,
      warnings,
    }
  })
}

function buildVnPriceSourceRows(priceSources: Awaited<ReturnType<typeof getVnPriceSourceStatus>>) {
  return priceSources.map<ReportSourceRow>(source => {
    const warnings: ReportWarning[] = []
    const freshnessLabel = toFreshnessLabel(source.fetchedAt)
    const validationErrorCount = source.validationErrors?.length ?? 0
    const droppedCount = source.droppedCount ?? 0
    const failedComponents = getFailedSourceComponents(source)

    if (!source.success && !(failedComponents.length > 0 && source.itemCount > 0)) {
      warnings.push(makeWarning('source_failed', 'critical', `${source.label} crawl lỗi: ${source.error ?? 'không có item hợp lệ'}.`))
    }

    if (failedComponents.length > 0 && source.itemCount === 0) {
      warnings.push(
        makeWarning(
          'source_partial_failure',
          'warning',
          `${source.label} có ${failedComponents.length} crawler lỗi: ${failedComponents
            .map(component => `${component.label}${component.error ? ` (${component.error})` : ''}`)
            .join('; ')}.`,
        ),
      )
    }

    if (freshnessLabel === 'stale') {
      warnings.push(makeWarning('stale_snapshot', 'warning', `${source.label} đã quá cũ, cập nhật gần nhất ${formatTimestamp(source.fetchedAt)}.`))
    }

    if (validationErrorCount > 0 && droppedCount > 0) {
      const droppedSummary =
        droppedCount === validationErrorCount
          ? `đã loại ${droppedCount} dòng dữ liệu.`
          : `đã loại ${droppedCount} dòng dữ liệu sau validation.`

      warnings.push(
        makeWarning(
          'validation_summary',
          'warning',
          `${source.label} có ${validationErrorCount} lỗi validation và ${droppedSummary}`,
        ),
      )
    } else if (validationErrorCount > 0) {
      warnings.push(makeWarning('validation_errors', 'warning', `${source.label} có ${validationErrorCount} lỗi validation.`))
    } else if (droppedCount > 0) {
      warnings.push(makeWarning('dropped_rows', 'warning', `${source.label} đã loại ${droppedCount} dòng dữ liệu.`))
    }

    const status: ReportSeverity =
      warnings.some(warning => warning.severity === 'critical')
        ? 'critical'
        : warnings.some(warning => warning.severity === 'warning')
          ? 'warning'
          : 'ok'

    const details = [
      `Items: ${source.itemCount}`,
      `Coverage: ${source.coverage.join(', ') || 'chưa có'}`,
      `Priority: ${source.priority}`,
      `Dedup: ${source.dedupCount ?? 0}`,
    ]
    if (failedComponents.length > 0 && source.itemCount > 0) {
      details.push(
        `Crawler phụ lỗi: ${failedComponents
          .map(component => `${component.label}${component.error ? ` (${component.error})` : ''}`)
          .join('; ')}`,
      )
    }

    return {
      key: source.id,
      label: source.label,
      group: 'vn_prices',
      kind: 'crawler',
      status,
      freshnessLabel,
      lastUpdated: source.fetchedAt,
      checkedAt: source.fetchedAt,
      sourceUrl: source.url,
      details,
      warnings,
    }
  })
}

function buildWeatherSourceRows(weather: Awaited<ReturnType<typeof getAgriWeather>>) {
  const hasUsableWeatherProvider = weather.sourceStatus.some(source => source.success)
  const hasActionableWeatherFailure = weather.sourceStatus.some(source =>
    !source.success && getWeatherProviderFailureSeverity(source, hasUsableWeatherProvider) !== null
  )

  return weather.sourceStatus.map<ReportSourceRow>(source => {
    const warnings: ReportWarning[] = []
    const meta = WEATHER_PROVIDER_META[source.provider]

    if (!source.success) {
      const severity = getWeatherProviderFailureSeverity(source, hasUsableWeatherProvider)
      if (severity) {
        warnings.push(makeWarning('provider_error', severity, `${meta.label} lỗi: ${source.error ?? 'không có dữ liệu trả về'}.`))
      }
    }

    if (source.success && source.horizonDays < MIN_WEATHER_HORIZON_DAYS) {
      warnings.push(makeWarning('short_horizon', 'warning', `${meta.label} chỉ còn ${source.horizonDays} ngày forecast.`))
    }

    if (source.success && typeof source.latencyMs === 'number' && source.latencyMs > HIGH_LATENCY_MS) {
      warnings.push(makeWarning('high_latency', 'warning', `${meta.label} phản hồi chậm (${source.latencyMs}ms).`))
    }

    if (weather.status === 'partial' && hasActionableWeatherFailure) {
      warnings.push(makeWarning('weather_payload_partial', 'warning', `Weather payload hiện ở trạng thái partial cho ${weather.location.nameVi}.`))
    }

    if (weather.status === 'stale') {
      warnings.push(makeWarning('weather_payload_stale', 'warning', `Weather payload hiện đang stale cho ${weather.location.nameVi}.`))
    }

    const status: ReportSeverity =
      warnings.some(warning => warning.severity === 'critical')
        ? 'critical'
        : warnings.some(warning => warning.severity === 'warning')
          ? 'warning'
          : 'ok'

    const freshnessLabel: ReportFreshnessLabel =
      weather.status === 'stale'
        ? 'stale'
        : weather.status === 'partial'
          ? 'aging'
          : source.success
            ? 'fresh'
            : 'unknown'

    return {
      key: source.provider,
      label: meta.label,
      group: 'weather',
      kind: 'provider',
      status,
      freshnessLabel,
      lastUpdated: source.updatedAt,
      checkedAt: weather.updatedAt,
      sourceUrl: meta.url,
      details: [
        `Location: ${weather.location.nameVi}`,
        `Forecast horizon: ${source.horizonDays} ngày`,
        `Latency: ${source.latencyMs ?? '--'} ms`,
        ...(source.error ? [`Provider note: ${source.error}`] : []),
      ],
      warnings,
    }
  })
}

export function getWeatherProviderFailureSeverity(
  source: { provider: WeatherProviderId; error: string | null },
  hasUsableWeatherProvider: boolean,
): Exclude<ReportSeverity, 'ok'> | null {
  if (!hasUsableWeatherProvider) {
    return 'critical'
  }

  if (source.provider === 'weatherapi' && source.error === 'WEATHERAPI_KEY is not configured') {
    return null
  }

  if (source.provider === 'open_meteo' && /\bHTTP 429\b/i.test(source.error ?? '')) {
    return null
  }

  return 'warning'
}

function buildExportRegistrySourceRows(health: Awaited<ReturnType<typeof getExportRegistryHealth>>) {
  const sourceMeta = new Map(
    health.latestRun?.metadata?.sources?.map(source => [source.registryType, source]) ?? [],
  )

  return health.categories.map<ReportSourceRow>(category => {
    const warnings: ReportWarning[] = []
    const freshnessLabel = toFreshnessLabel(category.latestCrawledAt)
    const source = sourceMeta.get(category.key)

    if (category.count === 0) {
      warnings.push(makeWarning('export_registry_empty', 'critical', `${category.label} chua co du lieu trong Supabase.`))
    }

    if (!category.latestCrawledAt) {
      warnings.push(makeWarning('export_registry_no_crawl', 'critical', `${category.label} chua co timestamp crawl.`))
    } else if (Date.now() - new Date(category.latestCrawledAt).getTime() > EXPORT_REGISTRY_STALE_MS) {
      warnings.push(
        makeWarning('export_registry_stale', 'warning', `${category.label} da cu tu ${formatTimestamp(category.latestCrawledAt)}.`),
      )
    }

    if (source?.errors?.length) {
      warnings.push(makeWarning('export_registry_source_errors', 'warning', `${category.label} co ${source.errors.length} loi trong run gan nhat.`))
    }

    return {
      key: `export-registry-${category.key}`,
      label: category.label,
      group: 'export_registry',
      kind: 'crawler',
      status: maxSeverity(['ok', ...warnings.map(warning => warning.severity)]),
      freshnessLabel,
      lastUpdated: category.latestCrawledAt,
      checkedAt: health.latestRun?.finished_at ?? health.latestRun?.started_at ?? null,
      sourceUrl: source?.sourceUrl ?? null,
      details: [
        `Ban ghi: ${category.count}`,
        `Trang crawl gan nhat: ${source?.pageCount ?? '--'}`,
        `Dong nguon gan nhat: ${source?.itemCount ?? '--'}`,
      ],
      warnings,
    }
  })
}

function buildExportRegistryJob(
  health: Awaited<ReturnType<typeof getExportRegistryHealth>>,
  crawlerSchedule: ReturnType<typeof getCrawlerScheduleConfig>,
): ReportJobRow {
  const warnings: ReportWarning[] = []
  const latestRun = health.latestRun
  const lastUpdated = latestRun?.finished_at ?? latestRun?.started_at ?? null

  if (!crawlerSchedule.exportRegistryEnabled) {
    warnings.push(makeWarning('export_registry_scheduler_disabled', 'warning', 'Export registry crawler hien dang tat.'))
  }

  if (!latestRun) {
    warnings.push(makeWarning('export_registry_no_run', 'critical', 'Export registry crawler chua co crawl run.'))
  } else {
    if (latestRun.status === 'failed') {
      warnings.push(makeWarning('export_registry_run_failed', 'critical', `Run gan nhat that bai: ${latestRun.error_message ?? 'khong ro loi'}.`))
    } else if (latestRun.status === 'partial') {
      warnings.push(makeWarning('export_registry_run_partial', 'warning', 'Run gan nhat o trang thai partial.'))
    } else if (latestRun.status === 'running') {
      warnings.push(makeWarning('export_registry_run_running', 'warning', 'Export registry crawler dang chay.'))
    }

    if (lastUpdated && Date.now() - new Date(lastUpdated).getTime() > EXPORT_REGISTRY_STALE_MS) {
      warnings.push(makeWarning('export_registry_run_stale', 'warning', `Run gan nhat da cu tu ${formatTimestamp(lastUpdated)}.`))
    }
  }

  const details = latestRun
    ? [
        `Run: ${latestRun.status}`,
        `Nguon: ${latestRun.item_count}`,
        `Unique: ${latestRun.metadata?.uniqueItemCount ?? '--'}`,
        `Trung: ${latestRun.metadata?.duplicateItemCount ?? '--'}`,
        `Inserted: ${latestRun.inserted_count}`,
        `Updated: ${latestRun.updated_count}`,
      ]
    : ['Chua co run']

  return {
    key: 'export-registry-crawl',
    label: 'Export Registry Crawl',
    group: 'scheduler',
    status: schedulerStatus(crawlerSchedule.exportRegistryEnabled, lastUpdated, warnings),
    enabled: crawlerSchedule.exportRegistryEnabled,
    cron: crawlerSchedule.exportRegistryCron,
    lastUpdated,
    details,
    warnings,
  }
}

function buildDatasetJobs(
  vnPrices: Awaited<ReturnType<typeof getVnPrices>>,
  priceChain: Awaited<ReturnType<typeof getVnPriceChainResponse>>,
  worldPrices: Awaited<ReturnType<typeof getWorldPricesResponse>>,
  exchangeRates: Awaited<ReturnType<typeof getExchangeRateLookupResponse>>,
  appSchedule: ReturnType<typeof getAppScheduleConfig>,
) {
  const vnPriceWarnings: ReportWarning[] = []
  const vnPriceFreshness = toFreshnessLabel(vnPrices.lastUpdated)
  if (vnPrices.status === 'fallback') {
    vnPriceWarnings.push(makeWarning('vn_prices_fallback', 'critical', 'Dataset giá Việt Nam đang dùng fallback.'))
  } else if (vnPrices.status === 'cached') {
    vnPriceWarnings.push(makeWarning('vn_prices_cached', 'warning', 'Dataset giá Việt Nam đang dùng cache.'))
  }
  if (vnPriceFreshness === 'stale') {
    vnPriceWarnings.push(makeWarning('vn_prices_stale', 'warning', `Dataset giá Việt Nam đã cũ từ ${formatTimestamp(vnPrices.lastUpdated)}.`))
  }
  for (const error of vnPrices.errors) {
    vnPriceWarnings.push(makeWarning('vn_prices_error', 'warning', `VN prices: ${error}`))
  }

  const priceChainWarnings: ReportWarning[] = []
  const priceChainFreshness = toFreshnessLabel(priceChain.lastUpdated)
  if (priceChain.status === 'fallback') {
    priceChainWarnings.push(makeWarning('price_chain_fallback', 'critical', 'Chuỗi giá đang dùng fallback.'))
  }
  if (priceChainFreshness === 'stale') {
    priceChainWarnings.push(makeWarning('price_chain_stale', 'warning', `Chuỗi giá đã cũ từ ${formatTimestamp(priceChain.lastUpdated)}.`))
  }
  for (const error of priceChain.errors) {
    priceChainWarnings.push(makeWarning('price_chain_error', 'warning', `Price chain: ${error}`))
  }

  const worldWarnings: ReportWarning[] = []
  const worldFreshness = toFreshnessLabel(worldPrices.lastUpdated)
  if (worldPrices.status === 'fallback') {
    worldWarnings.push(makeWarning('world_prices_fallback', 'critical', 'Giá thế giới đang dùng fallback.'))
  } else if (worldPrices.sourceMode === 'legacy') {
    worldWarnings.push(makeWarning('world_prices_legacy', 'warning', 'Giá thế giới đang đọc từ legacy source mode.'))
  }
  if (worldFreshness === 'stale') {
    worldWarnings.push(makeWarning('world_prices_stale', 'warning', `Giá thế giới đã cũ từ ${formatTimestamp(worldPrices.lastUpdated)}.`))
  }

  const exchangeWarnings: ReportWarning[] = []
  if (exchangeRates.status === 'fallback') {
    exchangeWarnings.push(makeWarning('exchange_rates_fallback', 'critical', 'Dataset tỷ giá đang dùng fallback.'))
  }

  if (exchangeRates.items.length === 0) {
    exchangeWarnings.push(makeWarning('exchange_rates_empty', 'critical', 'Dataset tỷ giá không có đồng tiền nào.'))
  }

  if (!exchangeRates.latestObservedOn) {
    exchangeWarnings.push(makeWarning('exchange_rates_no_data_day', 'warning', 'Dataset tỷ giá chưa có ngày dữ liệu mới nhất.'))
  } else if (isObservedDateStale(exchangeRates.latestObservedOn, EXCHANGE_RATE_STALE_DATA_ALERT_DAYS)) {
    exchangeWarnings.push(
      makeWarning(
        'exchange_rates_stale',
        'warning',
        `Dataset tỷ giá đã cũ từ ${formatObservedDate(exchangeRates.latestObservedOn)}.`,
      ),
    )
  }

  for (const error of exchangeRates.errors) {
    exchangeWarnings.push(makeWarning('exchange_rates_error', 'warning', `Exchange rates: ${error}`))
  }

  return [
    {
      key: 'vn-prices-dataset',
      label: 'VN Prices',
      group: 'dataset',
      status: maxSeverity(['ok', ...vnPriceWarnings.map(warning => warning.severity)]),
      enabled: true,
      cron: appSchedule.vnPricesCron,
      lastUpdated: vnPrices.lastUpdated,
      details: [
        `Status: ${vnPrices.status}`,
        `Mặt hàng: ${vnPrices.data.length}`,
        `Nguồn snapshot: ${vnPrices.sources.length}`,
      ],
      warnings: vnPriceWarnings,
    },
    {
      key: 'vn-price-chain-dataset',
      label: 'VN Price Chain',
      group: 'dataset',
      status: maxSeverity(['ok', ...priceChainWarnings.map(warning => warning.severity)]),
      enabled: true,
      cron: null,
      lastUpdated: priceChain.lastUpdated,
      details: [
        `Status: ${priceChain.status}`,
        `Mặt hàng: ${priceChain.data.length}`,
        `Nguồn snapshot: ${priceChain.sources.length}`,
      ],
      warnings: priceChainWarnings,
    },
    {
      key: 'world-prices-dataset',
      label: 'World Prices',
      group: 'dataset',
      status: maxSeverity(['ok', ...worldWarnings.map(warning => warning.severity)]),
      enabled: appSchedule.worldPriceCrawlEnabled,
      cron: appSchedule.worldPriceCrawlCron,
      lastUpdated: worldPrices.lastUpdated,
      details: [
        `Status: ${worldPrices.status}`,
        `Source mode: ${worldPrices.sourceMode}`,
        `Mặt hàng: ${worldPrices.count}`,
      ],
      warnings: worldWarnings,
    },
    {
      key: 'exchange-rates-dataset',
      label: 'Exchange Rates',
      group: 'dataset',
      status: maxSeverity(['ok', ...exchangeWarnings.map(warning => warning.severity)]),
      enabled: appSchedule.exchangeRateSyncEnabled,
      cron: appSchedule.exchangeRateSyncCron,
      lastUpdated: exchangeRates.refreshedAt ?? null,
      details: [
        `Status: ${exchangeRates.status}`,
        `Source mode: ${exchangeRates.sourceMode}`,
        `Mặt hàng: ${exchangeRates.items.length}`,
        `Ngày dữ liệu mới nhất: ${formatObservedDate(exchangeRates.latestObservedOn)}`,
      ],
      warnings: exchangeWarnings,
    },
  ] satisfies ReportJobRow[]
}

function buildSchedulerJobs(
  newsSources: Awaited<ReturnType<typeof getNewsSources>>,
  newsRuns: Awaited<ReturnType<typeof getNewsRuns>>,
  vnPriceSources: Awaited<ReturnType<typeof getVnPriceSourceStatus>>,
  exchangeSyncRuns: Awaited<ReturnType<typeof getExchangeRateSyncRuns>>,
  datasetTimestamps?: {
    vnPricesLastUpdated?: string | null
    worldPricesLastUpdated?: string | null
    exchangeRatesLastUpdated?: string | null
  },
) {
  const appSchedule = getAppScheduleConfig()
  const crawlerSchedule = getCrawlerScheduleConfig()
  const newsSchedule = getNewsSchedulerConfig()

  const newsLastUpdated = maxTimestamp([
    newsRuns[0]?.finishedAt ?? newsRuns[0]?.startedAt ?? null,
    ...newsSources.map(source => source.latestDetectedAt),
  ])

  const newsWarnings: ReportWarning[] = []
  if (!newsSchedule.enabled) {
    newsWarnings.push(makeWarning('news_scheduler_disabled', 'warning', 'News scheduler hiện đang tắt.'))
  }
  if (!newsLastUpdated) {
    newsWarnings.push(makeWarning('news_scheduler_no_output', 'critical', 'News scheduler chưa có dấu vết đầu ra.'))
  } else if (toFreshnessLabel(newsLastUpdated) === 'stale') {
    newsWarnings.push(makeWarning('news_scheduler_stale', 'warning', `News scheduler đã cũ từ ${formatTimestamp(newsLastUpdated)}.`))
  }

  const jobs: ReportJobRow[] = [
    {
      key: 'news-scheduler',
      label: 'News Scheduler',
      group: 'scheduler',
      status: schedulerStatus(newsSchedule.enabled, newsLastUpdated, newsWarnings),
      enabled: newsSchedule.enabled,
      cron: newsSchedule.cron,
      lastUpdated: newsLastUpdated,
      details: [`Nguồn bật: ${newsSchedule.sourceKeys.join(', ') || 'chưa có'}`],
      warnings: newsWarnings,
    },
  ]

  const latestExchangeSync = exchangeSyncRuns[0]
  const exchangeSyncWarnings: ReportWarning[] = []
  if (latestExchangeSync?.status === 'failed') {
    exchangeSyncWarnings.push(
      makeWarning(
        'exchange_sync_failed',
        'critical',
        `Exchange Rates Sync thất bại: ${latestExchangeSync.error_message ?? 'không rõ lỗi'}.`,
      ),
    )
  } else if (latestExchangeSync?.status === 'partial') {
    exchangeSyncWarnings.push(makeWarning('exchange_sync_partial', 'warning', 'Exchange Rates Sync gần nhất ở trạng thái partial.'))
  } else if (latestExchangeSync?.status === 'running') {
    exchangeSyncWarnings.push(makeWarning('exchange_sync_running', 'warning', 'Exchange Rates Sync đang chạy.'))
  }

  if ((latestExchangeSync?.error_count ?? 0) > 0) {
    exchangeSyncWarnings.push(
      makeWarning('exchange_sync_error_count', 'warning', `Exchange Rates Sync có ${latestExchangeSync?.error_count} lỗi trong run gần nhất.`),
    )
  }

  const crawlerJobs: Array<{
    key: string
    label: string
    enabled: boolean
    cron: string | null
    lastUpdated: string | null
    details: string[]
    warnings: ReportWarning[]
  }> = [
    {
      key: 'bhx-crawl',
      label: 'BHX Crawl',
      enabled: crawlerSchedule.bhxCrawlEnabled,
      cron: crawlerSchedule.bhxCrawlCron,
      lastUpdated: sourceLastUpdatedById(vnPriceSources, 'bhx'),
      details: [`Regions: ${crawlerSchedule.bhxEnabledRegions.join(', ')}`],
      warnings: [],
    },
    {
      key: 'coop-crawl',
      label: 'Co.op Crawl',
      enabled: crawlerSchedule.coopCrawlEnabled,
      cron: crawlerSchedule.coopCrawlCron,
      lastUpdated: sourceLastUpdatedById(vnPriceSources, 'coop'),
      details: [`Regions: ${crawlerSchedule.coopEnabledRegions.join(', ')}`],
      warnings: [],
    },
    {
      key: 'customs-crawl',
      label: 'Customs Crawl',
      enabled: crawlerSchedule.customsEnabled,
      cron: crawlerSchedule.customsCron,
      lastUpdated: sourceLastUpdatedById(vnPriceSources, 'customs'),
      details: ['Nguồn dữ liệu hải quan/export'],
      warnings: [],
    },
    {
      key: 'vn-prices-refresh',
      label: 'VN Prices Refresh',
      enabled: true,
      cron: appSchedule.vnPricesCron,
      lastUpdated: datasetTimestamps?.vnPricesLastUpdated ?? maxTimestamp(vnPriceSources.map(source => source.fetchedAt)),
      details: [`Timezone: ${appSchedule.timezone}`],
      warnings: [],
    },
    {
      key: 'world-prices-refresh',
      label: 'World Prices Refresh',
      enabled: appSchedule.worldPriceCrawlEnabled,
      cron: appSchedule.worldPriceCrawlCron,
      lastUpdated: datasetTimestamps?.worldPricesLastUpdated ?? null,
      details: [`Timezone: ${appSchedule.timezone}`],
      warnings: [],
    },
    {
      key: 'exchange-rates-sync',
      label: 'Exchange Rates Sync',
      enabled: appSchedule.exchangeRateSyncEnabled,
      cron: appSchedule.exchangeRateSyncCron,
      lastUpdated:
        datasetTimestamps?.exchangeRatesLastUpdated ??
        latestExchangeSync?.finished_at ??
        latestExchangeSync?.started_at ??
        null,
      details: [
        `Timezone: ${appSchedule.timezone}`,
        `Backfill days: ${appSchedule.exchangeRateBackfillDays}`,
      ],
      warnings: exchangeSyncWarnings,
    },
  ]

  for (const job of crawlerJobs) {
    const sourceId =
      job.key === 'bhx-crawl'
        ? 'bhx'
        : job.key === 'coop-crawl'
          ? 'coop'
          : job.key === 'customs-crawl'
            ? 'customs'
            : null
    const latestSource = sourceId ? latestSourceById(vnPriceSources, sourceId) : null

    if (!job.enabled) {
      job.warnings.push(makeWarning('job_disabled', 'warning', `${job.label} hiện đang tắt.`))
    }

    if (latestSource && !latestSource.success) {
      job.warnings.push(makeWarning('job_latest_failed', 'critical', `${job.label} run gần nhất thất bại.`))
    }

    if (!job.lastUpdated && job.enabled) {
      job.warnings.push(makeWarning('job_no_output', 'critical', `${job.label} chưa có timestamp đầu ra.`))
    } else if (job.lastUpdated && isSchedulerJobStale(job.key, job.lastUpdated)) {
      job.warnings.push(makeWarning('job_stale', 'warning', `${job.label} đã cũ từ ${formatTimestamp(job.lastUpdated)}.`))
    }

    jobs.push({
      key: job.key,
      label: job.label,
      group: 'scheduler',
      status: schedulerStatus(job.enabled, job.lastUpdated, job.warnings),
      enabled: job.enabled,
      cron: job.cron,
      lastUpdated: job.lastUpdated,
      details: job.details,
      warnings: job.warnings,
    })
  }

  return jobs
}

export async function getAssminReport(): Promise<AssminReportResponse> {
  const runtime = getSupabaseRuntimeStatus()
  const generatedAt = new Date().toISOString()
  const globalWarnings: ReportWarning[] = []

  if (!runtime.hasSupabaseReadConfig) {
    globalWarnings.push(makeWarning('supabase_read_missing', 'critical', 'Supabase read config đang thiếu.'))
  }

  if (runtime.missingServiceRole) {
    globalWarnings.push(makeWarning('supabase_service_role_missing', 'warning', 'Supabase service role key đang thiếu.'))
  }

  const [
    newsSourcesResult,
    newsHealthResult,
    newsRunsResult,
    vnPriceSourcesResult,
    vnPricesResult,
    priceChainResult,
    worldPricesResult,
    exchangeRatesResult,
    exchangeSyncRunsResult,
    weatherResult,
    exportRegistryHealthResult,
  ] = await Promise.allSettled([
    getNewsSources(),
    getNewsHealth(),
    getNewsRuns(),
    getVnPriceSourceStatus(),
    getVnPrices(false),
    getVnPriceChainResponse(),
    getWorldPricesResponse(false),
    getExchangeRateLookupResponse({ days: 365 }),
    getExchangeRateSyncRuns(20),
    getAgriWeather(null),
    getExportRegistryHealth(),
  ])

  const sources: ReportSourceRow[] = []
  const jobs: ReportJobRow[] = []

  const newsSources = newsSourcesResult.status === 'fulfilled' ? newsSourcesResult.value : []
  const newsRuns = newsRunsResult.status === 'fulfilled' ? newsRunsResult.value : []
  const vnPriceSources = vnPriceSourcesResult.status === 'fulfilled' ? vnPriceSourcesResult.value : []
  const exchangeSyncRuns = exchangeSyncRunsResult.status === 'fulfilled' ? exchangeSyncRunsResult.value : []

  if (newsSourcesResult.status === 'fulfilled' && newsHealthResult.status === 'fulfilled') {
    sources.push(...buildNewsSourceRows(newsSourcesResult.value, newsHealthResult.value, newsRuns))
  } else {
    globalWarnings.push(makeWarning('news_report_unavailable', 'critical', 'Không thể tải trạng thái nguồn news.'))
  }

  if (vnPriceSourcesResult.status === 'fulfilled') {
    sources.push(...buildVnPriceSourceRows(vnPriceSourcesResult.value))
  } else {
    globalWarnings.push(makeWarning('vn_price_sources_unavailable', 'critical', 'Không thể tải source snapshot cho giá Việt Nam.'))
  }

  if (weatherResult.status === 'fulfilled') {
    sources.push(...buildWeatherSourceRows(weatherResult.value))
  } else {
    globalWarnings.push(makeWarning('weather_report_unavailable', 'warning', 'Không thể tải trạng thái weather providers.'))
  }

  if (exportRegistryHealthResult.status === 'fulfilled') {
    sources.push(...buildExportRegistrySourceRows(exportRegistryHealthResult.value))
  } else {
    globalWarnings.push(makeWarning('export_registry_report_unavailable', 'warning', 'Khong the tai trang thai export registry.'))
  }

  if (exchangeSyncRunsResult.status !== 'fulfilled') {
    globalWarnings.push(makeWarning('exchange_sync_runs_unavailable', 'warning', 'Khong the tai lich su run dong bo ty gia.'))
  }

  if (
    newsSourcesResult.status === 'fulfilled' &&
    newsRunsResult.status === 'fulfilled' &&
    vnPriceSourcesResult.status === 'fulfilled'
  ) {
    jobs.push(...buildSchedulerJobs(newsSources, newsRuns, vnPriceSources, exchangeSyncRuns, {
      vnPricesLastUpdated: vnPricesResult.status === 'fulfilled' ? vnPricesResult.value.lastUpdated : null,
      worldPricesLastUpdated: worldPricesResult.status === 'fulfilled' ? worldPricesResult.value.lastUpdated : null,
      exchangeRatesLastUpdated: exchangeRatesResult.status === 'fulfilled' ? exchangeRatesResult.value.refreshedAt : null,
    }))
  } else {
    globalWarnings.push(makeWarning('scheduler_report_partial', 'warning', 'Không thể dựng đầy đủ scheduler/runtime report.'))
  }

  if (exportRegistryHealthResult.status === 'fulfilled') {
    jobs.push(buildExportRegistryJob(exportRegistryHealthResult.value, getCrawlerScheduleConfig()))
  }

  if (
    vnPricesResult.status === 'fulfilled' &&
    priceChainResult.status === 'fulfilled' &&
    worldPricesResult.status === 'fulfilled' &&
    exchangeRatesResult.status === 'fulfilled'
  ) {
    jobs.push(
      ...buildDatasetJobs(
        vnPricesResult.value,
        priceChainResult.value,
        worldPricesResult.value,
        exchangeRatesResult.value,
        getAppScheduleConfig(),
      ),
    )
  } else {
    globalWarnings.push(makeWarning('dataset_report_partial', 'warning', 'Không thể dựng đầy đủ dataset health report.'))
  }

  const warnings = [...globalWarnings, ...sources.flatMap(source => source.warnings), ...jobs.flatMap(job => job.warnings)]
  const overallStatus = maxSeverity([
    ...sources.map(source => source.status),
    ...jobs.map(job => job.status),
    ...warnings.map(warning => warning.severity),
  ])

  return {
    generatedAt,
    overallStatus,
    runtime,
    sources,
    jobs,
    warnings,
  }
}
