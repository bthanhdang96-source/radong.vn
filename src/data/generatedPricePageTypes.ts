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

export type GeneratedPricePageListResponse = {
  success: boolean
  items: GeneratedPricePageSummary[]
}

export type GeneratedPricePageDetailResponse = {
  success: boolean
  page: GeneratedPricePageDetail
}

export type GeneratedCommodityPricePageListResponse = {
  success: boolean
  items: GeneratedCommodityPricePageSummary[]
}

export type GeneratedCommodityPricePageDetailResponse = {
  success: boolean
  page: GeneratedCommodityPricePageDetail
}

export function buildGeneratedPricePagePath(commoditySlug: string, locationSlug: string) {
  return `/gia-nong-san/${commoditySlug}/${locationSlug}`
}

export function buildGeneratedCommodityPricePagePath(commoditySlug: string) {
  return `/gia-nong-san/${commoditySlug}`
}
