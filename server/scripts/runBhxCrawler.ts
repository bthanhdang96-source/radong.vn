import 'dotenv/config'
import { crawlBhx } from '../services/crawlers/bhxCrawler.js'
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
  const fixturePath =
    getArgValue('fixture') ??
    (hasFlag('fixture') ? 'fixtures/bhx-sample.json' : null)
  const regionArg = getArgValue('region')
  const regionsArg = getArgValue('regions')
  const categoryArg = getArgValue('category')
  const maxProducts = Number(getArgValue('max-products') ?? '12')

  const regionCodes = regionArg
    ? [regionArg.trim().toUpperCase()]
    : regionsArg
      ? regionsArg
          .split(',')
          .map(value => value.trim().toUpperCase())
          .filter(Boolean)
      : null

  const result = await crawlBhx({
    fixturePath,
    regionCodes,
    categoryUrls: categoryArg
      ? categoryArg
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      : null,
    maxProductsPerCategory: Number.isFinite(maxProducts) && maxProducts > 0 ? maxProducts : 12,
  })

  const source = result.sources[0]
  console.log(`[BHX Run] success=${source?.success ?? false}`)
  console.log(`[BHX Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[BHX Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[BHX Run] error=${source?.error ?? 'No BHX items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items.slice(0, 8)) {
    console.log(`[BHX Run] item ${item.commodity} region=${item.region} price=${item.price}`)
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[BHX Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[BHX Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[BHX Run] Failed:', error)
  process.exitCode = 1
})
