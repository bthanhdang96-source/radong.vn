import cron from 'node-cron'
import { retryCrawlerResult } from './crawlers/common.js'
import { crawlBhx } from './crawlers/bhxCrawler.js'
import { crawlCoop } from './crawlers/coopCrawler.js'
import { crawlCustoms } from './crawlers/customsCrawler.js'
import { crawlShopee } from './crawlers/shopeeCrawler.js'
import type { CrawlerResult } from './crawlers/types.js'
import { ensureFreshShopeeSession, readShopeeSessionMetadata } from './crawlers/shopeeSession.js'
import { syncCrawlerResultToSupabase } from './ingestion/sourceSync.js'
import { hasSupabaseAdminConfig } from './supabaseClient.js'

type CrawlerScheduleConfig = {
  bhxCrawlEnabled: boolean
  bhxCrawlCron: string
  bhxDryRun: boolean
  bhxEnabledRegions: string[]
  coopCrawlEnabled: boolean
  coopCrawlCron: string
  coopDryRun: boolean
  coopEnabledRegions: string[]
  coopEnabledCategories: string[]
  coopMaxPagesPerCategory: number
  shopeeRefreshEnabled: boolean
  shopeeRefreshCron: string
  shopeeCrawlEnabled: boolean
  shopeeCrawlCron: string
  shopeeDryRun: boolean
  shopeeBlockCooldownMinutes: number
  customsEnabled: boolean
  customsCron: string
  customsDryRun: boolean
}

const DEFAULT_BHX_CRAWL_CRON = '15 6,14 * * *'
const DEFAULT_COOP_CRAWL_CRON = '20 6,14 * * *'
const DEFAULT_SHOPEE_REFRESH_CRON = '0 */6 * * *'
const DEFAULT_SHOPEE_CRAWL_CRON = '15 6,14 * * *'
const DEFAULT_CUSTOMS_CRON = '0 8 * * 3'
const DEFAULT_SHOPEE_BLOCK_COOLDOWN_MINUTES = 180

const runningJobs = new Set<string>()
let schedulesRegistered = false

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
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : defaultValue
}

function parseCsvUppercase(value: string | undefined, fallback: string[]) {
  const raw = value?.trim()
  if (!raw) {
    return fallback
  }

  return raw
    .split(',')
    .map(entry => entry.trim().toUpperCase())
    .filter(Boolean)
}

function parseCsvCategorySlugs(value: string | undefined, fallback: string[]) {
  const raw = value?.trim()
  if (!raw) {
    return fallback
  }

  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => (entry.startsWith('/c/') ? entry : `/c/${entry.replace(/^\/+/, '')}`))
}

export function getCrawlerScheduleConfig(): CrawlerScheduleConfig {
  const shopeeSchedulerEnabled = parseBoolean(process.env.SHOPEE_SCHEDULER_ENABLED, false)
  const bhxRequested = parseBoolean(process.env.BHX_CRAWL_ENABLED, true)
  return {
    bhxCrawlEnabled: bhxRequested,
    bhxCrawlCron: process.env.BHX_CRAWL_CRON?.trim() || DEFAULT_BHX_CRAWL_CRON,
    bhxDryRun: parseBoolean(process.env.BHX_SCHEDULE_DRY_RUN, false),
    bhxEnabledRegions: parseCsvUppercase(process.env.BHX_ENABLED_REGIONS, ['HCM']),
    coopCrawlEnabled: parseBoolean(process.env.COOP_CRAWL_ENABLED, true),
    coopCrawlCron: process.env.COOP_CRAWL_CRON?.trim() || DEFAULT_COOP_CRAWL_CRON,
    coopDryRun: parseBoolean(process.env.COOP_SCHEDULE_DRY_RUN, false),
    coopEnabledRegions: parseCsvUppercase(process.env.COOP_ENABLED_REGIONS, ['HCM', 'HNI', 'DNG']),
    coopEnabledCategories: parseCsvCategorySlugs(process.env.COOP_ENABLED_CATEGORIES, [
      '/c/rau-cu',
      '/c/trai-cay',
      '/c/thit',
      '/c/thuy-hai-san',
    ]),
    coopMaxPagesPerCategory: parsePositiveInteger(process.env.COOP_MAX_PAGES_PER_CATEGORY, 2) || 2,
    shopeeRefreshEnabled: parseBoolean(process.env.SHOPEE_SESSION_REFRESH_ENABLED, shopeeSchedulerEnabled),
    shopeeRefreshCron: process.env.SHOPEE_REFRESH_CRON?.trim() || DEFAULT_SHOPEE_REFRESH_CRON,
    shopeeCrawlEnabled: parseBoolean(process.env.SHOPEE_CRAWL_ENABLED, shopeeSchedulerEnabled),
    shopeeCrawlCron: process.env.SHOPEE_CRAWL_CRON?.trim() || DEFAULT_SHOPEE_CRAWL_CRON,
    shopeeDryRun: parseBoolean(process.env.SHOPEE_SCHEDULE_DRY_RUN, false),
    shopeeBlockCooldownMinutes: parsePositiveInteger(
      process.env.SHOPEE_BLOCK_COOLDOWN_MINUTES,
      DEFAULT_SHOPEE_BLOCK_COOLDOWN_MINUTES,
    ),
    customsEnabled: parseBoolean(process.env.CUSTOMS_SCHEDULER_ENABLED, true),
    customsCron: process.env.CUSTOMS_CRAWL_CRON?.trim() || DEFAULT_CUSTOMS_CRON,
    customsDryRun: parseBoolean(process.env.CUSTOMS_SCHEDULE_DRY_RUN, false),
  }
}

async function runExclusive(jobName: string, job: () => Promise<void>) {
  if (runningJobs.has(jobName)) {
    console.log(`[Crawler Scheduler] Skip ${jobName}: previous run still in progress`)
    return
  }

  runningJobs.add(jobName)
  try {
    await job()
  } finally {
    runningJobs.delete(jobName)
  }
}

function shouldSkipShopeeCrawlForCooldown(metadata: Awaited<ReturnType<typeof readShopeeSessionMetadata>>, cooldownMinutes: number) {
  if (metadata.status !== 'blocked' || cooldownMinutes <= 0) {
    return false
  }

  const checkedAt = new Date(metadata.checkedAt)
  if (Number.isNaN(checkedAt.getTime())) {
    return false
  }

  const cooldownEndsAt = new Date(checkedAt)
  cooldownEndsAt.setMinutes(cooldownEndsAt.getMinutes() + cooldownMinutes)
  return cooldownEndsAt.getTime() > Date.now()
}

async function syncCrawlerResult(
  jobName: string,
  dryRun: boolean,
  result: CrawlerResult,
) {
  const source = result.sources[0]
  console.log(`[${jobName}] success=${source?.success ?? false} items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[${jobName}] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[${jobName}] error=${source?.error ?? 'No items parsed'}`)
    return
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[${jobName}] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[${jobName}] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

export async function runShopeeSessionRefreshJob(trigger = 'manual') {
  await runExclusive('shopee-session-refresh', async () => {
    console.log(`[Shopee Session Refresh] started (${trigger})`)
    try {
      const metadata = await ensureFreshShopeeSession({
        force: true,
      })
      console.log(
        `[Shopee Session Refresh] status=${metadata.status} refreshedAt=${metadata.refreshedAt ?? 'n/a'} expiresAt=${metadata.expiresAt ?? 'n/a'}`,
      )
      if (metadata.message) {
        console.log(`[Shopee Session Refresh] message=${metadata.message}`)
      }
    } catch (error) {
      console.error('[Shopee Session Refresh] failed:', error)
    }
  })
}

export async function runShopeeCrawlJob(trigger = 'manual') {
  const config = getCrawlerScheduleConfig()
  await runExclusive('shopee-crawl', async () => {
    const sessionMetadata = await readShopeeSessionMetadata()
    if (shouldSkipShopeeCrawlForCooldown(sessionMetadata, config.shopeeBlockCooldownMinutes)) {
      console.log(
        `[Shopee Crawl] skipped (${trigger}) because session status is blocked and cooldown ${config.shopeeBlockCooldownMinutes}m is still active`,
      )
      return
    }

    console.log(`[Shopee Crawl] started (${trigger})`)
    const result = await retryCrawlerResult(() => crawlShopee())
    await syncCrawlerResult('Shopee Crawl', config.shopeeDryRun, result)
  })
}

export async function runBhxCrawlJob(trigger = 'manual') {
  const config = getCrawlerScheduleConfig()
  await runExclusive('bhx-crawl', async () => {
    console.log(`[BHX Crawl] started (${trigger})`)
    const result = await retryCrawlerResult(() =>
      crawlBhx({
        regionCodes: config.bhxEnabledRegions,
      }),
    )
    await syncCrawlerResult('BHX Crawl', config.bhxDryRun, result)
  })
}

export async function runCoopCrawlJob(trigger = 'manual') {
  const config = getCrawlerScheduleConfig()
  await runExclusive('coop-crawl', async () => {
    console.log(`[Co.op Crawl] started (${trigger})`)
    const result = await retryCrawlerResult(() =>
      crawlCoop({
        regionCodes: config.coopEnabledRegions,
        categorySlugs: config.coopEnabledCategories,
        maxPagesPerCategory: config.coopMaxPagesPerCategory,
      }),
    )
    await syncCrawlerResult('Co.op Crawl', config.coopDryRun, result)
  })
}

export async function runCustomsCrawlJob(trigger = 'manual') {
  const config = getCrawlerScheduleConfig()
  await runExclusive('customs-crawl', async () => {
    console.log(`[Customs Crawl] started (${trigger})`)
    const result = await retryCrawlerResult(() => crawlCustoms())
    await syncCrawlerResult('Customs Crawl', config.customsDryRun, result)
  })
}

function registerSchedule(jobName: string, cronExpression: string, handler: () => Promise<void>) {
  if (!cron.validate(cronExpression)) {
    console.error(`[Crawler Scheduler] Invalid cron for ${jobName}: ${cronExpression}`)
    return
  }

  cron.schedule(cronExpression, () => {
    void handler()
  })
  console.log(`[Crawler Scheduler] Scheduled ${jobName} with cron "${cronExpression}"`)
}

export function registerCrawlerSchedules() {
  if (schedulesRegistered) {
    return
  }

  schedulesRegistered = true
  const config = getCrawlerScheduleConfig()

  if (config.bhxCrawlEnabled) {
    registerSchedule('bhx-crawl', config.bhxCrawlCron, () => runBhxCrawlJob(`cron:${config.bhxCrawlCron}`))
  } else {
    console.log('[Crawler Scheduler] BHX crawl schedule is disabled')
  }

  if (config.coopCrawlEnabled) {
    registerSchedule('coop-crawl', config.coopCrawlCron, () => runCoopCrawlJob(`cron:${config.coopCrawlCron}`))
  } else {
    console.log('[Crawler Scheduler] Co.op crawl schedule is disabled')
  }

  if (config.shopeeRefreshEnabled) {
    registerSchedule('shopee-session-refresh', config.shopeeRefreshCron, () =>
      runShopeeSessionRefreshJob(`cron:${config.shopeeRefreshCron}`),
    )
    registerSchedule('shopee-crawl', config.shopeeCrawlCron, () => runShopeeCrawlJob(`cron:${config.shopeeCrawlCron}`))
  } else {
    console.log('[Crawler Scheduler] Shopee session refresh and crawl schedules are disabled')
  }

  if (config.customsEnabled) {
    registerSchedule('customs-crawl', config.customsCron, () => runCustomsCrawlJob(`cron:${config.customsCron}`))
  } else {
    console.log('[Crawler Scheduler] Customs crawl schedule is disabled')
  }
}
