import 'dotenv/config'
import { crawlShopee } from '../services/crawlers/shopeeCrawler.js'
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
  const dryRun = hasFlag('dry-run')
  const fixturePath = getArgValue('fixture') ?? null
  const forceRefresh = hasFlag('force-refresh')
  const maxPages = Number(getArgValue('pages') ?? '2')
  const minSold = Number(getArgValue('min-sold') ?? '5')
  const minRating = Number(getArgValue('min-rating') ?? '4')
  const enabledSlugsArg = getArgValue('enabled-slugs')

  const result = await crawlShopee({
    fixturePath,
    maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 2,
    minSold: Number.isFinite(minSold) && minSold >= 0 ? minSold : 5,
    minRating: Number.isFinite(minRating) && minRating >= 0 ? minRating : 4,
    enabledSlugs: enabledSlugsArg
      ? enabledSlugsArg
          .split(',')
          .map(entry => entry.trim())
          .filter(Boolean)
      : null,
    forceSessionRefresh: forceRefresh,
  })

  const source = result.sources[0]
  console.log(`[Shopee Run] success=${source?.success ?? false}`)
  console.log(`[Shopee Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[Shopee Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[Shopee Run] error=${source?.error ?? 'No Shopee items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items.slice(0, 8)) {
    console.log(
      `[Shopee Run] item ${item.commodity} region=${item.region} price=${item.price} dedupe=${item.dedupeKey ?? 'n/a'}`,
    )
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[Shopee Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[Shopee Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[Shopee Run] Failed:', error)
  process.exitCode = 1
})
