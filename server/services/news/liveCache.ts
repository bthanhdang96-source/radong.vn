import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  'vietfood',
  'kinhtenongthon',
  'coa',
]

const liveCacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'cache')
const LIVE_SNAPSHOT_PATH = join(liveCacheDir, 'news-live-articles-snapshot.json')

type LiveNewsSnapshot = {
  updatedAt: string
  articles: NewsArticleRecord[]
}

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

function normalizeArticles(articles: NewsArticleRecord[]) {
  return dedupeArticles(articles)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, LIVE_CACHE_TARGET_COUNT)
}

function persistLiveNewsArticles(articles: NewsArticleRecord[]) {
  const normalized = normalizeArticles(articles)
  if (normalized.length === 0) {
    return normalized
  }

  setCache(LIVE_CACHE_KEY, normalized, LIVE_CACHE_TTL_MS)
  writeFileSync(
    LIVE_SNAPSHOT_PATH,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        articles: normalized,
      } satisfies LiveNewsSnapshot,
      null,
      2,
    ),
    'utf8',
  )

  return normalized
}

export function getPersistedLiveNewsArticles() {
  if (!existsSync(LIVE_SNAPSHOT_PATH)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(LIVE_SNAPSHOT_PATH, 'utf8')) as LiveNewsSnapshot
    if (!Array.isArray(parsed.articles) || parsed.articles.length === 0) {
      return null
    }

    return normalizeArticles(parsed.articles)
  } catch {
    return null
  }
}

export function rememberLiveNewsArticles(articles: NewsArticleRecord[]) {
  const existing = getPersistedLiveNewsArticles() ?? []
  return persistLiveNewsArticles([...articles, ...existing])
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

      const articles = normalizeArticles(results.flat())
      if (articles.length > 0) {
        return persistLiveNewsArticles(articles)
      }

      return getPersistedLiveNewsArticles() ?? []
    })().catch(error => {
      const fallback = getPersistedLiveNewsArticles()
      if (fallback && fallback.length > 0) {
        return fallback
      }

      throw error
    }).finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}
