export type NewsSourceKey =
  | 'vietnambiz'
  | 'congthuong'
  | 'nongnghiepmoitruong'
  | 'vpsaspice'
  | 'vietfood'
  | 'khuyennongvn'
  | 'kinhtenongthon'
  | 'vinacas'
  | 'coa'
  | 'vasep'

export type NewsDiscoverMode = 'rss' | 'sitemap' | 'html' | 'browser_html'
export type NewsContentMode = 'full_html' | 'readability_text' | 'metadata_only'
export type NewsAccessState = 'public_ok' | 'partial' | 'blocked' | 'login_required'
export type NewsPriority = 'P0' | 'P1' | 'P2' | 'P3'
export type NewsPhase = 1 | 2 | 3 | 4
export type NewsRunStatus = 'success' | 'partial' | 'failed'
export type NewsArticleStatus = 'published' | 'draft' | 'archived'

export interface NewsSourceConfig {
  key: NewsSourceKey
  label: string
  baseUrl: string
  discoverUrl: string
  discoverMode: NewsDiscoverMode
  priority: NewsPriority
  phase: NewsPhase
  accessState: NewsAccessState
  latestDetectedAt?: string | null
  freshnessCheckedAt?: string | null
  active: boolean
  fullTextCapable: boolean
  browserRequired: boolean
  rateLimitMs: number
  maxArticlesPerRun: number
  articleUrlPattern?: RegExp
  listingSelectors?: string[]
  articleSelectors?: string[]
  discoveryKeywords?: string[]
  topicTags: string[]
}

export interface NewsSourceRecord {
  key: NewsSourceKey
  label: string
  baseUrl: string
  discoverUrl: string
  discoverMode: NewsDiscoverMode
  priority: NewsPriority
  phase: NewsPhase
  accessState: NewsAccessState
  latestDetectedAt: string | null
  freshnessCheckedAt: string | null
  active: boolean
  fullTextCapable: boolean
  browserRequired: boolean
  rateLimitMs: number
  maxArticlesPerRun: number
  topicTags: string[]
}

export interface NewsDiscoveredItem {
  sourceKey: NewsSourceKey
  canonicalUrl: string
  title?: string | null
  excerpt?: string | null
  thumbnailUrl?: string | null
  author?: string | null
  category?: string | null
  publishedAt?: string | null
  topicTags?: string[]
}

export interface NewsArticleRecord {
  id?: string
  sourceKey: NewsSourceKey
  canonicalUrl: string
  slug: string
  title: string
  excerpt: string | null
  contentHtml: string | null
  contentText: string | null
  thumbnailUrl: string | null
  author: string | null
  category: string | null
  topicTags: string[]
  publishedAt: string
  fetchedAt: string
  contentMode: NewsContentMode
  fingerprint: string
  status: NewsArticleStatus
  sourceLabel?: string
}

export interface NewsCrawlRunRecord {
  id?: string
  sourceKey: NewsSourceKey
  startedAt: string
  finishedAt: string | null
  discoverCount: number
  insertedCount: number
  updatedCount: number
  failedCount: number
  status: NewsRunStatus
  error: string | null
}

export interface NewsListFilters {
  source?: NewsSourceKey
  topic?: string
  q?: string
  from?: string
  to?: string
  limit?: number
  cursor?: string
}

export interface NewsCursorPayload {
  publishedAt: string
  slug: string
}

export interface NewsListItem {
  slug: string
  title: string
  excerpt: string | null
  thumbnailUrl: string | null
  sourceKey: NewsSourceKey
  sourceLabel: string
  publishedAt: string
  category: string | null
  topicTags: string[]
  contentMode: NewsContentMode
}

export interface NewsListResponse {
  items: NewsListItem[]
  nextCursor: string | null
  totalApprox: number
  sources: NewsSourceRecord[]
  filters: {
    source: NewsSourceKey | null
    topic: string | null
    q: string | null
    from: string | null
    to: string | null
    limit: number
  }
}

export interface NewsDetailResponse {
  article: NewsArticleRecord
  related: NewsListItem[]
  latestFromSource: NewsListItem[]
}

export interface NewsHealthResponse {
  status: 'ok' | 'degraded'
  sourceCount: number
  articleCount: number
  runtime: {
    hasReadConfig: boolean
    hasAdminConfig: boolean
  }
  staleSources: Array<{
    sourceKey: NewsSourceKey
    latestDetectedAt: string | null
    priority: NewsPriority
  }>
}

export interface NewsCrawlResult {
  source: NewsSourceRecord
  run: NewsCrawlRunRecord
  items: NewsArticleRecord[]
}
