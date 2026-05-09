import { FALLBACK_NEWS_ARTICLES, FALLBACK_NEWS_SOURCES } from './fallbackData.js'
import { decodeCursor, encodeCursor, makeSlug, normalizeWhitespace, sleep } from './common.js'
import { discoverFromHtml } from './discovery/htmlDiscovery.js'
import { discoverFromRss } from './discovery/rssDiscovery.js'
import { discoverFromSitemap } from './discovery/sitemapDiscovery.js'
import { extractNewsArticle } from './extract/articleExtractor.js'
import { getNewsSourceConfig, listNewsSourceConfigs } from './sourceRegistry.js'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from '../supabaseClient.js'
import type {
  NewsArticleRecord,
  NewsCrawlResult,
  NewsCrawlRunRecord,
  NewsDetailResponse,
  NewsDiscoveredItem,
  NewsHealthResponse,
  NewsListFilters,
  NewsListItem,
  NewsListResponse,
  NewsSourceConfig,
  NewsSourceKey,
  NewsSourceRecord,
} from './types.js'

type NewsSourceRow = {
  key: NewsSourceKey
  label: string
  base_url: string
  discover_url: string
  discover_mode: NewsSourceConfig['discoverMode']
  priority: NewsSourceConfig['priority']
  phase: NewsSourceConfig['phase']
  access_state: NewsSourceConfig['accessState']
  latest_detected_at: string | null
  freshness_checked_at: string | null
  active: boolean
  full_text_capable?: boolean | null
  browser_required?: boolean | null
  rate_limit_ms?: number | null
  max_articles_per_run?: number | null
  topic_tags?: string[] | null
}

type NewsArticleRow = {
  id: string
  source_key: NewsSourceKey
  canonical_url: string
  slug: string
  title: string
  excerpt: string | null
  content_html: string | null
  content_text: string | null
  thumbnail_url: string | null
  author: string | null
  category: string | null
  topic_tags: string[] | null
  published_at: string
  fetched_at: string
  content_mode: NewsArticleRecord['contentMode']
  fingerprint: string
  status: NewsArticleRecord['status']
}

type NewsRunRow = {
  id: string
  source_key: NewsSourceKey
  started_at: string
  finished_at: string | null
  discover_count: number
  inserted_count: number
  updated_count: number
  failed_count: number
  status: NewsCrawlRunRecord['status']
  error: string | null
}

let sourceSyncPromise: Promise<void> | null = null

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return code === 'PGRST205' || code === 'PGRST204' || message.includes('relation') || message.includes('does not exist')
}

function toSourceRecord(config: NewsSourceConfig, row?: NewsSourceRow): NewsSourceRecord {
  return {
    key: config.key,
    label: row?.label ?? config.label,
    baseUrl: row?.base_url ?? config.baseUrl,
    discoverUrl: row?.discover_url ?? config.discoverUrl,
    discoverMode: row?.discover_mode ?? config.discoverMode,
    priority: row?.priority ?? config.priority,
    phase: row?.phase ?? config.phase,
    accessState: row?.access_state ?? config.accessState,
    latestDetectedAt: row?.latest_detected_at ?? config.latestDetectedAt ?? null,
    freshnessCheckedAt: row?.freshness_checked_at ?? config.freshnessCheckedAt ?? null,
    active: row?.active ?? config.active,
    fullTextCapable: row?.full_text_capable ?? config.fullTextCapable,
    browserRequired: row?.browser_required ?? config.browserRequired,
    rateLimitMs: row?.rate_limit_ms ?? config.rateLimitMs,
    maxArticlesPerRun: row?.max_articles_per_run ?? config.maxArticlesPerRun,
    topicTags: row?.topic_tags ?? config.topicTags,
  }
}

function toArticleRecord(row: NewsArticleRow, sources: NewsSourceRecord[]): NewsArticleRecord {
  const source = sources.find(item => item.key === row.source_key)
  return {
    id: row.id,
    sourceKey: row.source_key,
    sourceLabel: source?.label ?? getNewsSourceConfig(row.source_key).label,
    canonicalUrl: row.canonical_url,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentHtml: row.content_html,
    contentText: row.content_text,
    thumbnailUrl: row.thumbnail_url,
    author: row.author,
    category: row.category,
    topicTags: row.topic_tags ?? [],
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    contentMode: row.content_mode,
    fingerprint: row.fingerprint,
    status: row.status,
  }
}

function toListItem(article: NewsArticleRecord): NewsListItem {
  return {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    thumbnailUrl: article.thumbnailUrl,
    sourceKey: article.sourceKey,
    sourceLabel: article.sourceLabel ?? getNewsSourceConfig(article.sourceKey).label,
    publishedAt: article.publishedAt,
    category: article.category,
    topicTags: article.topicTags,
    contentMode: article.contentMode,
  }
}

async function ensureNewsSourcesSynced() {
  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  if (!sourceSyncPromise) {
    sourceSyncPromise = (async () => {
      const rows = listNewsSourceConfigs().map(source => ({
        key: source.key,
        label: source.label,
        base_url: source.baseUrl,
        discover_url: source.discoverUrl,
        discover_mode: source.discoverMode,
        priority: source.priority,
        phase: source.phase,
        access_state: source.accessState,
        latest_detected_at: source.latestDetectedAt ?? null,
        freshness_checked_at: source.freshnessCheckedAt ?? new Date().toISOString(),
        active: source.active,
        full_text_capable: source.fullTextCapable,
        browser_required: source.browserRequired,
        rate_limit_ms: source.rateLimitMs,
        max_articles_per_run: source.maxArticlesPerRun,
        topic_tags: source.topicTags,
      }))

      const { error } = await client.from('news_sources').upsert(rows, { onConflict: 'key' })
      if (error && !isRelationMissing(error)) {
        throw error
      }
    })().catch(error => {
      sourceSyncPromise = null
      throw error
    })
  }

  await sourceSyncPromise
}

async function loadSourceRecords(): Promise<NewsSourceRecord[]> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return FALLBACK_NEWS_SOURCES
  }

  try {
    await ensureNewsSourcesSynced()
    const client = getSupabaseReadClient()
    if (!client) {
      return FALLBACK_NEWS_SOURCES
    }

    const { data, error } = await client
      .from('news_sources')
      .select('*')
      .order('phase', { ascending: true })
      .order('priority', { ascending: true })

    if (error) {
      throw error
    }

    const rows = (data ?? []) as NewsSourceRow[]
    if (rows.length === 0) {
      return FALLBACK_NEWS_SOURCES
    }

    return rows.map(row => toSourceRecord(getNewsSourceConfig(row.key), row))
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[News] Falling back to static sources:', error)
    }

    return FALLBACK_NEWS_SOURCES
  }
}

async function loadArticleRecords(): Promise<NewsArticleRecord[]> {
  const runtime = getSupabaseRuntimeStatus()
  const sources = await loadSourceRecords()
  if (!runtime.hasReadConfig) {
    return FALLBACK_NEWS_ARTICLES.map(article => ({
      ...article,
      sourceLabel: sources.find(source => source.key === article.sourceKey)?.label ?? article.sourceLabel,
    }))
  }

  try {
    const client = getSupabaseReadClient()
    if (!client) {
      return FALLBACK_NEWS_ARTICLES
    }

    const { data, error } = await client
      .from('news_articles')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(250)

    if (error) {
      throw error
    }

    const rows = (data ?? []) as NewsArticleRow[]
    if (rows.length === 0) {
      return FALLBACK_NEWS_ARTICLES
    }

    return rows.map(row => toArticleRecord(row, sources))
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[News] Falling back to static articles:', error)
    }

    return FALLBACK_NEWS_ARTICLES
  }
}

function filterArticles(articles: NewsArticleRecord[], filters: NewsListFilters) {
  return articles.filter(article => {
    if (filters.source && article.sourceKey !== filters.source) {
      return false
    }

    if (filters.topic && !article.topicTags.includes(filters.topic)) {
      return false
    }

    if (filters.from && article.publishedAt < filters.from) {
      return false
    }

    if (filters.to && article.publishedAt > filters.to) {
      return false
    }

    if (filters.q) {
      const query = filters.q.toLowerCase()
      const haystack = [article.title, article.excerpt, article.contentText, article.category, article.topicTags.join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(query)) {
        return false
      }
    }

    return article.status === 'published'
  })
}

function applyCursor(articles: NewsArticleRecord[], cursor: string | undefined) {
  const payload = decodeCursor(cursor)
  if (!payload) {
    return articles
  }

  return articles.filter(article => {
    if (article.publishedAt < payload.publishedAt) {
      return true
    }

    if (article.publishedAt === payload.publishedAt && article.slug < payload.slug) {
      return true
    }

    return false
  })
}

async function discoverNewsItems(source: NewsSourceConfig) {
  const discovered = await (async () => {
    switch (source.discoverMode) {
    case 'rss':
      return discoverFromRss(source)
    case 'sitemap':
      return discoverFromSitemap(source)
    case 'html':
      return discoverFromHtml(source)
    case 'browser_html':
      throw new Error(`Source ${source.key} requires browser automation and is not enabled in this phase`)
    default:
      return []
    }
  })()

  if (!source.discoveryKeywords || source.discoveryKeywords.length === 0) {
    return discovered
  }

  return discovered.filter(item => {
    const haystack = normalizeWhitespace([item.title, item.excerpt, item.canonicalUrl].filter(Boolean).join(' ')).toLowerCase()
    return source.discoveryKeywords?.some(keyword => haystack.includes(keyword.toLowerCase())) ?? true
  })
}

function ensureUniqueSlug(article: NewsArticleRecord, existing: NewsArticleRecord[]) {
  const baseSlug = makeSlug(article.title)
  const conflict = existing.find(item => item.slug === baseSlug && item.canonicalUrl !== article.canonicalUrl)
  return conflict ? `${baseSlug}-${article.fingerprint.slice(0, 6)}` : baseSlug
}

async function persistCrawlResult(
  source: NewsSourceConfig,
  discoveredItems: NewsDiscoveredItem[],
  articles: NewsArticleRecord[],
  runStatus: NewsCrawlRunRecord['status'],
  error: string | null,
): Promise<NewsCrawlResult> {
  const runtime = getSupabaseRuntimeStatus()
  const sourceRecord = toSourceRecord(source, {
    key: source.key,
    label: source.label,
    base_url: source.baseUrl,
    discover_url: source.discoverUrl,
    discover_mode: source.discoverMode,
    priority: source.priority,
    phase: source.phase,
    access_state: source.accessState,
    latest_detected_at: articles[0]?.publishedAt ?? discoveredItems[0]?.publishedAt ?? null,
    freshness_checked_at: new Date().toISOString(),
    active: source.active,
    full_text_capable: source.fullTextCapable,
    browser_required: source.browserRequired,
    rate_limit_ms: source.rateLimitMs,
    max_articles_per_run: source.maxArticlesPerRun,
    topic_tags: source.topicTags,
  })

  const fallbackRun: NewsCrawlRunRecord = {
    sourceKey: source.key,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    discoverCount: discoveredItems.length,
    insertedCount: articles.length,
    updatedCount: 0,
    failedCount: Math.max(0, discoveredItems.length - articles.length),
    status: runStatus,
    error,
  }

  if (!runtime.hasAdminConfig) {
    return { source: sourceRecord, run: fallbackRun, items: articles }
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return { source: sourceRecord, run: fallbackRun, items: articles }
  }

  try {
    await ensureNewsSourcesSynced()
    const existingArticles = await loadArticleRecords()
    const normalizedArticles = articles.map(article => ({
      ...article,
      slug: ensureUniqueSlug(article, existingArticles),
    }))

    const { data: articleRows, error: articleError } = await client
      .from('news_articles')
      .upsert(
        normalizedArticles.map(article => ({
          source_key: article.sourceKey,
          canonical_url: article.canonicalUrl,
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          content_html: article.contentHtml,
          content_text: article.contentText,
          thumbnail_url: article.thumbnailUrl,
          author: article.author,
          category: article.category,
          topic_tags: article.topicTags,
          published_at: article.publishedAt,
          fetched_at: article.fetchedAt,
          content_mode: article.contentMode,
          fingerprint: article.fingerprint,
          status: article.status,
        })),
        { onConflict: 'canonical_url' },
      )
      .select('*')

    if (articleError && !isRelationMissing(articleError)) {
      throw articleError
    }

    const latestDetectedAt = normalizedArticles[0]?.publishedAt ?? discoveredItems[0]?.publishedAt ?? null
    const sourceUpsert = await client
      .from('news_sources')
      .upsert(
        [
          {
            key: source.key,
            label: source.label,
            base_url: source.baseUrl,
            discover_url: source.discoverUrl,
            discover_mode: source.discoverMode,
            priority: source.priority,
            phase: source.phase,
            access_state: source.accessState,
            latest_detected_at: latestDetectedAt,
            freshness_checked_at: new Date().toISOString(),
            active: source.active,
            full_text_capable: source.fullTextCapable,
            browser_required: source.browserRequired,
            rate_limit_ms: source.rateLimitMs,
            max_articles_per_run: source.maxArticlesPerRun,
            topic_tags: source.topicTags,
          },
        ],
        { onConflict: 'key' },
      )

    if (sourceUpsert.error && !isRelationMissing(sourceUpsert.error)) {
      throw sourceUpsert.error
    }

    const runInsert = await client
      .from('news_crawl_runs')
      .insert({
        source_key: source.key,
        started_at: fallbackRun.startedAt,
        finished_at: fallbackRun.finishedAt,
        discover_count: discoveredItems.length,
        inserted_count: normalizedArticles.length,
        updated_count: 0,
        failed_count: Math.max(0, discoveredItems.length - normalizedArticles.length),
        status: runStatus,
        error,
      })
      .select('*')
      .single()

    if (runInsert.error && !isRelationMissing(runInsert.error)) {
      throw runInsert.error
    }

    const run = runInsert.data
      ? {
          id: (runInsert.data as NewsRunRow).id,
          sourceKey: source.key,
          startedAt: (runInsert.data as NewsRunRow).started_at,
          finishedAt: (runInsert.data as NewsRunRow).finished_at,
          discoverCount: (runInsert.data as NewsRunRow).discover_count,
          insertedCount: (runInsert.data as NewsRunRow).inserted_count,
          updatedCount: (runInsert.data as NewsRunRow).updated_count,
          failedCount: (runInsert.data as NewsRunRow).failed_count,
          status: (runInsert.data as NewsRunRow).status,
          error: (runInsert.data as NewsRunRow).error,
        }
      : fallbackRun

    const persistedItems =
      articleRows && articleRows.length > 0
        ? (articleRows as NewsArticleRow[]).map(row => toArticleRecord(row, [sourceRecord]))
        : normalizedArticles

    return {
      source: { ...sourceRecord, latestDetectedAt },
      run,
      items: persistedItems,
    }
  } catch (persistError) {
    if (!isRelationMissing(persistError)) {
      throw persistError
    }

    return { source: sourceRecord, run: fallbackRun, items: articles }
  }
}

export async function crawlNewsSource(sourceKey: NewsSourceKey): Promise<NewsCrawlResult> {
  const source = getNewsSourceConfig(sourceKey)
  const startedAt = new Date().toISOString()

  try {
    const discoveredItems = await discoverNewsItems(source)
    const articles: NewsArticleRecord[] = []

    for (const item of discoveredItems.slice(0, source.maxArticlesPerRun)) {
      try {
        const article = await extractNewsArticle(source, item)
        articles.push(article)
      } catch (error) {
        console.warn(`[News] Failed to extract article for ${sourceKey}:`, item.canonicalUrl, error)
      }

      await sleep(source.rateLimitMs)
    }

    const status = articles.length === discoveredItems.length ? 'success' : articles.length > 0 ? 'partial' : 'failed'
    const result = await persistCrawlResult(
      source,
      discoveredItems,
      articles.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)),
      status,
      null,
    )

    result.run.startedAt = startedAt
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown crawl failure'
    return persistCrawlResult(source, [], [], 'failed', message)
  }
}

export async function crawlNewsSources(sourceKeys?: NewsSourceKey[]) {
  const keys = sourceKeys && sourceKeys.length > 0 ? sourceKeys : listNewsSourceConfigs().filter(source => source.phase <= 2).map(source => source.key)
  const results: NewsCrawlResult[] = []

  for (const sourceKey of keys) {
    results.push(await crawlNewsSource(sourceKey))
  }

  return results
}

export async function getNewsArticles(filters: NewsListFilters): Promise<NewsListResponse> {
  const [articles, sources] = await Promise.all([loadArticleRecords(), loadSourceRecords()])
  const limit = Math.min(Math.max(filters.limit ?? 12, 1), 24)
  const filtered = filterArticles(articles, filters).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
  const paged = applyCursor(filtered, filters.cursor).slice(0, limit + 1)
  const items = paged.slice(0, limit).map(toListItem)
  const last = items.at(-1)

  return {
    items,
    nextCursor: paged.length > limit && last ? encodeCursor({ publishedAt: last.publishedAt, slug: last.slug }) : null,
    totalApprox: filtered.length,
    sources,
    filters: {
      source: filters.source ?? null,
      topic: filters.topic ?? null,
      q: filters.q ?? null,
      from: filters.from ?? null,
      to: filters.to ?? null,
      limit,
    },
  }
}

export async function getNewsArticle(slug: string): Promise<NewsDetailResponse | null> {
  const articles = (await loadArticleRecords()).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
  const article = articles.find(item => item.slug === slug)
  if (!article) {
    return null
  }

  const related = articles
    .filter(item => item.slug !== slug && item.topicTags.some(tag => article.topicTags.includes(tag)))
    .slice(0, 4)
    .map(toListItem)
  const latestFromSource = articles
    .filter(item => item.slug !== slug && item.sourceKey === article.sourceKey)
    .slice(0, 5)
    .map(toListItem)

  return {
    article,
    related,
    latestFromSource,
  }
}

export async function getNewsSources() {
  return loadSourceRecords()
}

export async function getNewsTopics() {
  const articles = await loadArticleRecords()
  return [...new Set(articles.flatMap(article => article.topicTags))].sort((left, right) => left.localeCompare(right))
}

export async function getNewsRuns(sourceKey?: NewsSourceKey) {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return []
  }

  try {
    const client = getSupabaseReadClient()
    if (!client) {
      return []
    }

    let query = client.from('news_crawl_runs').select('*').order('started_at', { ascending: false }).limit(50)
    if (sourceKey) {
      query = query.eq('source_key', sourceKey)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    return ((data ?? []) as NewsRunRow[]).map(row => ({
      id: row.id,
      sourceKey: row.source_key,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      discoverCount: row.discover_count,
      insertedCount: row.inserted_count,
      updatedCount: row.updated_count,
      failedCount: row.failed_count,
      status: row.status,
      error: row.error,
    }))
  } catch (error) {
    if (!isRelationMissing(error)) {
      console.error('[News] Failed to load crawl runs:', error)
    }

    return []
  }
}

export async function getNewsHealth(): Promise<NewsHealthResponse> {
  const [sources, articles] = await Promise.all([loadSourceRecords(), loadArticleRecords()])
  const runtime = getSupabaseRuntimeStatus()
  const now = Date.now()
  const staleSources = sources.filter(source => {
    if (!source.latestDetectedAt) {
      return source.priority === 'P0' || source.priority === 'P1'
    }

    const ageMs = now - new Date(source.latestDetectedAt).getTime()
    const thresholdDays = source.priority === 'P0' ? 3 : source.priority === 'P1' ? 5 : 14
    return ageMs > thresholdDays * 24 * 60 * 60 * 1000
  })

  return {
    status: staleSources.length > 0 ? 'degraded' : 'ok',
    sourceCount: sources.length,
    articleCount: articles.length,
    runtime: {
      hasReadConfig: runtime.hasReadConfig,
      hasAdminConfig: runtime.hasAdminConfig,
    },
    staleSources: staleSources.map(source => ({
      sourceKey: source.key,
      latestDetectedAt: source.latestDetectedAt,
      priority: source.priority,
    })),
  }
}
