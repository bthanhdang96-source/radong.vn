export type PricePageScopeType = 'province' | 'region_label'
export type PricePageStatus = 'draft' | 'published' | 'stale'
export type PricePagePrimaryPriceType = 'farm_gate' | 'wholesale' | 'retail' | 'export'
export type CommodityPricePageRenderMode = 'regional_table' | 'national_article'

export type PricePageFaqItem = {
  question: string
  answer: string
}

export type PricePageSeoMeta = {
  title: string
  description: string
  canonicalPath: string
  ogTitle: string
  ogDescription: string
  noindex?: boolean
}

export type GeneratedPricePageSummary = {
  id: string
  slug: string
  path: string
  commoditySlug: string
  locationSlug: string
  scopeType: PricePageScopeType
  scopeKey: string
  provinceCode: string | null
  regionLabel: string | null
  locationLabel: string
  category: string | null
  title: string
  excerpt: string
  answerSummary: string
  topicTags: string[]
  thumbnailUrl: string | null
  thumbnailAlt: string | null
  primaryPriceType: PricePagePrimaryPriceType
  latestPriceVnd: number
  latestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  minPrice7dVnd: number
  maxPrice7dVnd: number
  observationCount7d: number
  latestObservedOn: string
  publishedAt: string | null
  updatedAt: string
  status: PricePageStatus
}

export type GeneratedPricePageDetail = GeneratedPricePageSummary & {
  bodyHtml: string
  bodyText: string
  faq: PricePageFaqItem[]
  seo: PricePageSeoMeta
  relatedByCommodity: GeneratedPricePageSummary[]
  relatedByLocation: GeneratedPricePageSummary[]
}

export type GeneratedCommodityPriceRegionRow = {
  scopeType: PricePageScopeType
  scopeKey: string
  provinceCode: string | null
  regionLabel: string | null
  locationLabel: string
  locationSlug: string
  path: string
  priceType: PricePagePrimaryPriceType
  latestPriceVnd: number
  latestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  vsNationalAvgPct: number | null
  minPrice7dVnd: number
  maxPrice7dVnd: number
  observationCount7d: number
  latestObservedOn: string
  sortRank: number
}

export type GeneratedCommodityPricePageSummary = {
  id: string
  slug: string
  path: string
  commoditySlug: string
  category: string | null
  title: string
  excerpt: string
  answerSummary: string
  topicTags: string[]
  thumbnailUrl: string | null
  thumbnailAlt: string | null
  primaryPriceType: PricePagePrimaryPriceType
  renderMode: CommodityPricePageRenderMode
  headlineLatestPriceVnd: number
  headlineLatestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  lowestPriceVnd: number
  highestPriceVnd: number
  priceSpreadVnd: number
  locationCount: number
  latestObservedOn: string
  nationalScopeLabel: string | null
  publishedAt: string | null
  updatedAt: string
  status: PricePageStatus
}

export type GeneratedCommodityPricePageDetail = GeneratedCommodityPricePageSummary & {
  bodyHtml: string
  bodyText: string
  faq: PricePageFaqItem[]
  seo: PricePageSeoMeta
  regionRows: GeneratedCommodityPriceRegionRow[]
  relatedLocationPages: GeneratedPricePageSummary[]
  relatedCommodityPages: GeneratedCommodityPricePageSummary[]
}

export type GeneratedPricePageGenerateOptions = {
  commoditySlug?: string
  scopeType?: PricePageScopeType
  scopeKey?: string
  staleHours?: number
}

export type GeneratedPricePageGenerateResult = {
  runId: string | null
  status: 'success' | 'partial' | 'failed'
  createdCount: number
  updatedCount: number
  staleCount: number
  skippedCount: number
  errorCount: number
  errors: string[]
}

export type GeneratedCommodityPricePageGenerateOptions = {
  commoditySlug?: string
  staleHours?: number
}

export type GeneratedCommodityPricePageGenerateResult = {
  runId: string | null
  status: 'success' | 'partial' | 'failed'
  createdCount: number
  updatedCount: number
  staleCount: number
  skippedCount: number
  errorCount: number
  errors: string[]
}

export type ContentFeedItem =
  | {
      kind: 'news'
      path: string
      title: string
      excerpt: string | null
      thumbnailUrl: string | null
      thumbnailAlt?: string | null
      publishedAt: string
      updatedAt: string
      category: string | null
      topicTags: string[]
      badgeLabel: string
      sourceLabel: string
      sourceKey: string
    }
  | {
      kind: 'price_page'
      path: string
      title: string
      excerpt: string
      thumbnailUrl: string | null
      thumbnailAlt: string | null
      publishedAt: string
      updatedAt: string
      category: string | null
      topicTags: string[]
      badgeLabel: string
      commoditySlug: string
      locationLabel: string
      primaryPriceType: PricePagePrimaryPriceType
    }
  | {
      kind: 'commodity_price_page'
      path: string
      title: string
      excerpt: string
      thumbnailUrl: string | null
      thumbnailAlt: string | null
      publishedAt: string
      updatedAt: string
      category: string | null
      topicTags: string[]
      badgeLabel: string
      commoditySlug: string
      primaryPriceType: PricePagePrimaryPriceType
      locationCount: number
      renderMode: CommodityPricePageRenderMode
    }
