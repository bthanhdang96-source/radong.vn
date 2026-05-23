import {
  buildContentModules,
  buildContentTaxonomy,
  filterContentItems,
  getContentFamilyMeta,
  getContentItemTimestamp,
  isContentFamilySlug,
  isPublicPriceCommodityGroupSlug,
} from './contentTaxonomy.js'
import { listAiArticles, toAiArticleContentFeedItem } from './aiArticles/service.js'
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
  cursor?: string
  includeModules?: boolean
}

export type ContentFeedResponsePayload = {
  items: ContentFeedItem[]
  nextCursor: string | null
  hasMore: boolean
  filters: ContentFeedFilters
  taxonomy: ContentFeedTaxonomy
  modules: ContentCategoryModule[]
}

type ContentFeedCursorPayload = {
  timestamp: string
  kind: ContentFeedItem['kind']
  path: string
}

const CONTENT_FEED_KINDS = new Set<ContentFeedItem['kind']>(['news', 'price_page', 'commodity_price_page', 'ai_article'])

export class InvalidContentFeedCursorError extends Error {
  constructor() {
    super('Invalid cursor')
    this.name = 'InvalidContentFeedCursorError'
  }
}

const RAW_FETCH_LIMITS = {
  news: 80,
  pricePages: 80,
  commodityPages: 40,
  aiArticles: 40,
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

function getContentFeedSortKey(item: ContentFeedItem): ContentFeedCursorPayload {
  return {
    timestamp: getContentItemTimestamp(item),
    kind: item.kind,
    path: item.path,
  }
}

function compareContentFeedSortKeys(left: ContentFeedCursorPayload, right: ContentFeedCursorPayload) {
  const timestampOrder = right.timestamp.localeCompare(left.timestamp)
  if (timestampOrder !== 0) {
    return timestampOrder
  }

  const kindOrder = left.kind.localeCompare(right.kind)
  if (kindOrder !== 0) {
    return kindOrder
  }

  return left.path.localeCompare(right.path)
}

function sortContentFeedItems(items: ContentFeedItem[]) {
  return [...items].sort((left, right) => compareContentFeedSortKeys(getContentFeedSortKey(left), getContentFeedSortKey(right)))
}

function encodeContentFeedCursor(item: ContentFeedItem) {
  return Buffer.from(JSON.stringify(getContentFeedSortKey(item)), 'utf8').toString('base64url')
}

function decodeContentFeedCursor(cursor: string | undefined) {
  if (!cursor) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<ContentFeedCursorPayload>
    if (
      typeof parsed.timestamp !== 'string' ||
      !Number.isFinite(new Date(parsed.timestamp).getTime()) ||
      typeof parsed.kind !== 'string' ||
      !CONTENT_FEED_KINDS.has(parsed.kind as ContentFeedItem['kind']) ||
      typeof parsed.path !== 'string' ||
      parsed.path.length === 0
    ) {
      throw new InvalidContentFeedCursorError()
    }

    return {
      timestamp: parsed.timestamp,
      kind: parsed.kind as ContentFeedItem['kind'],
      path: parsed.path,
    } satisfies ContentFeedCursorPayload
  } catch (error) {
    if (error instanceof InvalidContentFeedCursorError) {
      throw error
    }

    throw new InvalidContentFeedCursorError()
  }
}

function applyContentFeedCursor(items: ContentFeedItem[], cursor: ContentFeedCursorPayload | null) {
  if (!cursor) {
    return items
  }

  return items.filter(item => compareContentFeedSortKeys(getContentFeedSortKey(item), cursor) > 0)
}

function paginateContentFeedItems(items: ContentFeedItem[], limit: number, cursor: string | undefined) {
  const decodedCursor = decodeContentFeedCursor(cursor)
  const paged = applyContentFeedCursor(items, decodedCursor).slice(0, limit + 1)
  const visibleItems = paged.slice(0, limit)
  const lastItem = visibleItems.at(-1)

  return {
    items: visibleItems,
    nextCursor: paged.length > limit && lastItem ? encodeContentFeedCursor(lastItem) : null,
    hasMore: paged.length > limit,
  }
}

export async function getContentFeed(options: GetContentFeedOptions = {}): Promise<ContentFeedResponsePayload> {
  const family = sanitizeFamilySlug(options.family)
  const priceGroup = sanitizePriceGroupSlug(options.priceGroup)
  const q = options.q?.trim() ? options.q.trim() : null
  const includeModules = options.includeModules ?? true
  const limit = Math.min(Math.max(options.limit ?? (family ? 30 : 24), 1), 60)

  const [news, pricePages, commodityPages, aiArticles] = await Promise.all([
    getNewsArticles({ limit: RAW_FETCH_LIMITS.news }),
    listGeneratedPricePages({ limit: RAW_FETCH_LIMITS.pricePages }),
    listGeneratedCommodityPricePages({ limit: RAW_FETCH_LIMITS.commodityPages }),
    listAiArticles({ limit: RAW_FETCH_LIMITS.aiArticles }),
  ])

  const allItems = sortContentFeedItems([
    ...news.items.map(toNewsFeedItem),
    ...aiArticles.map(toAiArticleContentFeedItem),
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
  const paginated = paginateContentFeedItems(sortContentFeedItems(filterContentItems(allItems, filters)), limit, options.cursor)

  return {
    items: paginated.items,
    nextCursor: paginated.nextCursor,
    hasMore: paginated.hasMore,
    filters,
    taxonomy,
    modules,
  }
}

export const __contentFeedTestUtils = {
  toNewsFeedItem,
  sanitizeFamilySlug,
  sanitizePriceGroupSlug,
  sortContentFeedItems,
  encodeContentFeedCursor,
  decodeContentFeedCursor,
  paginateContentFeedItems,
}
