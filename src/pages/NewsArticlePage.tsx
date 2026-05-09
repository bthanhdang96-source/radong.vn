import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import type { NewsDetailResponse, NewsListItem } from '../data/newsTypes'
import './NewsArticlePage.css'

const FALLBACK_NEWS_IMAGE = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'

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
          <Link key={item.slug} className="news-article__rail-item" to={`/tin-tuc/${item.slug}`}>
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
  const [payload, setPayload] = useState<NewsDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadArticle() {
      setLoading(true)
      try {
        const response = await fetch(`/api/news/articles/${slug}`)
        const json = (await response.json()) as NewsDetailResponse & { success?: boolean; error?: string }
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải chi tiết bài viết')
        }

        if (!active) {
          return
        }

        setPayload(json)
        setError(null)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (fetchError) {
        if (!active) {
          return
        }

        setPayload(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải chi tiết bài viết')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    if (slug) {
      void loadArticle()
    }

    return () => {
      active = false
    }
  }, [slug])

  if (loading) {
    return <main className="news-article news-article--state">Đang tải bài viết...</main>
  }

  if (error || !payload) {
    return (
      <main className="news-article news-article--state">
        <p>{error ?? 'Không tìm thấy bài viết'}</p>
        <Link to="/" className="news-article__back-link">
          Quay lại trang tin tức
        </Link>
      </main>
    )
  }

  const { article, related, latestFromSource } = payload
  const sanitizedHtml = DOMPurify.sanitize(article.contentHtml ?? '')

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
              <span>{article.author ?? 'Ban biên tập NongSanVN'}</span>
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

          <article className="news-article__body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />

          {!article.contentHtml && article.contentText ? (
            <article className="news-article__body">
              <p>{article.contentText}</p>
            </article>
          ) : null}

          <footer className="news-article__source-note">
            <p>
              Nguồn bài viết: <strong>{article.sourceLabel}</strong>
            </p>
            <a href={article.canonicalUrl} target="_blank" rel="noreferrer noopener">
              Xem bài gốc
            </a>
          </footer>
        </div>

        <aside className="news-article__aside">
          <StoryRail title="Bài liên quan" items={related} />
          <StoryRail title="Mới nhất cùng nguồn" items={latestFromSource} />
        </aside>
      </div>
    </main>
  )
}
