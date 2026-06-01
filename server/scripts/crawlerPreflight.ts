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
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  const hasLegacyServiceRoleKey = legacyServiceRoleKey.startsWith('eyJ')
  const bhxRequested = process.env.BHX_CRAWL_ENABLED?.trim().toLowerCase() !== 'false'
  const bhxCredentialsConfigured = hasBhxApiCredentials()

  const checks: CheckResult[] = [
    {
      name: 'supabase_admin_config',
      ok: supabase.hasAdminConfig,
      detail: supabase.hasAdminConfig
        ? supabaseSecretKey.length > 0
          ? 'SUPABASE_URL and SUPABASE_SECRET_KEY are configured'
          : 'SUPABASE_URL and admin key are configured via fallback env'
        : 'Missing admin Supabase configuration',
    },
    {
      name: 'supabase_legacy_service_role_key',
      ok: !hasLegacyServiceRoleKey,
      detail: hasLegacyServiceRoleKey
        ? 'Legacy SUPABASE_SERVICE_ROLE_KEY JWT detected (eyJ...). Remove it and use SUPABASE_SECRET_KEY only.'
        : 'No legacy SUPABASE_SERVICE_ROLE_KEY JWT detected',
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
