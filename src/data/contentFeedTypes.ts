export type ContentFamilySlug =
  | 'tin-gia-nong-san'
  | 'gia-nong-san-the-gioi'
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
      primaryPriceType: 'farm_gate' | 'wholesale' | 'retail' | 'export'
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
      primaryPriceType: 'farm_gate' | 'wholesale' | 'retail' | 'export'
      locationCount: number
      renderMode: 'regional_table' | 'national_article'
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
      sortAt: string
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

export type ContentFeedResponse = {
  success: boolean
  items: ContentFeedItem[]
  nextCursor: string | null
  hasMore: boolean
  filters: ContentFeedFilters
  taxonomy: ContentFeedTaxonomy
  modules: ContentCategoryModule[]
}
