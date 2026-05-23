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

export function getAppScheduleConfig() {
  return {
    vnPricesCron: process.env.VN_PRICE_CRON ?? '0 8,14 * * *',
    priceContentEnabled: parseBoolean(process.env.PRICE_CONTENT_ENABLED, true),
    priceContentCron: process.env.PRICE_CONTENT_CRON ?? '10 8,14 * * *',
    priceContentStaleHours: Number(process.env.PRICE_CONTENT_STALE_HOURS ?? 36),
    worldPriceCrawlEnabled: parseBoolean(process.env.WORLD_PRICE_CRAWL_ENABLED, true),
    worldPriceCrawlCron: process.env.WORLD_PRICE_CRAWL_CRON ?? '30 7,13 * * *',
    aiArticleEnabled: parseBoolean(process.env.AI_ARTICLE_ENABLED, false),
    aiArticleExportCron: process.env.AI_ARTICLE_EXPORT_CRON ?? '45 8 * * *',
    aiArticleWorldDailyCron: process.env.AI_ARTICLE_WORLD_DAILY_CRON ?? '45 7,13 * * *',
    timezone: process.env.TZ ?? 'UTC',
  }
}
