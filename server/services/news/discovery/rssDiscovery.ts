import { XMLParser } from 'fast-xml-parser'
import { fetchText, parseLooseDate, resolveUrl, stripHtml } from '../common.js'
import type { NewsDiscoveredItem, NewsSourceConfig } from '../types.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  trimValues: true,
})

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export async function discoverFromRss(source: NewsSourceConfig): Promise<NewsDiscoveredItem[]> {
  const xml = await fetchText(source.discoverUrl)
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } }
    feed?: { entry?: Array<Record<string, unknown>> | Record<string, unknown> }
  }

  const rawItems = [
    ...toArray(parsed.rss?.channel?.item),
    ...toArray(parsed.feed?.entry),
  ].slice(0, source.maxArticlesPerRun)

  const items: NewsDiscoveredItem[] = []

  for (const item of rawItems) {
      const linkNode = item.link
      const linkValue =
        typeof linkNode === 'string'
          ? linkNode
          : linkNode && typeof linkNode === 'object' && 'href' in linkNode && typeof linkNode.href === 'string'
            ? linkNode.href
            : null
      if (!linkValue) {
        continue
      }

      const canonicalUrl = resolveUrl(source.baseUrl, linkValue)
      items.push({
        sourceKey: source.key,
        canonicalUrl,
        title: typeof item.title === 'string' ? stripHtml(item.title) : null,
        excerpt:
          typeof item.description === 'string'
            ? stripHtml(item.description)
            : typeof item.summary === 'string'
              ? stripHtml(item.summary)
              : null,
        publishedAt: parseLooseDate(
          typeof item.pubDate === 'string'
            ? item.pubDate
            : typeof item.published === 'string'
              ? item.published
              : typeof item.updated === 'string'
                ? item.updated
                : null,
        ),
        topicTags: source.topicTags,
      })
  }

  return items
}
