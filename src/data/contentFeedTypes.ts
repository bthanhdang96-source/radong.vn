export type ContentFeedItem =
  | {
      kind: 'news'
      path: string
      title: string
      excerpt: string | null
      thumbnailUrl: string | null
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
      publishedAt: string
      updatedAt: string
      category: string | null
      topicTags: string[]
      badgeLabel: string
      commoditySlug: string
      locationLabel: string
      primaryPriceType: 'farm_gate' | 'wholesale' | 'retail' | 'export'
    }

export type ContentFeedResponse = {
  success: boolean
  items: ContentFeedItem[]
}
