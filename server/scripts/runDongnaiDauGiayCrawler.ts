import '../env.js'
import { crawlDongnaiDauGiay } from '../services/crawlers/dongnaiDauGiayCrawler.js'
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
  const result = await crawlDongnaiDauGiay({
    articleUrl: getArgValue('article-url') ?? null,
    pdfUrl: getArgValue('pdf-url') ?? null,
  })

  const source = result.sources[0]
  console.log(`[Dong Nai Dau Giay Run] success=${source?.success ?? false}`)
  console.log(`[Dong Nai Dau Giay Run] sourceUrl=${source?.latestArticleUrl ?? source?.url ?? 'n/a'}`)
  console.log(`[Dong Nai Dau Giay Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[Dong Nai Dau Giay Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[Dong Nai Dau Giay Run] error=${source?.error ?? 'No Dầu Giây items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items.slice(0, 8)) {
    console.log(
      `[Dong Nai Dau Giay Run] item ${item.marketName} ${item.commodity} region=${item.region} price=${item.price}`,
    )
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[Dong Nai Dau Giay Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[Dong Nai Dau Giay Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[Dong Nai Dau Giay Run] Failed:', error)
  process.exitCode = 1
})
