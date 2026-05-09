import { getCached, setCache } from '../cacheService.js'
import { getNewsSourceConfig } from './sourceRegistry.js'
import type { NewsArticleRecord, NewsSourceKey } from './types.js'

const LIVE_CACHE_KEY = 'news-live-articles'
const LIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const LIVE_CACHE_TARGET_COUNT = 40
const LIVE_CACHE_DEPTH_PER_SOURCE = 6
const LIVE_SOURCE_KEYS: NewsSourceKey[] = [
  'vietnambiz',
  'congthuong',
  'nongnghiepmoitruong',
  'vpsaspice',
  'vietfood',
  'kinhtenongthon',
  'vinacas',
  'coa',
]

let refreshPromise: Promise<NewsArticleRecord[]> | null = null

function dedupeArticles(articles: NewsArticleRecord[]) {
  const seen = new Set<string>()
  return articles.filter(article => {
    if (seen.has(article.canonicalUrl)) {
      return false
    }

    seen.add(article.canonicalUrl)
    return true
  })
}

export function getCachedLiveNewsArticles() {
  return getCached<NewsArticleRecord[]>(LIVE_CACHE_KEY)
}

export async function refreshLiveNewsArticlesCache(force = false): Promise<NewsArticleRecord[]> {
  if (!force) {
    const cached = getCachedLiveNewsArticles()
    if (cached && cached.length > 0) {
      return cached
    }
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { crawlNewsSource } = await import('./service.js')
      const results = await Promise.all(
        LIVE_SOURCE_KEYS.map(async sourceKey => {
          const source = getNewsSourceConfig(sourceKey)
          const result = await crawlNewsSource(sourceKey, {
            maxArticlesPerRun: Math.min(LIVE_CACHE_DEPTH_PER_SOURCE, source.maxArticlesPerRun),
            persist: false,
          })
          return result.items
        }),
      )

      const articles = dedupeArticles(results.flat())
        .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
        .slice(0, LIVE_CACHE_TARGET_COUNT)

      if (articles.length > 0) {
        setCache(LIVE_CACHE_KEY, articles, LIVE_CACHE_TTL_MS)
      }

      return articles
    })().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}
