import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import type { NewsListItem, NewsListResponse, NewsSource } from '../data/newsTypes'
import './NewsIndexPage.css'

const FALLBACK_NEWS_IMAGE = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'

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

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === 'true') {
    return
  }

  target.dataset.fallbackApplied = 'true'
  target.src = FALLBACK_NEWS_IMAGE
}

function ArticleCard({ article }: { article: NewsListItem }) {
  return (
    <article className="news-index__stream-card">
      <Link className="news-index__stream-image-link" to={`/tin-tuc/${article.slug}`}>
        <img
          className="news-index__stream-image"
          src={article.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
          alt={article.title}
          loading="lazy"
          onError={handleImageError}
        />
      </Link>
      <div className="news-index__stream-body">
        <div className="news-index__meta-row">
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

function HeroRailCard({ article }: { article: NewsListItem }) {
  return (
    <Link className="news-index__hero-rail-card" to={`/tin-tuc/${article.slug}`}>
      <div className="news-index__hero-rail-media">
        <img
          className="news-index__hero-rail-image"
          src={article.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
          alt={article.title}
          loading="lazy"
          onError={handleImageError}
        />
      </div>
      <div className="news-index__hero-rail-body">
        <strong>{article.title}</strong>
      </div>
    </Link>
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
          throw new Error('Không thể tải danh sách chủ đề')
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
          throw new Error('Không thể tải danh sách tin tức')
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
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải danh sách tin tức')
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
        throw new Error('Không thể tải thêm bài viết')
      }

      setItems(current => [...current, ...json.items])
      setCursor(json.nextCursor)
      setTotalApprox(json.totalApprox)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải thêm bài viết')
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
        <div className="news-index__hero-frame">
          <div className="news-index__hero-topbar">
            <span className="news-index__eyebrow">Tin nông sản mới nhất</span>
            <div className="news-index__hero-stats" aria-label="Tổng quan nguồn tin">
              <span>{sources.length} nguồn</span>
              <span>{totalApprox} bài</span>
              <span>{topics.length} chủ đề</span>
            </div>
          </div>

          {hero ? (
            <Link className="news-index__hero-lead" to={`/tin-tuc/${hero.slug}`}>
              <div className="news-index__hero-lead-media">
                <img
                  className="news-index__hero-image"
                  src={hero.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
                  alt={hero.title}
                  onError={handleImageError}
                />
              </div>
              <div className="news-index__hero-lead-body">
                <div className="news-index__meta-row">
                  <span className="news-index__source">{hero.sourceLabel}</span>
                  <span className="news-index__dot" />
                  <time>{formatDate(hero.publishedAt)}</time>
                </div>
                <h1 className="news-index__hero-title">{hero.title}</h1>
                <p className="news-index__hero-excerpt">{hero.excerpt}</p>
              </div>
            </Link>
          ) : (
            <div className="news-index__hero-placeholder">Đang tải bài viết nổi bật...</div>
          )}

          {featured.length > 0 ? (
            <div className="news-index__hero-rail" aria-label="Bài viết nổi bật khác">
              {featured.map(article => (
                <HeroRailCard key={article.slug} article={article} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="news-index__filters">
        <div className="news-index__filter-group">
          <label htmlFor="news-source">Nguồn</label>
          <select
            id="news-source"
            value={draftFilters.source}
            onChange={event => setDraftFilters(current => ({ ...current, source: event.target.value }))}
          >
            <option value="">Tất cả nguồn</option>
            {sources.map(source => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </select>
        </div>

        <div className="news-index__filter-group">
          <label htmlFor="news-topic">Chủ đề</label>
          <select
            id="news-topic"
            value={draftFilters.topic}
            onChange={event => setDraftFilters(current => ({ ...current, topic: event.target.value }))}
          >
            <option value="">Tất cả chủ đề</option>
            {topics.map(topic => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>

        <div className="news-index__search-group">
          <label htmlFor="news-query">Tìm kiếm</label>
          <input
            id="news-query"
            type="search"
            placeholder="Tìm theo tiêu đề, tóm tắt, chủ đề..."
            value={draftFilters.q}
            onChange={event => setDraftFilters(current => ({ ...current, q: event.target.value }))}
          />
        </div>

        <button className="news-index__apply-button" type="button" onClick={() => setFilters(draftFilters)}>
          Áp dụng
        </button>
      </section>

      <section className="news-index__stream">
        <div className="news-index__section-head">
          <div>
            <span className="news-index__eyebrow">Dòng tin</span>
            <h2>Danh sách bài viết</h2>
          </div>
          <p>{loading ? 'Đang nạp...' : `Hiện có ${items.length}/${totalApprox} bài đang được hiển thị`}</p>
        </div>

        {error ? <div className="news-index__error">{error}</div> : null}

        {loading ? (
          <div className="news-index__empty">Đang tải tin tức...</div>
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
          <div className="news-index__empty">Chưa có bài viết phù hợp với bộ lọc hiện tại.</div>
        )}

        {cursor ? (
          <div className="news-index__more">
            <button type="button" className="news-index__more-button" onClick={() => void handleLoadMore()} disabled={loadingMore}>
              {loadingMore ? 'Đang tải thêm...' : 'Xem thêm bài viết'}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
