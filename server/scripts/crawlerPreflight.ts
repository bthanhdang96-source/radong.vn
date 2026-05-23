import '../env.js'
import { getCrawlerScheduleConfig } from '../services/crawlerScheduler.js'
import { hasBhxApiCredentials } from '../services/crawlers/bhxCrawler.js'
import { getSupabaseRuntimeStatus } from '../services/supabaseClient.js'

type CheckResult = {
  name: string
  ok: boolean
  detail: string
}

async function main() {
  const schedule = getCrawlerScheduleConfig()
  const supabase = getSupabaseRuntimeStatus()
  const bhxRequested = process.env.BHX_CRAWL_ENABLED?.trim().toLowerCase() !== 'false'
  const bhxCredentialsConfigured = hasBhxApiCredentials()

  const checks: CheckResult[] = [
    {
      name: 'supabase_admin_config',
      ok: supabase.hasAdminConfig,
      detail: supabase.hasAdminConfig ? 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured' : 'Missing admin Supabase configuration',
    },
    {
      name: 'bhx_scheduler_flags',
      ok: !schedule.bhxCrawlEnabled || schedule.bhxEnabledRegions.length > 0,
      detail: schedule.bhxCrawlEnabled
        ? `enabled with cron ${schedule.bhxCrawlCron} across regions ${schedule.bhxEnabledRegions.join(',')} auth=${bhxCredentialsConfigured ? 'env_credentials' : 'browser_bootstrap'}`
        : bhxRequested
          ? 'disabled because no BHX regions are configured'
          : 'disabled; safe default until retail rollout',
    },
    {
      name: 'coop_scheduler_flags',
      ok:
        !schedule.coopCrawlEnabled ||
        (schedule.coopEnabledRegions.length > 0 &&
          schedule.coopEnabledCategories.length > 0 &&
          schedule.coopMaxPagesPerCategory > 0),
      detail: schedule.coopCrawlEnabled
        ? `enabled with cron ${schedule.coopCrawlCron} across regions ${schedule.coopEnabledRegions.join(',')} categories ${schedule.coopEnabledCategories.join(',')} maxPages=${schedule.coopMaxPagesPerCategory}`
        : 'disabled; safe default until retail rollout',
    },
    {
      name: 'customs_scheduler_flags',
      ok: !schedule.customsEnabled || schedule.customsCron.length > 0,
      detail: schedule.customsEnabled
        ? `enabled with cron ${schedule.customsCron}`
        : 'disabled; safe default until production rollout',
    },
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
