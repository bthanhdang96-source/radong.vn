import '../env.js'
import { crawlAgroinfoDurianExport } from '../services/crawlers/agroinfoDurianExportCrawler.js'
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
  const reportUrl = getArgValue('url') ?? null
  const dryRun = hasFlag('dry-run')
  const discoveryArg = getArgValue('discovery')
  const result = await retryCrawlerResult(() =>
    crawlAgroinfoDurianExport({
      reportUrl,
      discoveryMode: discoveryArg === 'manual' ? 'manual' : discoveryArg === 'pinned' ? 'pinned' : undefined,
    }),
  )

  const source = result.sources[0]
  console.log(`[Durian Export Run] success=${source?.success ?? false}`)
  console.log(`[Durian Export Run] sourceUrl=${source?.latestArticleUrl ?? source?.url ?? 'n/a'}`)
  console.log(`[Durian Export Run] items=${result.items.length}`)
  if (source?.metadata) {
    console.log(`[Durian Export Run] metadata=${JSON.stringify(source.metadata)}`)
  }

  if (!source?.success || result.items.length === 0) {
    console.error(`[Durian Export Run] error=${source?.error ?? 'No durian export items parsed'}`)
    process.exitCode = 1
    return
  }

  for (const item of result.items) {
    console.log(
      `[Durian Export Run] item ${item.commodity} price=${item.price} priceUsd=${item.priceUsd ?? 'n/a'} dedupe=${item.dedupeKey ?? 'n/a'}`,
    )
  }

  if (dryRun || !hasSupabaseAdminConfig) {
    console.log(`[Durian Export Run] sync=${dryRun ? 'skipped (dry-run)' : 'skipped (missing service role key)'}`)
    return
  }

  const sync = await syncCrawlerResultToSupabase(result)
  console.log(
    `[Durian Export Run] sync processed=${sync.processedCount} inserted=${sync.insertedCount} failed=${sync.failedCount} enqueued=${sync.enqueuedCount} skippedDuplicate=${sync.skippedDuplicateCount}`,
  )
}

main().catch(error => {
  console.error('[Durian Export Run] Failed:', error)
  process.exitCode = 1
})
