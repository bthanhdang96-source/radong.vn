function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (!value) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  return defaultValue
}

function parsePositiveInteger(value: string | undefined, defaultValue: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : defaultValue
}

export function getAppScheduleConfig() {
  return {
    vnPricesCron: process.env.VN_PRICE_CRON ?? '0 8,14 * * *',
    priceContentEnabled: parseBoolean(process.env.PRICE_CONTENT_ENABLED, true),
    priceContentCron: process.env.PRICE_CONTENT_CRON ?? '10 8,14 * * *',
    priceContentStaleHours: Number(process.env.PRICE_CONTENT_STALE_HOURS ?? 36),
    worldPriceCrawlEnabled: parseBoolean(process.env.WORLD_PRICE_CRAWL_ENABLED, true),
    worldPriceCrawlCron: process.env.WORLD_PRICE_CRAWL_CRON ?? '30 7,13 * * *',
    worldCoffeeBenchmarkSyncEnabled: parseBoolean(process.env.WORLD_COFFEE_BENCHMARK_SYNC_ENABLED, false),
    worldCoffeeBenchmarkSyncCron: process.env.WORLD_COFFEE_BENCHMARK_SYNC_CRON ?? '55 7 * * *',
    exchangeRateSyncEnabled: parseBoolean(process.env.EXCHANGE_RATE_SYNC_ENABLED, true),
    exchangeRateSyncCron: process.env.EXCHANGE_RATE_SYNC_CRON ?? '15 8 * * *',
    exchangeRateBackfillDays: parsePositiveInteger(process.env.EXCHANGE_RATE_BACKFILL_DAYS, 1),
    aiArticleEnabled: parseBoolean(process.env.AI_ARTICLE_ENABLED, false),
    aiArticleExportCron: process.env.AI_ARTICLE_EXPORT_CRON ?? '45 8 * * *',
    aiArticleWorldDailyCron: process.env.AI_ARTICLE_WORLD_DAILY_CRON ?? '45 7,13 * * *',
    aiBlogEnabled: parseBoolean(process.env.AI_BLOG_ENABLED, false),
    aiBlogCron: process.env.AI_BLOG_CRON ?? '30 9 * * *',
    aiBlogDailyLimit: parsePositiveInteger(process.env.AI_BLOG_DAILY_LIMIT, 3),
    timezone: process.env.TZ ?? 'UTC',
  }
}
