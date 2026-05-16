import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import type { ContentFeedItem, ContentFeedResponse } from '../data/contentFeedTypes'
import { buildApiUrl } from '../lib/api'
import './NewsIndexPage.css'

const FALLBACK_NEWS_IMAGE = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
const CONTENT_FEED_CACHE_KEY = 'content-feed-cache:v1'
const CONTENT_FEED_CACHE_MAX_AGE_MS = 60 * 60 * 1000

type FeedCache = {
  savedAt: string
  items: ContentFeedItem[]
}

type FilterState = {
  topic: string
  q: string
}

const DEFAULT_FILTERS: FilterState = { topic: '', q: '' }

function readContentFeedCache() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(CONTENT_FEED_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<FeedCache>
    if (!Array.isArray(parsed.items) || typeof parsed.savedAt !== 'string') {
      return null
    }

    const ageMs = Date.now() - new Date(parsed.savedAt).getTime()
    if (!Number.isFinite(ageMs) || ageMs > CONTENT_FEED_CACHE_MAX_AGE_MS) {
      return null
    }

    return parsed as FeedCache
  } catch {
    return null
  }
}

function writeContentFeedCache(items: ContentFeedItem[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      CONTENT_FEED_CACHE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        items,
      } satisfies FeedCache),
    )
  } catch {
    // Best-effort client cache.
  }
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

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === 'true') {
    return
  }

  target.dataset.fallbackApplied = 'true'
  target.src = FALLBACK_NEWS_IMAGE
}

function getItemTimestamp(item: ContentFeedItem) {
  return item.kind === 'price_page' ? item.updatedAt : item.publishedAt
}

function filterItems(items: ContentFeedItem[], filters: FilterState) {
  const query = filters.q.trim().toLowerCase()

  return items.filter(item => {
    if (filters.topic && !item.topicTags.includes(filters.topic)) {
      return false
    }

    if (!query) {
      return true
    }

    const haystack = [item.title, item.excerpt, item.category, item.topicTags.join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

function ArticleCard({ item }: { item: ContentFeedItem }) {
  return (
    <article className="news-index__stream-card">
      <Link className="news-index__stream-image-link" to={item.path}>
        <img
          className="news-index__stream-image"
          src={item.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
          alt={item.title}
          loading="lazy"
          onError={handleImageError}
        />
      </Link>
      <div className="news-index__stream-body">
        <div className="news-index__meta-row">
          <time>{formatDate(getItemTimestamp(item))}</time>
          <span className="news-index__tag news-index__tag--badge">{item.badgeLabel}</span>
        </div>
        <Link className="news-index__stream-title" to={item.path}>
          {item.title}
        </Link>
        <p className="news-index__stream-excerpt">{item.excerpt}</p>
        <div className="news-index__tag-row">
          {item.topicTags.slice(0, 3).map(tag => (
            <span key={tag} className="news-index__tag">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

function HeroRailCard({ item }: { item: ContentFeedItem }) {
  return (
    <Link className="news-index__hero-rail-card" to={item.path}>
      <div className="news-index__hero-rail-media">
        <img
          className="news-index__hero-rail-image"
          src={item.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
          alt={item.title}
          loading="lazy"
          onError={handleImageError}
        />
      </div>
      <div className="news-index__hero-rail-body">
        <span className="news-index__tag news-index__tag--badge">{item.badgeLabel}</span>
        <strong>{item.title}</strong>
      </div>
    </Link>
  )
}

export default function NewsIndexPage() {
  const cachedFeed = useMemo(() => readContentFeedCache(), [])
  const [items, setItems] = useState<ContentFeedItem[]>(() => cachedFeed?.items ?? [])
  const [loading, setLoading] = useState(!cachedFeed)
  const [error, setError] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  useEffect(() => {
    let active = true

    async function loadFeed() {
      try {
        const response = await fetch(buildApiUrl('/api/content/feed?limit=24'))
        const json: ContentFeedResponse = await response.json()
        if (!response.ok || !json.success) {
          throw new Error('Không thể tải feed nội dung')
        }

        if (!active) {
          return
        }

        setItems(json.items)
        setError(null)
        writeContentFeedCache(json.items)
      } catch (fetchError) {
        if (!active) {
          return
        }

        if (!cachedFeed) {
          setItems([])
        }
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải feed nội dung')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadFeed()

    return () => {
      active = false
    }
  }, [cachedFeed])

  const topics = useMemo(
    () => [...new Set(items.flatMap(item => item.topicTags))].sort((left, right) => left.localeCompare(right)),
    [items],
  )
  const filteredItems = useMemo(() => filterItems(items, filters), [filters, items])
  const hero = filteredItems[0] ?? null
  const featured = filteredItems.slice(1, 5)
  const stream = filteredItems.slice(5)

  return (
    <main className="news-index">
      <section className="news-index__hero-shell">
        <div className="news-index__hero-frame">
          <div className="news-index__hero-topbar">
            <span className="news-index__eyebrow">Tin tức và phân tích giá tự động</span>
            <div className="news-index__hero-stats" aria-label="Tổng quan nội dung">
              <span>{filteredItems.length} mục</span>
              <span>{topics.length} chủ đề</span>
            </div>
          </div>

          {hero ? (
            <Link className="news-index__hero-lead" to={hero.path}>
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
                  <time>{formatDate(getItemTimestamp(hero))}</time>
                  <span className="news-index__tag news-index__tag--badge">{hero.badgeLabel}</span>
                </div>
                <h1 className="news-index__hero-title">{hero.title}</h1>
                <p className="news-index__hero-excerpt">{hero.excerpt}</p>
              </div>
            </Link>
          ) : (
            <div className="news-index__hero-placeholder">Đang tải nội dung nổi bật...</div>
          )}

          {featured.length > 0 ? (
            <div className="news-index__hero-rail" aria-label="Nội dung nổi bật khác">
              {featured.map(item => (
                <HeroRailCard key={`${item.kind}-${item.path}`} item={item} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="news-index__filters">
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
            <span className="news-index__eyebrow">Dòng nội dung</span>
            <h2>Tin tức và trang giá tự động</h2>
          </div>
          <p>{loading ? 'Đang nạp...' : `Hiện có ${filteredItems.length} mục nội dung`}</p>
        </div>

        {error ? <div className="news-index__error">{error}</div> : null}

        {loading ? (
          <div className="news-index__empty">Đang tải nội dung...</div>
        ) : filteredItems.length > 0 ? (
          <div className="news-index__stream-list">
            {(stream.length > 0 ? stream : filteredItems).map(item => (
              <ArticleCard key={`${item.kind}-${item.path}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="news-index__empty">Chưa có nội dung phù hợp với bộ lọc hiện tại.</div>
        )}
      </section>
    </main>
  )
}
