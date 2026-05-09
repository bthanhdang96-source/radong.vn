import '../env.js'
import { refreshLiveNewsArticlesCache } from '../services/news/liveCache.js'

async function main() {
  const articles = await refreshLiveNewsArticlesCache(true)
  console.log(
    JSON.stringify(
      {
        count: articles.length,
        titles: articles.slice(0, 10).map(article => ({
          source: article.sourceKey,
          title: article.title,
          thumbnailUrl: article.thumbnailUrl,
        })),
      },
      null,
      2,
    ),
  )
}

main().catch(error => {
  console.error('[News] Failed to refresh live cache:', error)
  process.exitCode = 1
})
