import { useDeferredValue, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
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
const CONTENT_FEED_CACHE_PREFIX = 'content-feed-cache:v2:'
const CONTENT_FEED_CACHE_MAX_AGE_MS = 60 * 60 * 1000

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

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === 'true') {
    return
  }

  target.dataset.fallbackApplied = 'true'
  target.src = FALLBACK_NEWS_IMAGE
}

function getItemTimestamp(item: ContentFeedItem) {
  return item.kind === 'news' ? item.publishedAt : item.updatedAt
}

function getItemImageAlt(item: ContentFeedItem) {
  return 'thumbnailAlt' in item && item.thumbnailAlt ? item.thumbnailAlt : item.title
}

function buildFeedCacheKey(familySlug: string | null, priceGroupSlug: string | null, limit: number) {
  return `${CONTENT_FEED_CACHE_PREFIX}${familySlug ?? 'all'}:${priceGroupSlug ?? 'all'}:${limit}`
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
    if (typeof parsed.savedAt !== 'string' || !parsed.payload?.items || !parsed.payload?.taxonomy || !parsed.payload?.modules) {
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

  return 'Tin tức và trang giá tự động'
}

function getRouteDescription(familyLabel: string | null, priceGroupLabel: string | null) {
  if (priceGroupLabel) {
    return `Theo dõi các bài báo giá thuộc nhóm ${priceGroupLabel.toLowerCase()}, kèm cập nhật mới nhất và đường dẫn nhanh sang trang chi tiết.`
  }

  if (familyLabel === 'Tin giá nông sản') {
    return 'Tổng hợp các bài báo giá tự động theo mặt hàng, có thể đi tiếp sang từng nhóm nông sản ngay trên trang.'
  }

  if (familyLabel) {
    return `Theo dõi các nội dung mới nhất trong chuyên mục ${familyLabel.toLowerCase()}.`
  }

  return 'Theo dõi tin thị trường, bài báo giá và các nội dung chuyên môn trên cùng một hub dễ truy cập hơn.'
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
          <time>{formatDate(getItemTimestamp(item))}</time>
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
  const familySlug = params.familySlug
  const priceGroupSlug = params.priceGroupSlug

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

  const requestLimit = routeState.family ? 30 : 24
  const cacheKey = useMemo(
    () => buildFeedCacheKey(routeState.family, routeState.priceGroup, requestLimit),
    [routeState.family, routeState.priceGroup, requestLimit],
  )
  const cachedFeed = useMemo(() => readContentFeedCache(cacheKey), [cacheKey])

  const [payload, setPayload] = useState<ContentFeedResponse | null>(() => cachedFeed?.payload ?? null)
  const [loading, setLoading] = useState(!cachedFeed && !routeState.invalid)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    setSearchQuery('')
  }, [routeState.family, routeState.priceGroup])

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

    async function loadFeed() {
      try {
        const params = new URLSearchParams({
          limit: String(requestLimit),
          includeModules: 'true',
        })

        if (routeState.family) {
          params.set('family', routeState.family)
        }

        if (routeState.priceGroup) {
          params.set('priceGroup', routeState.priceGroup)
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
  }, [cacheKey, cachedFeed, requestLimit, routeState.family, routeState.invalid, routeState.priceGroup])

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
          <div className="news-index__hero-topbar">
            <span className="news-index__eyebrow">Hub tin tức nông sản</span>
          </div>

          <div className="news-index__tabs-shell">
            <div className="news-index__tabs" role="tablist" aria-label="Nhóm nội dung">
              <Link
                className={`news-index__tab ${routeState.family ? '' : 'news-index__tab--active'}`}
                to="/"
              >
                Tất cả
              </Link>
              {families.map(family => (
                <Link
                  key={family.slug}
                  className={`news-index__tab ${routeState.family === family.slug ? 'news-index__tab--active' : ''}`}
                  to={family.path}
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
                onChange={event => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          {routeState.family === 'tin-gia-nong-san' ? (
            <div className="news-index__subtabs" aria-label="Nhóm nông sản">
              <Link
                className={`news-index__subtab ${routeState.priceGroup ? '' : 'news-index__subtab--active'}`}
                to={buildContentFamilyPath('tin-gia-nong-san')}
              >
                Tất cả nhóm
              </Link>
              {priceGroups.map(group => (
                <Link
                  key={group.slug}
                  className={`news-index__subtab ${routeState.priceGroup === group.slug ? 'news-index__subtab--active' : ''}`}
                  to={group.path}
                >
                  <span>{group.label}</span>
                  <small>{group.itemCount}</small>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="news-index__hero-copy">
            <div>
              <span className="news-index__eyebrow">Luồng chính</span>
              <h1>{getRouteHeadline(currentFamilyLabel, currentPriceGroupLabel)}</h1>
              <p>{getRouteDescription(currentFamilyLabel, currentPriceGroupLabel)}</p>
            </div>
            <div className="news-index__hero-copy-meta">
              <div className="news-index__hero-stats" aria-label="Tổng quan nội dung">
                <span>{payload?.items.length ?? 0} mục đang hiển thị</span>
                <span>{modules.length} nhóm truy cập nhanh</span>
              </div>
              <p style={{ marginTop: '0.65rem' }}>
                {loading ? 'Đang nạp dữ liệu...' : `${filteredItems.length} mục phù hợp trong ngữ cảnh hiện tại`}
              </p>
            </div>
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
                  <time>{formatDate(getItemTimestamp(hero))}</time>
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
            <p>{loading ? 'Đang nạp...' : `${filteredItems.length} mục phù hợp`}</p>
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
