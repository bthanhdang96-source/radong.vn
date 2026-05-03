import 'dotenv/config'
import { access } from 'node:fs/promises'
import { chromium } from 'playwright'
import { getCrawlerScheduleConfig } from '../services/crawlerScheduler.js'
import { getShopeeSessionMetadataPath, getShopeeStorageStatePath, readShopeeSessionMetadata } from '../services/crawlers/shopeeSession.js'
import { getSupabaseRuntimeStatus } from '../services/supabaseClient.js'

type CheckResult = {
  name: string
  ok: boolean
  detail: string
}

async function pathExists(pathValue: string) {
  try {
    await access(pathValue)
    return true
  } catch {
    return false
  }
}

async function checkPlaywrightBrowser(): Promise<CheckResult> {
  try {
    const executablePath = chromium.executablePath()
    const exists = await pathExists(executablePath)
    return {
      name: 'playwright_chromium',
      ok: exists,
      detail: exists ? executablePath : `Chromium executable not found at ${executablePath}`,
    }
  } catch (error) {
    return {
      name: 'playwright_chromium',
      ok: false,
      detail: error instanceof Error ? error.message : 'Unable to resolve Chromium executable',
    }
  }
}

async function main() {
  const schedule = getCrawlerScheduleConfig()
  const supabase = getSupabaseRuntimeStatus()
  const shopeeSession = await readShopeeSessionMetadata()
  const storageStatePath = getShopeeStorageStatePath()
  const metadataPath = getShopeeSessionMetadataPath()

  const checks: CheckResult[] = [
    {
      name: 'supabase_admin_config',
      ok: supabase.hasAdminConfig,
      detail: supabase.hasAdminConfig ? 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured' : 'Missing admin Supabase configuration',
    },
    {
      name: 'customs_scheduler_flags',
      ok: !schedule.customsEnabled || schedule.customsCron.length > 0,
      detail: schedule.customsEnabled
        ? `enabled with cron ${schedule.customsCron}`
        : 'disabled; safe default until production rollout',
    },
    {
      name: 'shopee_scheduler_flags',
      ok: !schedule.shopeeRefreshEnabled || !schedule.shopeeCrawlEnabled || schedule.shopeeBlockCooldownMinutes >= 0,
      detail: `refreshEnabled=${schedule.shopeeRefreshEnabled} crawlEnabled=${schedule.shopeeCrawlEnabled} cooldown=${schedule.shopeeBlockCooldownMinutes}m`,
    },
    {
      name: 'shopee_session_metadata',
      ok: await pathExists(metadataPath),
      detail: (await pathExists(metadataPath))
        ? `${metadataPath} (${shopeeSession.status})`
        : `Missing metadata file at ${metadataPath}`,
    },
    {
      name: 'shopee_storage_state',
      ok: await pathExists(storageStatePath),
      detail: (await pathExists(storageStatePath))
        ? `Storage state present at ${storageStatePath}`
        : `Storage state missing at ${storageStatePath}`,
    },
    await checkPlaywrightBrowser(),
  ]

  const failed = checks.filter(check => !check.ok)
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), checks }, null, 2))

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('[Crawler Preflight] Failed:', error)
  process.exitCode = 1
})
