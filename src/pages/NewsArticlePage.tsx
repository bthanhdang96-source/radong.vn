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

  const sanitizedHtml = currentPayload?.article.contentHtml ? DOMPurify.sanitize(currentPayload.article.contentHtml) : ''
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

              {!currentPayload.article.contentHtml && currentPayload.article.contentText ? (
                <article className="news-article__body">
                  <p>{currentPayload.article.contentText}</p>
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
            {isDetailedArticle(article) ? (
              <a href={article.canonicalUrl} target="_blank" rel="noreferrer noopener">
                Xem bài gốc
              </a>
            ) : null}
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
