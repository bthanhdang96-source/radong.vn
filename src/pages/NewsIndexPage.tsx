import { useDeferredValue, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  CONTENT_FAMILY_DEFINITIONS,
  PRICE_GROUP_DEFINITIONS,
  buildContentFamilyPath,
  isContentFamilyRouteSlug,
  isPriceGroupRouteSlug,
} from '../data/contentTaxonomy'
import type {
  ContentCategoryModule,
  ContentFamilySummary,
  ContentFeedItem,
  ContentFeedResponse,
  PriceCommodityGroupSummary,
} from '../data/contentFeedTypes'
import { buildApiUrl } from '../lib/api'
import './NewsIndexPage.css'

const FALLBACK_NEWS_IMAGE = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
const CONTENT_FEED_CACHE_PREFIX = 'content-feed-cache:v3:'
const CONTENT_FEED_CACHE_MAX_AGE_MS = 60 * 60 * 1000
const DEFAULT_FEED_LIMIT = 24
const FAMILY_FEED_LIMIT = 30

type FeedCache = {
  savedAt: string
  payload: ContentFeedResponse
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

function formatRelativeTime(value: string) {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (!Number.isFinite(diffMinutes) || diffMinutes < 0) {
    return formatDate(value)
  }

  if (diffMinutes < 1) {
    return 'Vừa đăng'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} giờ trước`
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return `Hôm qua ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
  }

  return formatDate(value)
}

function buildNewsSearchPath(query: string) {
  return `/?q=${encodeURIComponent(query)}`
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
  return item.kind === 'news' || item.kind === 'ai_article' ? item.publishedAt : item.updatedAt
}

function getItemImageAlt(item: ContentFeedItem) {
  return 'thumbnailAlt' in item && item.thumbnailAlt ? item.thumbnailAlt : item.title
}

function buildFeedCacheKey(familySlug: string | null, priceGroupSlug: string | null, query: string) {
  return `${CONTENT_FEED_CACHE_PREFIX}${familySlug ?? 'all'}:${priceGroupSlug ?? 'all'}:${query.trim().toLowerCase()}`
}

function readContentFeedCache(cacheKey: string) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<FeedCache>
    if (
      typeof parsed.savedAt !== 'string' ||
      !parsed.payload?.items ||
      !parsed.payload?.taxonomy ||
      !parsed.payload?.modules ||
      typeof parsed.payload.hasMore !== 'boolean' ||
      !('nextCursor' in parsed.payload)
    ) {
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

function writeContentFeedCache(cacheKey: string, payload: ContentFeedResponse) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        payload,
      } satisfies FeedCache),
    )
  } catch {
    // Best-effort client cache.
  }
}

function getContentFeedItemKey(item: ContentFeedItem) {
  return `${item.kind}:${item.path}`
}

function mergeContentFeedItems(currentItems: ContentFeedItem[], nextItems: ContentFeedItem[]) {
  const seen = new Set(currentItems.map(getContentFeedItemKey))
  const merged = [...currentItems]

  for (const item of nextItems) {
    const key = getContentFeedItemKey(item)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(item)
  }

  return merged
}

function filterVisibleItems(items: ContentFeedItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return items
  }

  return items.filter(item => {
    const haystack = [
      item.title,
      item.excerpt,
      item.category,
      item.contentFamilyLabel,
      item.priceGroupLabel,
      item.topicTags.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery)
  })
}

function getRouteHeadline(familyLabel: string | null, priceGroupLabel: string | null) {
  if (priceGroupLabel) {
    return `Tin giá ${priceGroupLabel.toLowerCase()}`
  }

  if (familyLabel) {
    return familyLabel
  }

  return 'Cập nhật thị trường nông sản'
}

function ArticleCard({ item }: { item: ContentFeedItem }) {
  return (
    <article className="news-index__stream-card">
      <Link className="news-index__stream-image-link" to={item.path}>
        <img
          className="news-index__stream-image"
          src={item.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
          alt={getItemImageAlt(item)}
          loading="lazy"
          onError={handleImageError}
        />
      </Link>
      <div className="news-index__stream-body">
        <div className="news-index__meta-row">
          <time dateTime={getItemTimestamp(item)}>{formatRelativeTime(getItemTimestamp(item))}</time>
          <span className="news-index__tag news-index__tag--badge">{item.badgeLabel}</span>
        </div>
        <Link className="news-index__stream-title" to={item.path}>
          {item.title}
        </Link>
        <p className="news-index__stream-excerpt">{item.excerpt}</p>
        <div className="news-index__tag-row">
          <span className="news-index__tag">{item.contentFamilyLabel}</span>
          {item.priceGroupLabel ? <span className="news-index__tag">{item.priceGroupLabel}</span> : null}
          {item.topicTags.slice(0, 2).map(tag => (
            <Link key={tag} className="news-index__tag news-index__tag--link" to={buildNewsSearchPath(tag)}>
              #{tag}
            </Link>
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
          alt={getItemImageAlt(item)}
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

function SidebarModule({ module }: { module: ContentCategoryModule }) {
  return (
    <section className={`news-index__module ${module.isCurrent ? 'news-index__module--current' : ''}`}>
      <div className="news-index__module-head">
        <div className="news-index__module-title-row">
          <Link className="news-index__module-title" to={module.familyPath}>
            {module.familyLabel}
          </Link>
          <span className="news-index__module-count">{module.itemCount}</span>
        </div>
        <Link className="news-index__module-link" to={module.familyPath}>
          Xem tất cả
        </Link>
      </div>

      {module.subgroups?.length ? (
        <div className="news-index__module-subgroups">
          {module.subgroups.map(group => (
            <Link
              key={group.slug}
              className={`news-index__module-subgroup ${group.isCurrent ? 'news-index__module-subgroup--current' : ''}`}
              to={group.path}
            >
              <span>{group.label}</span>
              <small>{group.itemCount}</small>
            </Link>
          ))}
        </div>
      ) : null}

      {module.leadItem ? (
        <Link className="news-index__module-lead" to={module.leadItem.path}>
          <img
            className="news-index__module-image"
            src={module.leadItem.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
            alt={getItemImageAlt(module.leadItem)}
            loading="lazy"
            onError={handleImageError}
          />
          <div className="news-index__module-lead-body">
            <span className="news-index__tag news-index__tag--badge">{module.leadItem.badgeLabel}</span>
            <strong>{module.leadItem.title}</strong>
            {module.leadItem.excerpt ? <p>{module.leadItem.excerpt}</p> : null}
          </div>
        </Link>
      ) : (
        <div className="news-index__module-empty">Chưa có nội dung mới</div>
      )}

      {module.secondaryItems.length > 0 ? (
        <div className="news-index__module-list">
          {module.secondaryItems.map(item => (
            <Link key={`${item.kind}-${item.path}`} className="news-index__module-item" to={item.path}>
              <span>{item.title}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default function NewsIndexPage() {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const familySlug = params.familySlug
  const priceGroupSlug = params.priceGroupSlug
  const queryParam = searchParams.get('q') ?? ''

  const routeState = useMemo(() => {
    if (!familySlug && !priceGroupSlug) {
      return {
        family: null,
        priceGroup: null,
        invalid: false,
      }
    }

    if (!isContentFamilyRouteSlug(familySlug)) {
      return {
        family: null,
        priceGroup: null,
        invalid: true,
      }
    }

    if (!priceGroupSlug) {
      return {
        family: familySlug,
        priceGroup: null,
        invalid: false,
      }
    }

    if (familySlug !== 'tin-gia-nong-san' || !isPriceGroupRouteSlug(priceGroupSlug)) {
      return {
        family: familySlug,
        priceGroup: null,
        invalid: true,
      }
    }

    return {
      family: familySlug,
      priceGroup: priceGroupSlug,
      invalid: false,
    }
  }, [familySlug, priceGroupSlug])

  const baseRequestLimit = routeState.family ? FAMILY_FEED_LIMIT : DEFAULT_FEED_LIMIT
  const [searchQuery, setSearchQuery] = useState(queryParam)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const feedQuery = deferredSearchQuery.trim()
  const cacheKey = useMemo(
    () => buildFeedCacheKey(routeState.family, routeState.priceGroup, feedQuery),
    [feedQuery, routeState.family, routeState.priceGroup],
  )
  const cachedFeed = useMemo(() => readContentFeedCache(cacheKey), [cacheKey])

  const [payload, setPayload] = useState<ContentFeedResponse | null>(() => cachedFeed?.payload ?? null)
  const [loading, setLoading] = useState(!cachedFeed && !routeState.invalid)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSearchQuery(queryParam)
  }, [queryParam, routeState.family, routeState.priceGroup])

  function updateSearchQuery(value: string) {
    setSearchQuery(value)
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (value.trim()) {
        next.set('q', value)
      } else {
        next.delete('q')
      }

      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (routeState.invalid) {
      setPayload(null)
      setLoading(false)
      setError('Không tìm thấy chuyên mục bạn đang mở.')
      return
    }

    let active = true
    const controller = new AbortController()

    setPayload(cachedFeed?.payload ?? null)
    setError(null)
    setLoading(!cachedFeed)
    setLoadingMore(false)

    async function loadFeed() {
      try {
        const params = new URLSearchParams({
          limit: String(baseRequestLimit),
          includeModules: 'true',
        })

        if (routeState.family) {
          params.set('family', routeState.family)
        }

        if (routeState.priceGroup) {
          params.set('priceGroup', routeState.priceGroup)
        }

        if (feedQuery) {
          params.set('q', feedQuery)
        }

        const response = await fetch(buildApiUrl(`/api/content/feed?${params.toString()}`), {
          signal: controller.signal,
        })
        const json: ContentFeedResponse & { error?: string } = await response.json()
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải hub nội dung')
        }

        if (!active) {
          return
        }

        setPayload(json)
        setError(null)
        writeContentFeedCache(cacheKey, json)
      } catch (fetchError) {
        if (!active || controller.signal.aborted) {
          return
        }

        if (!cachedFeed) {
          setPayload(null)
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải hub nội dung')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadFeed()

    return () => {
      active = false
      controller.abort()
    }
  }, [baseRequestLimit, cacheKey, cachedFeed, feedQuery, routeState.family, routeState.invalid, routeState.priceGroup])

  async function loadMoreFeedItems() {
    if (!payload?.nextCursor || loadingMore) {
      return
    }

    setLoadingMore(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(baseRequestLimit),
        includeModules: 'false',
        cursor: payload.nextCursor,
      })

      if (routeState.family) {
        params.set('family', routeState.family)
      }

      if (routeState.priceGroup) {
        params.set('priceGroup', routeState.priceGroup)
      }

      if (feedQuery) {
        params.set('q', feedQuery)
      }

      const response = await fetch(buildApiUrl(`/api/content/feed?${params.toString()}`))
      const json: ContentFeedResponse & { error?: string } = await response.json()
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Không thể tải thêm nội dung')
      }

      setPayload(current => {
        const mergedPayload: ContentFeedResponse = current
          ? {
              ...json,
              items: mergeContentFeedItems(current.items, json.items),
              taxonomy: current.taxonomy,
              modules: current.modules.length > 0 ? current.modules : json.modules,
            }
          : json

        writeContentFeedCache(cacheKey, mergedPayload)
        return mergedPayload
      })
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải thêm nội dung')
    } finally {
      setLoadingMore(false)
    }
  }

  const families: ContentFamilySummary[] = payload?.taxonomy.families ?? CONTENT_FAMILY_DEFINITIONS.map((item, index) => ({
    slug: item.slug,
    label: item.label,
    path: item.path,
    order: index + 1,
    itemCount: 0,
  }))
  const priceGroups: PriceCommodityGroupSummary[] =
    payload?.taxonomy.priceGroups ??
    PRICE_GROUP_DEFINITIONS.map(item => ({
      slug: item.slug,
      label: item.label,
      path: item.path,
      itemCount: 0,
    }))
  const modules = payload?.modules ?? []
  const filteredItems = useMemo(
    () => filterVisibleItems(payload?.items ?? [], deferredSearchQuery),
    [deferredSearchQuery, payload?.items],
  )
  const currentFamilyLabel =
    routeState.family ? families.find(item => item.slug === routeState.family)?.label ?? null : null
  const currentPriceGroupLabel =
    routeState.priceGroup ? priceGroups.find(item => item.slug === routeState.priceGroup)?.label ?? null : null
  const hero = filteredItems[0] ?? null
  const featured = filteredItems.slice(1, 5)
  const streamItems = filteredItems.length > 5 ? filteredItems.slice(5) : filteredItems.slice(1)
  const canLoadMore = !loading && !routeState.invalid && Boolean(payload?.hasMore && payload.nextCursor)

  if (routeState.invalid) {
    return (
      <main className="news-index news-index--state">
        <div className="news-index__error">
          <p>{error ?? 'Không tìm thấy chuyên mục bạn đang mở.'}</p>
          <Link to="/" className="news-index__back-link">
            Quay lại trang tin tức
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="news-index">
      <section className="news-index__hero-shell">
        <div className="news-index__hero-frame">
          <div className="news-index__tabs-shell">
            <div className="news-index__tabs" role="tablist" aria-label="Nhóm nội dung">
              <Link
                className={`news-index__tab ${routeState.family ? '' : 'news-index__tab--active'}`}
                to="/"
                role="tab"
                aria-selected={!routeState.family}
              >
                Tất cả
              </Link>
              {families.map(family => (
                <Link
                  key={family.slug}
                  className={`news-index__tab ${routeState.family === family.slug ? 'news-index__tab--active' : ''}`}
                  to={family.path}
                  role="tab"
                  aria-selected={routeState.family === family.slug}
                >
                  <span>{family.label}</span>
                  <small>{family.itemCount}</small>
                </Link>
              ))}
            </div>

            <div className="news-index__search-group">
              <input
                id="news-query"
                type="search"
                aria-label="Tìm trong danh sách đang xem"
                placeholder="Tìm theo tiêu đề, mô tả, nhóm nội dung..."
                value={searchQuery}
                onChange={event => updateSearchQuery(event.target.value)}
              />
            </div>
          </div>

          {routeState.family === 'tin-gia-nong-san' ? (
            <div className="news-index__subtabs" role="tablist" aria-label="Nhóm nông sản">
              <Link
                className={`news-index__subtab ${routeState.priceGroup ? '' : 'news-index__subtab--active'}`}
                to={buildContentFamilyPath('tin-gia-nong-san')}
                role="tab"
                aria-selected={!routeState.priceGroup}
              >
                Tất cả nhóm
              </Link>
              {priceGroups.map(group => (
                <Link
                  key={group.slug}
                  className={`news-index__subtab ${routeState.priceGroup === group.slug ? 'news-index__subtab--active' : ''}`}
                  to={group.path}
                  role="tab"
                  aria-selected={routeState.priceGroup === group.slug}
                >
                  <span>{group.label}</span>
                  <small>{group.itemCount}</small>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="news-index__hero-copy">
            <h1>{getRouteHeadline(currentFamilyLabel, currentPriceGroupLabel)}</h1>
          </div>

          {hero ? (
            <Link className="news-index__hero-lead" to={hero.path}>
              <div className="news-index__hero-lead-media">
                <img
                  className="news-index__hero-image"
                  src={hero.thumbnailUrl ?? FALLBACK_NEWS_IMAGE}
                  alt={getItemImageAlt(hero)}
                  onError={handleImageError}
                />
              </div>
              <div className="news-index__hero-lead-body">
                <div className="news-index__meta-row">
                  <time dateTime={getItemTimestamp(hero)}>{formatRelativeTime(getItemTimestamp(hero))}</time>
                  <span className="news-index__tag news-index__tag--badge">{hero.badgeLabel}</span>
                </div>
                <h2 className="news-index__hero-title">{hero.title}</h2>
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

      <section className="news-index__layout">
        <div className="news-index__main-column">
          <div className="news-index__section-head">
            <div>
              <span className="news-index__eyebrow">Danh sách bài</span>
              <h2>Nội dung theo nhóm đang mở</h2>
            </div>
            <p>{loading ? 'Đang nạp...' : `${filteredItems.length} kết quả`}</p>
          </div>

          {error ? <div className="news-index__error">{error}</div> : null}

          {loading ? (
            <div className="news-index__empty">Đang tải nội dung...</div>
          ) : streamItems.length > 0 ? (
            <div className="news-index__stream-list">
              {streamItems.map(item => (
                <ArticleCard key={`${item.kind}-${item.path}`} item={item} />
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="news-index__empty">Danh sách đang ngắn vì các mục đã được đưa lên phần nổi bật phía trên.</div>
          ) : (
            <div className="news-index__empty">Chưa có nội dung phù hợp với cách lọc hiện tại.</div>
          )}

          {canLoadMore ? (
            <div className="news-index__load-more">
              <button type="button" onClick={loadMoreFeedItems} disabled={loadingMore}>
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          ) : null}
        </div>

        <aside className="news-index__aside">
          <div className="news-index__aside-shell">
            <div className="news-index__aside-head">
              <span className="news-index__eyebrow">Truy cập nhanh</span>
              <h2>Theo nhóm nội dung</h2>
            </div>
            <div className="news-index__module-stack">
              {modules.map(module => (
                <SidebarModule key={module.familySlug} module={module} />
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}
