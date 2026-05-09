import { load } from 'cheerio'
import { fetchText, normalizeWhitespace, parseLooseDate, resolveUrl } from '../common.js'
import type { NewsDiscoveredItem, NewsSourceConfig } from '../types.js'

export async function discoverFromHtml(source: NewsSourceConfig): Promise<NewsDiscoveredItem[]> {
  const html = await fetchText(source.discoverUrl)
  const $ = load(html)
  const seen = new Set<string>()
  const selectors = source.listingSelectors ?? ['a']
  const items: NewsDiscoveredItem[] = []

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (items.length >= source.maxArticlesPerRun) {
        return false
      }

      const href = $(element).attr('href')
      if (!href) {
        return
      }

      const canonicalUrl = resolveUrl(source.baseUrl, href)
      if (seen.has(canonicalUrl)) {
        return
      }

      if (source.articleUrlPattern && !source.articleUrlPattern.test(canonicalUrl)) {
        return
      }

      seen.add(canonicalUrl)
      const parent = $(element).closest('article, .post-item, .news-item, li, .item')
      const title = normalizeWhitespace($(element).text()) || normalizeWhitespace(parent.find('h2, h3, h4').first().text())
      const excerpt = normalizeWhitespace(parent.find('p, .sapo, .excerpt, .summary').first().text()) || null
      const publishedRaw =
        parent.find('time').attr('datetime') ??
        parent.find('time').text() ??
        parent.find('.date, .time, .published').first().text()

      items.push({
        sourceKey: source.key,
        canonicalUrl,
        title: title || null,
        excerpt,
        publishedAt: parseLooseDate(publishedRaw || null),
        topicTags: source.topicTags,
      })
    })

    if (items.length >= source.maxArticlesPerRun) {
      break
    }
  }

  return items
}
