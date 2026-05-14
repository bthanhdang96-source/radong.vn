import cron from 'node-cron'
import { crawlNewsSources } from './service.js'
import { NEWS_SOURCE_KEYS, listVisibleNewsSourceConfigs } from './sourceRegistry.js'
import type { NewsSourceKey } from './types.js'

let registered = false
const DEFAULT_SOURCE_KEYS = listVisibleNewsSourceConfigs().map(source => source.key)

function getEnabledSourceKeys(): NewsSourceKey[] {
  const raw = process.env.NEWS_ENABLED_SOURCES?.trim()
  if (!raw) {
    return DEFAULT_SOURCE_KEYS
  }

  const requested = raw
    .split(',')
    .map(value => value.trim())
    .filter((value): value is NewsSourceKey => NEWS_SOURCE_KEYS.includes(value as NewsSourceKey))

  return requested.length > 0 ? requested : DEFAULT_SOURCE_KEYS
}

export function getNewsSchedulerConfig() {
  return {
    enabled: process.env.NEWS_CRAWL_ENABLED !== 'false',
    cron: process.env.NEWS_CRAWL_CRON ?? '0 */6 * * *',
    sourceKeys: getEnabledSourceKeys(),
  }
}

export function registerNewsScheduler() {
  if (registered) {
    return
  }

  const config = getNewsSchedulerConfig()
  if (!config.enabled) {
    return
  }

  cron.schedule(config.cron, async () => {
    try {
      console.log(`[News] Scheduled crawl started (${config.cron})`)
      await crawlNewsSources(config.sourceKeys)
      console.log('[News] Scheduled crawl completed')
    } catch (error) {
      console.error('[News] Scheduled crawl failed:', error)
    }
  })

  registered = true
}
