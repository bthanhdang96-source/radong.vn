export type PricePageScopeType = 'province' | 'region_label'
export type PricePageStatus = 'draft' | 'published' | 'stale'
export type PricePagePrimaryPriceType = 'farm_gate' | 'wholesale' | 'retail' | 'export'
export type CommodityPricePageRenderMode = 'regional_table' | 'national_article'
export type ContentFamilySlug =
  | 'tin-gia-nong-san'
  | 'tin-thi-truong-hang-ngay'
  | 'xuat-khau-va-doanh-nghiep'
  | 'chuyen-mon-va-chinh-sach'
export type PriceCommodityGroupSlug =
  | 'cay-cong-nghiep'
  | 'luong-thuc'
  | 'chan-nuoi'
  | 'thuy-san'
  | 'trai-cay'
  | 'rau-cu'
  | 'khac'

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

export type GeneratedCommodityPriceVarietyRow = {
  scopeType: PricePageScopeType
  scopeKey: string
  provinceCode: string | null
  regionLabel: string | null
  locationLabel: string
  locationSlug: string
  priceType: PricePagePrimaryPriceType
  qualityGrade: string | null
  latestPriceVnd: number
  latestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  latestObservedOn: string
  sortRank: number
}

export type GeneratedCommodityPriceVarietySection = {
  variety: string
  varietyLabel: string
  headlineLatestPriceVnd: number
  lowestPriceVnd: number
  highestPriceVnd: number
  change7dPct: number
  rows: GeneratedCommodityPriceVarietyRow[]
}

export type GeneratedCommodityPriceUnitRow = {
  scopeType: PricePageScopeType
  scopeKey: string
  provinceCode: string | null
  regionLabel: string | null
  locationLabel: string
  locationSlug: string
  priceType: PricePagePrimaryPriceType
  latestPriceVnd: number
  latestPriceUnit: string
  dayChangeVnd: number
  dayChangePct: number
  change7dVnd: number
  change7dPct: number
  latestObservedOn: string
  sortRank: number
}

export type GeneratedCommodityPriceUnitSection = {
  unitKey: string
  unitLabel: string
  headlineLatestPriceVnd: number
  lowestPriceVnd: number
  highestPriceVnd: number
  change7dPct: number
  rows: GeneratedCommodityPriceUnitRow[]
}

export type GeneratedCommodityPriceChainCard = {
  priceType: PricePagePrimaryPriceType
  label: string
  latestPriceVnd: number | null
  latestPriceUnit: string
  latestObservedOn: string | null
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
  varietySections: GeneratedCommodityPriceVarietySection[]
  unitSections: GeneratedCommodityPriceUnitSection[]
  chainCards: GeneratedCommodityPriceChainCard[]
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
      contentFamilySlug: ContentFamilySlug
      contentFamilyLabel: string
      contentFamilyOrder: number
      familyPath: string
      subcategoryPath: null
      priceGroupSlug: null
      priceGroupLabel: null
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
      contentFamilySlug: ContentFamilySlug
      contentFamilyLabel: string
      contentFamilyOrder: number
      familyPath: string
      subcategoryPath: string | null
      priceGroupSlug: PriceCommodityGroupSlug | null
      priceGroupLabel: string | null
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
      contentFamilySlug: ContentFamilySlug
      contentFamilyLabel: string
      contentFamilyOrder: number
      familyPath: string
      subcategoryPath: string | null
      priceGroupSlug: PriceCommodityGroupSlug | null
      priceGroupLabel: string | null
      commoditySlug: string
      primaryPriceType: PricePagePrimaryPriceType
      locationCount: number
      renderMode: CommodityPricePageRenderMode
    }
  | {
      kind: 'ai_article'
      path: string
      title: string
      excerpt: string | null
      thumbnailUrl: string | null
      thumbnailAlt: string | null
      publishedAt: string
      updatedAt: string
      category: string | null
      topicTags: string[]
      badgeLabel: string
      contentFamilySlug: ContentFamilySlug
      contentFamilyLabel: string
      contentFamilyOrder: number
      familyPath: string
      subcategoryPath: string | null
      priceGroupSlug: PriceCommodityGroupSlug | null
      priceGroupLabel: string | null
      sourceLabel: string
      sourceKey: string
      articleType: 'export_period_report' | 'export_monthly_report' | 'world_daily_price_update'
      dataGranularity: 'daily' | 'period' | 'monthly' | 'as_published' | 'mixed' | 'unknown'
    }

export type ContentFamilySummary = {
  slug: ContentFamilySlug
  label: string
  path: string
  order: number
  itemCount: number
}

export type PriceCommodityGroupSummary = {
  slug: Exclude<PriceCommodityGroupSlug, 'khac'>
  label: string
  path: string
  itemCount: number
}

export type ContentCategorySubgroupLink = {
  slug: Exclude<PriceCommodityGroupSlug, 'khac'>
  label: string
  path: string
  itemCount: number
  isCurrent: boolean
}

export type ContentCategoryModule = {
  familySlug: ContentFamilySlug
  familyLabel: string
  familyPath: string
  itemCount: number
  isCurrent: boolean
  leadItem: ContentFeedItem | null
  secondaryItems: ContentFeedItem[]
  subgroups?: ContentCategorySubgroupLink[]
}

export type ContentFeedFilters = {
  family: ContentFamilySlug | null
  priceGroup: Exclude<PriceCommodityGroupSlug, 'khac'> | null
  q: string | null
  limit: number
}

export type ContentFeedTaxonomy = {
  families: ContentFamilySummary[]
  priceGroups: PriceCommodityGroupSummary[]
}
