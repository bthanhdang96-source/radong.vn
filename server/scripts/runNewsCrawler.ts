import '../env.js'
import { crawlNewsSource, crawlNewsSources } from '../services/news/service.js'
import { NEWS_SOURCE_KEYS } from '../services/news/sourceRegistry.js'
import type { NewsSourceKey } from '../services/news/types.js'

async function main() {
  const requestedSource = process.argv[2]

  if (requestedSource && NEWS_SOURCE_KEYS.includes(requestedSource as NewsSourceKey)) {
    const result = await crawlNewsSource(requestedSource as NewsSourceKey)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const results = await crawlNewsSources()
  console.log(JSON.stringify(results, null, 2))
}

main().catch(error => {
  console.error('[News] Crawl script failed:', error)
  process.exitCode = 1
})
