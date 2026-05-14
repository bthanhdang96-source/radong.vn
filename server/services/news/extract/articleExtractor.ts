import { Readability } from '@mozilla/readability'
import { load } from 'cheerio'
import { JSDOM } from 'jsdom'
import { classifyNewsArticle } from '../articleClassification.js'
import { fetchText, makeFingerprint, makeSlug, normalizeWhitespace, parseLooseDate, stripHtml, toPlainExcerpt } from '../common.js'
import type { NewsArticleRecord, NewsDiscoveredItem, NewsSourceConfig, NewsSourceKey } from '../types.js'

function pickFirstText($: ReturnType<typeof load>, selectors: string[]) {
  for (const selector of selectors) {
    const text = normalizeWhitespace($(selector).first().text())
    if (text) {
      return text
    }
  }

  return null
}

function pickFirstAttr($: ReturnType<typeof load>, selectors: string[], attr: string) {
  for (const selector of selectors) {
    const value = $(selector).first().attr(attr)
    if (value) {
      return value
    }
  }

  return null
}

function normalizeHtmlFragment(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim()
}

function normalizeCanonicalUrl(value: string | null | undefined, fallbackUrl: string) {
  const candidate = normalizeWhitespace(value) || fallbackUrl
  const sanitized = candidate.replace(/^httpss:\/\//i, 'https://')

  try {
    return new URL(sanitized, fallbackUrl).toString()
  } catch {
    return fallbackUrl
  }
}

export function hasSuspiciousExtractedBody(sourceKey: NewsSourceKey, canonicalUrl: string, html: string | null) {
  if (!html) {
    return false
  }

  const text = stripHtml(html)
  const $ = load(`<div>${html}</div>`)
  const links = $('a[href]')
    .map((_, element) => $(element).attr('href') ?? '')
    .get()
    .filter(Boolean)
  const foreignLinks = [...new Set(links)].filter(link => !link.startsWith('#') && !link.startsWith(canonicalUrl))

  if (sourceKey === 'vietfood') {
    const hasTeaserCard =
      $('.elementor-post__thumbnail__link, .elementor-post__title, .elementor-post__text').length > 0

    if (hasTeaserCard && foreignLinks.length > 0 && text.length < 400) {
      return true
    }
  }

  return false
}

export async function extractNewsArticle(source: NewsSourceConfig, discovered: NewsDiscoveredItem): Promise<NewsArticleRecord> {
  const fetchedAt = new Date().toISOString()
  const html = await fetchText(discovered.canonicalUrl)
  const $ = load(html)

  const rawSourceBodyHtml =
    source.articleSelectors
      ?.map(selector => $(selector).first().html())
      .find((value): value is string => Boolean(value && normalizeWhitespace(value))) ?? null
  const sourceBodyHtml =
    rawSourceBodyHtml && !hasSuspiciousExtractedBody(source.key, discovered.canonicalUrl, rawSourceBodyHtml)
      ? rawSourceBodyHtml
      : null

  const readability = new Readability(new JSDOM(html, { url: discovered.canonicalUrl }).window.document).parse()
  const readabilityHtml = readability?.content ? normalizeHtmlFragment(readability.content) : null

  const contentHtml = sourceBodyHtml ? normalizeHtmlFragment(sourceBodyHtml) : readabilityHtml
  const contentText = contentHtml ? stripHtml(contentHtml) : normalizeWhitespace(readability?.textContent ?? '')
  const title =
    normalizeWhitespace(
      $('meta[property="og:title"]').attr('content') ??
        $('meta[name="twitter:title"]').attr('content') ??
        $('h1').first().text() ??
        readability?.title ??
        discovered.title ??
        '',
    ) || 'Tin tức nông nghiệp'
  const excerpt =
    normalizeWhitespace(
      $('meta[name="description"]').attr('content') ??
        $('meta[property="og:description"]').attr('content') ??
        discovered.excerpt ??
        readability?.excerpt ??
        '',
    ) || (contentText ? toPlainExcerpt(contentText) : null)
  const canonicalUrl = normalizeCanonicalUrl(
    $('link[rel="canonical"]').attr('href') ??
      $('meta[property="og:url"]').attr('content') ??
      discovered.canonicalUrl,
    discovered.canonicalUrl,
  )
  const thumbnailUrl =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="twitter:image"]').attr('content') ??
    pickFirstAttr($, ['img'], 'src')
  const author =
    normalizeWhitespace(
      $('meta[name="author"]').attr('content') ??
        pickFirstText($, ['.author', '.entry-author', '.post-author', '[rel="author"]']) ??
        '',
    ) || null
  const category =
    normalizeWhitespace(
      $('meta[property="article:section"]').attr('content') ??
        pickFirstText($, ['.breadcrumb a:last-child', '.category-name', '.entry-categories a:first-child']) ??
        discovered.category ??
        '',
    ) || null
  const publishedAt = parseLooseDate(
    $('meta[property="article:published_time"]').attr('content') ??
      $('[itemprop="datePublished"]').attr('content') ??
      $('meta[name="pubdate"]').attr('content') ??
      $('time').first().attr('datetime') ??
      $('time').first().text() ??
      pickFirstText($, ['.post-meta-date', '.post-meta-elements', '.box_ngay', '.content_box_ol li:first-child']) ??
      discovered.publishedAt ??
      fetchedAt,
    fetchedAt,
  )
  const topicTags = [
    ...new Set(
      [
        ...source.topicTags,
        ...(discovered.topicTags ?? []),
        ...$('.tags a, .post-tags a')
          .map((_, element) => normalizeWhitespace($(element).text()))
          .get()
          .filter(Boolean),
      ].filter(Boolean),
    ),
  ]
  const classification = classifyNewsArticle({
    sourceKey: source.key,
    title,
    category,
    canonicalUrl,
    excerpt,
    contentText,
  })

  return {
    sourceKey: source.key,
    sourceLabel: source.label,
    canonicalUrl,
    slug: makeSlug(title),
    title,
    excerpt,
    contentHtml,
    contentText: contentText || null,
    thumbnailUrl: thumbnailUrl ?? null,
    author,
    category,
    topicTags: [...new Set([...topicTags, ...classification.topicTags])],
    publishedAt,
    fetchedAt,
    contentMode: contentHtml ? (sourceBodyHtml ? 'full_html' : 'readability_text') : 'metadata_only',
    fingerprint: makeFingerprint([canonicalUrl, title, publishedAt, contentText]),
    status: classification.status,
  }
}
