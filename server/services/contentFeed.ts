import { getNewsArticles } from './news/service.js'
import { listGeneratedPricePages, toContentFeedItem } from './generatedPricePages/service.js'
import type { ContentFeedItem } from './generatedPricePages/types.js'

function toNewsFeedItem(item: Awaited<ReturnType<typeof getNewsArticles>>['items'][number]): ContentFeedItem {
  return {
    kind: 'news',
    path: `/tin-tuc/${item.slug}`,
    title: item.title,
    excerpt: item.excerpt,
    thumbnailUrl: item.thumbnailUrl,
    publishedAt: item.publishedAt,
    updatedAt: item.publishedAt,
    category: item.category,
    topicTags: item.topicTags,
    badgeLabel: 'Tin thị trường',
    sourceLabel: item.sourceLabel,
    sourceKey: item.sourceKey,
  }
}

function getSortTimestamp(item: ContentFeedItem) {
  return item.kind === 'price_page' ? item.updatedAt : item.publishedAt
}

export async function getContentFeed(limit = 18) {
  const safeLimit = Math.min(Math.max(limit, 1), 48)
  const [news, pricePages] = await Promise.all([
    getNewsArticles({ limit: safeLimit }),
    listGeneratedPricePages({ limit: safeLimit }),
  ])

  return [...news.items.map(toNewsFeedItem), ...pricePages.map(toContentFeedItem)]
    .sort((left, right) => getSortTimestamp(right).localeCompare(getSortTimestamp(left)))
    .slice(0, safeLimit)
}
