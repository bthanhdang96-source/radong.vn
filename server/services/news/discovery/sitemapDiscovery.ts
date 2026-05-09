import { XMLParser } from 'fast-xml-parser'
import { fetchText, parseLooseDate } from '../common.js'
import type { NewsDiscoveredItem, NewsSourceConfig } from '../types.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
})

type SitemapUrlEntry = {
  loc?: string
  lastmod?: string
  news?: {
    publication_date?: string
    title?: string
  }
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

async function loadSitemapEntries(url: string, depth = 0): Promise<SitemapUrlEntry[]> {
  if (depth > 1) {
    return []
  }

  const xml = await fetchText(url)
  const parsed = parser.parse(xml) as {
    sitemapindex?: { sitemap?: SitemapUrlEntry[] | SitemapUrlEntry }
    urlset?: { url?: SitemapUrlEntry[] | SitemapUrlEntry }
  }

  const directUrls = toArray(parsed.urlset?.url)
  if (directUrls.length > 0) {
    return directUrls
  }

  const childSitemaps = toArray(parsed.sitemapindex?.sitemap)
    .map(item => item.loc)
    .filter((value): value is string => Boolean(value))

  const childEntries = await Promise.all(childSitemaps.slice(0, 3).map(childUrl => loadSitemapEntries(childUrl, depth + 1)))
  return childEntries.flat()
}

export async function discoverFromSitemap(source: NewsSourceConfig): Promise<NewsDiscoveredItem[]> {
  const entries = await loadSitemapEntries(source.discoverUrl)
  const items: NewsDiscoveredItem[] = []

  for (const entry of entries) {
      if (!entry.loc) {
        continue
      }

      if (source.articleUrlPattern && !source.articleUrlPattern.test(entry.loc)) {
        continue
      }

      items.push({
        sourceKey: source.key,
        canonicalUrl: entry.loc,
        title: entry.news?.title ?? null,
        publishedAt: parseLooseDate(entry.news?.publication_date ?? entry.lastmod ?? null),
        topicTags: source.topicTags,
      })

      if (items.length >= source.maxArticlesPerRun) {
        break
      }
  }

  return items
}
