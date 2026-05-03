import 'dotenv/config'
import { crawlCustoms } from '../services/crawlers/customsCrawler.js'
import { syncCrawlerResultToSupabase } from '../services/ingestion/sourceSync.js'
import { hasSupabaseAdminConfig } from '../services/supabaseClient.js'

function getArgValue(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const reportUrl = getArgValue('url') ?? null
  const dryRun = hasFlag('dry-run')
  const maxLookbackDays = Number(getArgValue('lookback') ?? '45')
  const discoveryModeArg = getArgValue('discovery')
  const parserArg = getArgValue('parser')
  const enabledSlugsArg = getArgValue('enabled-slugs')
  const result = await crawlCustoms({
    reportUrl,
    maxLookbackDays: Number.isFinite(maxLookbackDays) && maxLookbackDays > 0 ? maxLookbackDays : 45,
    discoveryMode: discoveryModeArg === 'manual' ? 'manual' : discoveryModeArg === 'pattern' ? 'pattern' : undefined,
    parserPreference: parserArg === 'pdftotext' || parserArg === 'js' ? parserArg : undefined,
    enabledSlugs: enabledSlugsArg
      ? enabledSlugsArg
          .split(',')
          .map(entry => entry.trim())
          .filter(Boolean)
      : null,
  })

  const source = result.sources[0]
  console.log(`[Customs Run] success=${source?.success ?? false}`)
  console.log(`[Customs Run] sourceUrl=${source?.latestArticleUrl ?? source?.url ?? 'n/a'}`)
  console.log(`[Customs Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[Customs Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[Customs Run] error=${source?.error ?? 'No customs items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items.slice(0, 8)) {
    console.log(
      `[Customs Run] item ${item.commodity} price=${item.price} priceUsd=${item.priceUsd ?? 'n/a'} dedupe=${item.dedupeKey ?? 'n/a'}`,
    )
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[Customs Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[Customs Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[Customs Run] Failed:', error)
  process.exitCode = 1
})
