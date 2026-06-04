import '../env.js'
import { chromium } from 'playwright'
import { getCrawlerScheduleConfig } from '../services/crawlerScheduler.js'
import { hasBhxApiCredentials } from '../services/crawlers/bhxCrawler.js'
import { canUsePdftotext, getCustomsParserPreference, getPdftotextBinary } from '../services/crawlers/customsCrawler.js'
import { getSupabaseRuntimeStatus } from '../services/supabaseClient.js'

type CheckResult = {
  name: string
  ok: boolean
  detail: string
}

async function checkPlaywrightChromium() {
  try {
    const browser = await chromium.launch({ headless: true })
    await browser.close()
    return {
      ok: true,
      detail: 'Playwright Chromium launches successfully',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const dependencyHint = /error while loading shared libraries|Host system is missing dependencies|libglib|libnss|libx11|libxcomposite|libxdamage|libxext|libxfixes/i.test(message)
      ? ' Install browser system dependencies with `npm exec --prefix server playwright install-deps chromium` on the production host.'
      : ''

    return {
      ok: false,
      detail: `Playwright Chromium cannot launch: ${message.split('\n')[0]}.${dependencyHint}`,
    }
  }
}

async function main() {
  const schedule = getCrawlerScheduleConfig()
  const supabase = getSupabaseRuntimeStatus()
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  const hasLegacyServiceRoleKey = legacyServiceRoleKey.startsWith('eyJ')
  const bhxRequested = process.env.BHX_CRAWL_ENABLED?.trim().toLowerCase() !== 'false'
  const bhxCredentialsConfigured = hasBhxApiCredentials()
  const customsParserPreference = getCustomsParserPreference()
  const pdftotextBinary = getPdftotextBinary()
  const pdftotextAvailable = customsParserPreference === 'js'
    ? true
    : await canUsePdftotext(pdftotextBinary)
  const playwrightCheck = schedule.bhxCrawlEnabled && !bhxCredentialsConfigured
    ? await checkPlaywrightChromium()
    : null

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
      name: 'bhx_playwright_runtime',
      ok: !schedule.bhxCrawlEnabled || bhxCredentialsConfigured || playwrightCheck?.ok === true,
      detail: !schedule.bhxCrawlEnabled
        ? 'BHX scheduler disabled; Playwright browser bootstrap not required'
        : bhxCredentialsConfigured
          ? 'BHX API credentials configured; browser bootstrap not required'
          : playwrightCheck?.detail ?? 'Playwright runtime check was not run',
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
    {
      name: 'customs_pdftotext_runtime',
      ok: !schedule.customsEnabled || pdftotextAvailable,
      detail: !schedule.customsEnabled
        ? 'Customs scheduler disabled; pdftotext not required'
        : customsParserPreference === 'js'
          ? 'CUSTOMS_PDF_PARSER=js; pdftotext intentionally not required'
          : pdftotextAvailable
            ? `pdftotext available via ${pdftotextBinary}`
            : `pdftotext unavailable via ${pdftotextBinary}; install poppler-utils or set PDFTOTEXT_PATH`,
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
