import cron from 'node-cron'
import { crawlCustoms } from './crawlers/customsCrawler.js'
import { crawlShopee } from './crawlers/shopeeCrawler.js'
import { ensureFreshShopeeSession, readShopeeSessionMetadata } from './crawlers/shopeeSession.js'
import { syncCrawlerResultToSupabase } from './ingestion/sourceSync.js'
import { hasSupabaseAdminConfig } from './supabaseClient.js'

type CrawlerScheduleConfig = {
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

export function getCrawlerScheduleConfig(): CrawlerScheduleConfig {
  const shopeeSchedulerEnabled = parseBoolean(process.env.SHOPEE_SCHEDULER_ENABLED, false)
  return {
    shopeeRefreshEnabled: parseBoolean(process.env.SHOPEE_SESSION_REFRESH_ENABLED, shopeeSchedulerEnabled),
    shopeeRefreshCron: process.env.SHOPEE_REFRESH_CRON?.trim() || DEFAULT_SHOPEE_REFRESH_CRON,
    shopeeCrawlEnabled: parseBoolean(process.env.SHOPEE_CRAWL_ENABLED, shopeeSchedulerEnabled),
    shopeeCrawlCron: process.env.SHOPEE_CRAWL_CRON?.trim() || DEFAULT_SHOPEE_CRAWL_CRON,
    shopeeDryRun: parseBoolean(process.env.SHOPEE_SCHEDULE_DRY_RUN, false),
    shopeeBlockCooldownMinutes: parsePositiveInteger(
      process.env.SHOPEE_BLOCK_COOLDOWN_MINUTES,
      DEFAULT_SHOPEE_BLOCK_COOLDOWN_MINUTES,
    ),
    customsEnabled: parseBoolean(process.env.CUSTOMS_SCHEDULER_ENABLED, false),
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

async function syncCrawlerResult(jobName: string, dryRun: boolean, result: Awaited<ReturnType<typeof crawlCustoms> | ReturnType<typeof crawlShopee>>) {
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
    const result = await crawlShopee()
    await syncCrawlerResult('Shopee Crawl', config.shopeeDryRun, result)
  })
}

export async function runCustomsCrawlJob(trigger = 'manual') {
  const config = getCrawlerScheduleConfig()
  await runExclusive('customs-crawl', async () => {
    console.log(`[Customs Crawl] started (${trigger})`)
    const result = await crawlCustoms()
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
