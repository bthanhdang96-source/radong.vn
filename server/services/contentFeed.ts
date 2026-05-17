import {
  buildContentModules,
  buildContentTaxonomy,
  filterContentItems,
  getContentFamilyMeta,
  isContentFamilySlug,
  isPublicPriceCommodityGroupSlug,
  sortContentItems,
} from './contentTaxonomy.js'
import { listGeneratedCommodityPricePages, toCommodityContentFeedItem } from './generatedCommodityPricePages/service.js'
import { listGeneratedPricePages, toContentFeedItem } from './generatedPricePages/service.js'
import type {
  ContentCategoryModule,
  ContentFeedFilters,
  ContentFeedItem,
  ContentFeedTaxonomy,
} from './generatedPricePages/types.js'
import { getNewsArticles } from './news/service.js'

type GetContentFeedOptions = {
  family?: string
  priceGroup?: string
  q?: string
  limit?: number
  includeModules?: boolean
}

export type ContentFeedResponsePayload = {
  items: ContentFeedItem[]
  filters: ContentFeedFilters
  taxonomy: ContentFeedTaxonomy
  modules: ContentCategoryModule[]
}

const RAW_FETCH_LIMITS = {
  news: 80,
  pricePages: 80,
  commodityPages: 40,
} as const

function toNewsFeedItem(item: Awaited<ReturnType<typeof getNewsArticles>>['items'][number]): ContentFeedItem {
  const familyMeta = getContentFamilyMeta(item.contentFamilySlug)

  return {
    kind: 'news',
    path: `/tin-tuc/${item.slug}`,
    title: item.title,
    excerpt: item.excerpt,
    thumbnailUrl: item.thumbnailUrl,
    thumbnailAlt: item.title,
    publishedAt: item.publishedAt,
    updatedAt: item.publishedAt,
    category: item.category,
    topicTags: item.topicTags,
    badgeLabel: item.contentFamilyLabel === 'Tin thị trường hằng ngày' ? 'Tin hằng ngày' : item.contentFamilyLabel,
    contentFamilySlug: familyMeta.contentFamilySlug,
    contentFamilyLabel: familyMeta.contentFamilyLabel,
    contentFamilyOrder: familyMeta.contentFamilyOrder,
    familyPath: familyMeta.familyPath,
    subcategoryPath: null,
    priceGroupSlug: null,
    priceGroupLabel: null,
    sourceLabel: item.sourceLabel,
    sourceKey: item.sourceKey,
  }
}

function sanitizeFamilySlug(value: string | undefined) {
  return value && isContentFamilySlug(value) ? value : null
}

function sanitizePriceGroupSlug(value: string | undefined) {
  return value && isPublicPriceCommodityGroupSlug(value) ? value : null
}

export async function getContentFeed(options: GetContentFeedOptions = {}): Promise<ContentFeedResponsePayload> {
  const family = sanitizeFamilySlug(options.family)
  const priceGroup = sanitizePriceGroupSlug(options.priceGroup)
  const q = options.q?.trim() ? options.q.trim() : null
  const includeModules = options.includeModules ?? true
  const limit = Math.min(Math.max(options.limit ?? (family ? 30 : 24), 1), 60)

  const [news, pricePages, commodityPages] = await Promise.all([
    getNewsArticles({ limit: RAW_FETCH_LIMITS.news }),
    listGeneratedPricePages({ limit: RAW_FETCH_LIMITS.pricePages }),
    listGeneratedCommodityPricePages({ limit: RAW_FETCH_LIMITS.commodityPages }),
  ])

  const allItems = sortContentItems([
    ...news.items.map(toNewsFeedItem),
    ...pricePages.map(toContentFeedItem),
    ...commodityPages.map(toCommodityContentFeedItem),
  ])

  const filters: ContentFeedFilters = {
    family,
    priceGroup,
    q,
    limit,
  }

  const taxonomy = buildContentTaxonomy(allItems)
  const modules = includeModules ? buildContentModules(allItems, filters) : []
  const items = sortContentItems(filterContentItems(allItems, filters)).slice(0, limit)

  return {
    items,
    filters,
    taxonomy,
    modules,
  }
}

export const __contentFeedTestUtils = {
  toNewsFeedItem,
  sanitizeFamilySlug,
  sanitizePriceGroupSlug,
}
