import '../env.js'
import { crawlKhuyennongTphcm } from '../services/crawlers/khuyennongTphcmCrawler.js'
import { syncCrawlerResultToSupabase } from '../services/ingestion/sourceSync.js'
import { hasSupabaseAdminConfig } from '../services/supabaseClient.js'

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const result = await crawlKhuyennongTphcm()
  const source = result.sources[0]
  console.log(`[Khuyen Nong TPHCM Run] success=${source?.success ?? false}`)
  console.log(`[Khuyen Nong TPHCM Run] sourceUrl=${source?.latestArticleUrl ?? source?.url ?? 'n/a'}`)
  console.log(`[Khuyen Nong TPHCM Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[Khuyen Nong TPHCM Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[Khuyen Nong TPHCM Run] error=${source?.error ?? 'No bulletin items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items.slice(0, 8)) {
    console.log(
      `[Khuyen Nong TPHCM Run] item ${item.marketName} ${item.commodity} region=${item.region} price=${item.price}`,
    )
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[Khuyen Nong TPHCM Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[Khuyen Nong TPHCM Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[Khuyen Nong TPHCM Run] Failed:', error)
  process.exitCode = 1
})
