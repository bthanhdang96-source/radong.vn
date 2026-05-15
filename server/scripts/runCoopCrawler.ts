import '../env.js'
import { crawlCoop } from '../services/crawlers/coopCrawler.js'
import { retryCrawlerResult } from '../services/crawlers/common.js'
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
  const fixturePath = getArgValue('fixture') ?? (hasFlag('fixture') ? 'fixtures/coop-search-sample.json' : null)
  const regionArg = getArgValue('region')
  const regionsArg = getArgValue('regions')
  const categoryArg = getArgValue('category')
  const maxPages = Number(getArgValue('max-pages') ?? '2')

  const regionCodes = regionArg
    ? [regionArg.trim().toUpperCase()]
    : regionsArg
      ? regionsArg
          .split(',')
          .map(value => value.trim().toUpperCase())
          .filter(Boolean)
      : null

  const result = await retryCrawlerResult(() =>
    crawlCoop({
      fixturePath,
      regionCodes,
      categorySlugs: categoryArg
        ? categoryArg
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
        : null,
      maxPagesPerCategory: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 2,
    }),
  )

  const source = result.sources[0]
  console.log(`[Coop Run] success=${source?.success ?? false}`)
  console.log(`[Coop Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[Coop Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[Coop Run] error=${source?.error ?? 'No Co.op items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items.slice(0, 8)) {
    console.log(`[Coop Run] item ${item.commodity} region=${item.region} price=${item.price}`)
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[Coop Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[Coop Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[Coop Run] Failed:', error)
  process.exitCode = 1
})
