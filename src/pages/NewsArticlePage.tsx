import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import type { NewsDetailResponse, NewsListItem } from '../data/newsTypes'
import { buildApiUrl } from '../lib/api'
import './NewsArticlePage.css'

const FALLBACK_NEWS_IMAGE = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
const NEWS_ARTICLE_CACHE_PREFIX = 'news-article-cache:v1:'
const NEWS_ARTICLE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000

type NewsArticleLocationState = {
  articlePreview?: NewsListItem
}

type CachedNewsDetail = {
  savedAt: string
  payload: NewsDetailResponse
}

function isDetailedArticle(article: NewsListItem | NewsDetailResponse['article']): article is NewsDetailResponse['article'] {
  return 'canonicalUrl' in article
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeTextContent(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeSearchText(value: string | null | undefined) {
  return normalizeTextContent(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isPhoneLikeText(value: string) {
  const normalized = normalizeSearchText(value)
  return /(hotline|duong day nong|dien thoai|phone|tel)/.test(normalized) || /\b(?:\+?84|0)\d(?:[\s.\-]?\d){7,12}\b/.test(value)
}

function isNoiseHeadingText(value: string) {
  const normalized = normalizeSearchText(value)
  return [
    'xem them',
    'doc nhieu nhat',
    'binh luan moi nhat',
    'tin lien quan',
    'bai lien quan',
    'co the ban quan tam',
    'tags',
    'tag',
    'tu khoa',
  ].some(label => normalized === label || normalized.startsWith(`${label} `))
}

function isPromotionalNoiseText(value: string) {
  const normalized = normalizeSearchText(value)
  return [
    'ban dang doc bai viet',
    'moi thong tin gop y',
    'bao nong nghiep va moi truong',
    'gmail.com',
    'zalo',
    'quan tam 0',
  ].some(fragment => normalized.includes(fragment))
}

function isLikelyLinkList(list: Element) {
  const items = Array.from(list.querySelectorAll(':scope > li'))
  if (items.length < 3) {
    return false
  }

  return items.every(item => {
    const text = normalizeTextContent(item.textContent)
    return text.length > 0 && text.length <= 40 && !/[.!?:;]/.test(text) && item.querySelector('a')
  })
}

function shouldTrimFromBlock(element: Element) {
  const text = normalizeTextContent(element.textContent)
  if (!text) {
    return false
  }

  if (isPromotionalNoiseText(text) && text.length <= 500) {
    return true
  }

  if (isPhoneLikeText(text) && text.length <= 120) {
    return true
  }

  if (isNoiseHeadingText(text) && text.length <= 80) {
    return true
  }

  const heading = element.matches('h1, h2, h3, h4, h5, h6, strong, b')
    ? element
    : element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > strong, :scope > b')
  if (heading && isNoiseHeadingText(heading.textContent) && normalizeTextContent(heading.textContent).length <= 80) {
    return true
  }

  return false
}

function getPrimaryContentContainer(root: Element) {
  if (root.children.length === 1 && root.firstElementChild) {
    return root.firstElementChild
  }

  return root
}

function trimTrailingNoise(container: Element) {
  const children = Array.from(container.children)
  const trimIndex = children.findIndex(child => shouldTrimFromBlock(child))

  if (trimIndex >= 0) {
    for (const child of children.slice(trimIndex)) {
      child.remove()
    }
  }
}

function stripArticleNoise(html: string) {
  const sanitized = DOMPurify.sanitize(html)
  if (typeof window === 'undefined') {
    return sanitized
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<body>${sanitized}</body>`, 'text/html')
  const root = document.body
  const contentContainer = getPrimaryContentContainer(root)

  for (const list of Array.from(contentContainer.querySelectorAll('ul, ol'))) {
    if (isLikelyLinkList(list)) {
      list.remove()
    }
  }

  for (const element of Array.from(contentContainer.querySelectorAll('a[href^="tel:"], p, li, div, section, aside'))) {
    const text = normalizeTextContent(element.textContent)
    const isCompact = text.length > 0 && text.length <= 160

    if (isCompact && (isPhoneLikeText(text) || isPromotionalNoiseText(text))) {
      element.remove()
    }
  }

  trimTrailingNoise(contentContainer)

  for (const anchor of Array.from(root.querySelectorAll('a'))) {
    const text = normalizeTextContent(anchor.textContent)
    if (!text) {
      anchor.remove()
      continue
    }

    anchor.replaceWith(document.createTextNode(text))
  }

  for (const element of Array.from(root.querySelectorAll('*')).reverse()) {
    const text = normalizeTextContent(element.textContent)
    const hasMedia = Boolean(element.querySelector('img, video, iframe, table'))
    if (!text && !hasMedia && element.children.length === 0) {
      element.remove()
    }
  }

  return root.innerHTML
}

function stripArticleNoiseFromText(value: string) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !isPhoneLikeText(line) && !isPromotionalNoiseText(line) && !isNoiseHeadingText(line))
    .join('\n')
}

function getNewsArticleCacheKey(slug: string) {
  return `${NEWS_ARTICLE_CACHE_PREFIX}${slug}`
}

function readNewsArticleCache(slug: string) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(getNewsArticleCacheKey(slug))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<CachedNewsDetail>
    if (typeof parsed.savedAt !== 'string' || !parsed.payload?.article) {
      return null
    }

    const ageMs = Date.now() - new Date(parsed.savedAt).getTime()
    if (!Number.isFinite(ageMs) || ageMs > NEWS_ARTICLE_CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(getNewsArticleCacheKey(slug))
      return null
    }

    return parsed.payload
  } catch {
    return null
  }
}

function writeNewsArticleCache(slug: string, payload: NewsDetailResponse) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const cached: CachedNewsDetail = {
      savedAt: new Date().toISOString(),
      payload,
    }

    window.localStorage.setItem(getNewsArticleCacheKey(slug), JSON.stringify(cached))
  } catch {
    // Best-effort cache for repeat article visits.
  }
}

function getArticlePreview(state: unknown, slug: string | undefined) {
  if (!slug || !state || typeof state !== 'object' || !('articlePreview' in state)) {
    return null
  }

  const preview = (state as NewsArticleLocationState).articlePreview
  return preview?.slug === slug ? preview : null
}

function StoryRail({ title, items }: { title: string; items: NewsListItem[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="news-article__rail">
      <div className="news-article__rail-head">
        <span>{title}</span>
      </div>
      <div className="news-article__rail-list">
        {items.map(item => (
          <Link
            key={item.slug}
            className="news-article__rail-item"
            to={`/tin-tuc/${item.slug}`}
            state={{ articlePreview: item } satisfies NewsArticleLocationState}
          >
            <div className="news-article__rail-meta">
              <time>{new Date(item.publishedAt).toLocaleDateString('vi-VN')}</time>
            </div>
            <strong>{item.title}</strong>
            <p>{item.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === 'true') {
    return
  }

  target.dataset.fallbackApplied = 'true'
  target.src = FALLBACK_NEWS_IMAGE
}

export default function NewsArticlePage() {
  const { slug } = useParams()
  const location = useLocation()
  const initialCachedPayload = slug ? readNewsArticleCache(slug) : null
  const initialPreview = getArticlePreview(location.state, slug) ?? initialCachedPayload?.article ?? null
  const [payload, setPayload] = useState<NewsDetailResponse | null>(initialCachedPayload)
  const [preview, setPreview] = useState<NewsListItem | null>(initialPreview)
  const [loading, setLoading] = useState(!initialCachedPayload)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setPayload(null)
      setPreview(null)
      setLoading(false)
      setError('Không tìm thấy bài viết')
      return
    }

    const cachedPayload = readNewsArticleCache(slug)
    const routePreview = getArticlePreview(location.state, slug)
    const currentSlug = slug
    const controller = new AbortController()

    setPayload(cachedPayload)
    setPreview(routePreview ?? cachedPayload?.article ?? null)
    setError(null)
    setLoading(!cachedPayload)
    window.scrollTo({ top: 0 })

    async function loadArticle() {
      try {
        const response = await fetch(buildApiUrl(`/api/news/articles/${slug}`), { signal: controller.signal })
        const json = (await response.json()) as NewsDetailResponse & { success?: boolean; error?: string }
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải chi tiết bài viết')
        }

        setPayload(json)
        setPreview(current => (current?.slug === json.article.slug ? current : json.article))
        setError(null)
        writeNewsArticleCache(currentSlug, json)
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return
        }

        if (!cachedPayload) {
          setPayload(null)
        }
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải chi tiết bài viết')
      } finally {
        setLoading(false)
      }
    }

    void loadArticle()

    return () => {
      controller.abort()
    }
  }, [slug, location.state])

  const currentPayload = payload?.article.slug === slug ? payload : null
  const currentPreview = preview?.slug === slug ? preview : null
  const article = currentPayload?.article ?? currentPreview

  if (!article && loading) {
    return <main className="news-article news-article--state">Đang tải bài viết...</main>
  }

  if (error && !article) {
    return (
      <main className="news-article news-article--state">
        <p>{error ?? 'Không tìm thấy bài viết'}</p>
        <Link to="/" className="news-article__back-link">
          Quay lại trang tin tức
        </Link>
      </main>
    )
  }

  if (!article) {
    return (
      <main className="news-article news-article--state">
        <p>Không tìm thấy bài viết</p>
        <Link to="/" className="news-article__back-link">
          Quay lại trang tin tức
        </Link>
      </main>
    )
  }

  const sanitizedHtml = currentPayload?.article.contentHtml ? stripArticleNoise(currentPayload.article.contentHtml) : ''
  const sanitizedText = currentPayload?.article.contentText ? stripArticleNoiseFromText(currentPayload.article.contentText) : ''
  const related = currentPayload?.related ?? []
  const latestFromSource = currentPayload?.latestFromSource ?? []

  return (
    <main className="news-article">
      <div className="news-article__frame">
        <div className="news-article__main">
          <nav className="news-article__breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Tin tức</Link>
            <span>/</span>
            <span>Bài viết</span>
          </nav>

          <header className="news-article__header">
            {article.category ? (
              <div className="news-article__meta">
                <span className="news-article__category">{article.category}</span>
              </div>
            ) : null}
            <h1>{article.title}</h1>
            <p className="news-article__excerpt">{article.excerpt}</p>
            <div className="news-article__byline">
              <span>{isDetailedArticle(article) ? (article.author ?? 'Ban biên tập NongSanVN') : 'Ban biên tập NongSanVN'}</span>
              <time>{formatDate(article.publishedAt)}</time>
            </div>
            {article.topicTags.length > 0 ? (
              <div className="news-article__tags">
                {article.topicTags.map(tag => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            ) : null}
          </header>

          <div className="news-article__hero">
            <img
              src={article.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
              alt={article.title}
              onError={handleImageError}
            />
          </div>

          {currentPayload ? (
            <>
              <article className="news-article__body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />

              {!currentPayload.article.contentHtml && sanitizedText ? (
                <article className="news-article__body">
                  <p>{sanitizedText}</p>
                </article>
              ) : null}
            </>
          ) : (
            <section className="news-article__loading-panel" aria-live="polite">
              <p className="news-article__loading-copy">Đang tải nội dung đầy đủ của bài viết...</p>
              <div className="news-article__loading-lines" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </section>
          )}

          <footer className="news-article__source-note">
            <p>
              Nguồn bài viết: <strong>{article.sourceLabel}</strong>
            </p>
          </footer>

          {error ? <div className="news-article__inline-error">{error}</div> : null}
        </div>

        <aside className="news-article__aside">
          <StoryRail title="Bài liên quan" items={related} />
          <StoryRail title="Mới nhất cùng nguồn" items={latestFromSource} />
        </aside>
      </div>
    </main>
  )
}
