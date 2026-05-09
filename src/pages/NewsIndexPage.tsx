import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { NewsListItem, NewsListResponse, NewsSource } from '../data/newsTypes'
import './NewsIndexPage.css'

type TopicResponse = {
  success: boolean
  items: string[]
}

type FilterState = {
  source: string
  topic: string
  q: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildNewsUrl(filters: FilterState, cursor?: string | null) {
  const params = new URLSearchParams()
  params.set('limit', '12')

  if (filters.source) {
    params.set('source', filters.source)
  }

  if (filters.topic) {
    params.set('topic', filters.topic)
  }

  if (filters.q.trim()) {
    params.set('q', filters.q.trim())
  }

  if (cursor) {
    params.set('cursor', cursor)
  }

  return `/api/news/articles?${params.toString()}`
}

function ArticleCard({ article }: { article: NewsListItem }) {
  return (
    <article className="news-index__stream-card">
      <Link className="news-index__stream-image-link" to={`/tin-tuc/${article.slug}`}>
        <img
          className="news-index__stream-image"
          src={article.thumbnailUrl ?? 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=900&q=80'}
          alt={article.title}
          loading="lazy"
        />
      </Link>
      <div className="news-index__stream-body">
        <div className="news-index__meta-row">
          <span className="news-index__source">{article.sourceLabel}</span>
          <span className="news-index__dot" />
          <time>{formatDate(article.publishedAt)}</time>
        </div>
        <Link className="news-index__stream-title" to={`/tin-tuc/${article.slug}`}>
          {article.title}
        </Link>
        <p className="news-index__stream-excerpt">{article.excerpt}</p>
        <div className="news-index__tag-row">
          {article.topicTags.slice(0, 3).map(tag => (
            <span key={tag} className="news-index__tag">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

export default function NewsIndexPage() {
  const [items, setItems] = useState<NewsListItem[]>([])
  const [sources, setSources] = useState<NewsSource[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [totalApprox, setTotalApprox] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<FilterState>({ source: '', topic: '', q: '' })
  const [filters, setFilters] = useState<FilterState>({ source: '', topic: '', q: '' })

  useEffect(() => {
    let active = true

    async function loadTopics() {
      try {
        const response = await fetch('/api/news/topics')
        const json: TopicResponse = await response.json()
        if (!response.ok || !json.success) {
          throw new Error('Khong the tai danh sach chu de')
        }

        if (active) {
          setTopics(json.items)
        }
      } catch (fetchError) {
        if (active) {
          console.error(fetchError)
        }
      }
    }

    void loadTopics()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadArticles() {
      setLoading(true)
      try {
        const response = await fetch(buildNewsUrl(filters))
        const json: NewsListResponse = await response.json()
        if (!response.ok || !json.success) {
          throw new Error('Khong the tai danh sach tin tuc')
        }

        if (!active) {
          return
        }

        setItems(json.items)
        setSources(json.sources)
        setCursor(json.nextCursor)
        setTotalApprox(json.totalApprox)
        setError(null)
      } catch (fetchError) {
        if (!active) {
          return
        }

        setItems([])
        setError(fetchError instanceof Error ? fetchError.message : 'Khong the tai danh sach tin tuc')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadArticles()

    return () => {
      active = false
    }
  }, [filters])

  async function handleLoadMore() {
    if (!cursor) {
      return
    }

    setLoadingMore(true)
    try {
      const response = await fetch(buildNewsUrl(filters, cursor))
      const json: NewsListResponse = await response.json()
      if (!response.ok || !json.success) {
        throw new Error('Khong the tai them bai viet')
      }

      setItems(current => [...current, ...json.items])
      setCursor(json.nextCursor)
      setTotalApprox(json.totalApprox)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Khong the tai them bai viet')
    } finally {
      setLoadingMore(false)
    }
  }

  const hero = items[0] ?? null
  const featured = items.slice(1, 5)
  const stream = items.slice(5)

  return (
    <main className="news-index">
      <section className="news-index__hero-shell">
        <div className="news-index__hero-copy">
          <span className="news-index__eyebrow">Tin nong san moi nhat</span>
          <h1 className="news-index__headline">Trang tin nong nghiep tong hop dau tien tren NongSanVN</h1>
          <p className="news-index__summary">
            Tap trung bai viet tu bao chi, hiep hoi va nguon nganh de nguoi dung doc tin, theo doi thi truong va mo chi
            tiet tung bai ngay tren web.
          </p>
          <div className="news-index__stats">
            <div className="news-index__stat">
              <strong>{sources.length}</strong>
              <span>nguon dang theo doi</span>
            </div>
            <div className="news-index__stat">
              <strong>{totalApprox}</strong>
              <span>bai dang kha dung</span>
            </div>
            <div className="news-index__stat">
              <strong>{topics.length}</strong>
              <span>cum chu de</span>
            </div>
          </div>
        </div>

        {hero ? (
          <Link className="news-index__hero-story" to={`/tin-tuc/${hero.slug}`}>
            <img
              className="news-index__hero-image"
              src={hero.thumbnailUrl ?? 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1400&q=80'}
              alt={hero.title}
            />
            <div className="news-index__hero-overlay" />
            <div className="news-index__hero-content">
              <div className="news-index__meta-row">
                <span className="news-index__source">{hero.sourceLabel}</span>
                <span className="news-index__dot" />
                <time>{formatDate(hero.publishedAt)}</time>
              </div>
              <h2>{hero.title}</h2>
              <p>{hero.excerpt}</p>
            </div>
          </Link>
        ) : (
          <div className="news-index__hero-placeholder">Dang tai bai viet noi bat...</div>
        )}
      </section>

      <section className="news-index__filters">
        <div className="news-index__filter-group">
          <label htmlFor="news-source">Nguon</label>
          <select
            id="news-source"
            value={draftFilters.source}
            onChange={event => setDraftFilters(current => ({ ...current, source: event.target.value }))}
          >
            <option value="">Tat ca nguon</option>
            {sources.map(source => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </select>
        </div>

        <div className="news-index__filter-group">
          <label htmlFor="news-topic">Chu de</label>
          <select
            id="news-topic"
            value={draftFilters.topic}
            onChange={event => setDraftFilters(current => ({ ...current, topic: event.target.value }))}
          >
            <option value="">Tat ca chu de</option>
            {topics.map(topic => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>

        <div className="news-index__search-group">
          <label htmlFor="news-query">Tim kiem</label>
          <input
            id="news-query"
            type="search"
            placeholder="Tim theo tieu de, tom tat, chu de..."
            value={draftFilters.q}
            onChange={event => setDraftFilters(current => ({ ...current, q: event.target.value }))}
          />
        </div>

        <button className="news-index__apply-button" type="button" onClick={() => setFilters(draftFilters)}>
          Ap dung
        </button>
      </section>

      {featured.length > 0 ? (
        <section className="news-index__featured-grid">
          {featured.map(article => (
            <Link key={article.slug} className="news-index__featured-card" to={`/tin-tuc/${article.slug}`}>
              <img
                className="news-index__featured-image"
                src={article.thumbnailUrl ?? 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80'}
                alt={article.title}
                loading="lazy"
              />
              <div className="news-index__featured-body">
                <div className="news-index__meta-row">
                  <span className="news-index__source">{article.sourceLabel}</span>
                  <span className="news-index__dot" />
                  <time>{formatDate(article.publishedAt)}</time>
                </div>
                <h3>{article.title}</h3>
                <p>{article.excerpt}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="news-index__stream">
        <div className="news-index__section-head">
          <div>
            <span className="news-index__eyebrow">Dong tin</span>
            <h2>Danh sach bai viet</h2>
          </div>
          <p>{loading ? 'Dang nap...' : `Hien co ${items.length}/${totalApprox} bai dang duoc hien thi`}</p>
        </div>

        {error ? <div className="news-index__error">{error}</div> : null}

        {loading ? (
          <div className="news-index__empty">Dang tai tin tuc...</div>
        ) : stream.length > 0 ? (
          <div className="news-index__stream-list">
            {stream.map(article => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="news-index__stream-list">
            {items.map(article => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <div className="news-index__empty">Chua co bai viet phu hop voi bo loc hien tai.</div>
        )}

        {cursor ? (
          <div className="news-index__more">
            <button type="button" className="news-index__more-button" onClick={() => void handleLoadMore()} disabled={loadingMore}>
              {loadingMore ? 'Dang tai them...' : 'Xem them bai viet'}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
