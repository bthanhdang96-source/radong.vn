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

export interface NewsSource {
  key: NewsSourceKey
  label: string
  baseUrl: string
  discoverUrl: string
  discoverMode: 'rss' | 'sitemap' | 'html' | 'browser_html'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  phase: number
  accessState: 'public_ok' | 'partial' | 'blocked' | 'login_required'
  latestDetectedAt: string | null
  freshnessCheckedAt: string | null
  active: boolean
  fullTextCapable: boolean
  browserRequired: boolean
  rateLimitMs: number
  maxArticlesPerRun: number
  topicTags: string[]
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
  contentMode: 'full_html' | 'readability_text' | 'metadata_only'
}

export interface NewsArticle extends NewsListItem {
  canonicalUrl: string
  contentHtml: string | null
  contentText: string | null
  author: string | null
  fetchedAt: string
}

export interface NewsListResponse {
  success: boolean
  items: NewsListItem[]
  nextCursor: string | null
  totalApprox: number
  sources: NewsSource[]
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
  success: boolean
  article: NewsArticle
  related: NewsListItem[]
  latestFromSource: NewsListItem[]
}
