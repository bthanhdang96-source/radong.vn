import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { buildApiUrl } from '../lib/api'
import './AdminAiArticlesPage.css'

type AiArticleStatus = 'draft' | 'published' | 'archived' | 'failed'
type ReviewableAiArticleStatus = Exclude<AiArticleStatus, 'failed'>

type AiArticleSummary = {
  id: string
  slug: string
  path: string
  articleType: string
  title: string
  excerpt: string | null
  thumbnailUrl: string | null
  sourceLabel: string
  publishedAt: string
  updatedAt: string
  category: string | null
  topicTags: string[]
  contentFamilyLabel: string
  badgeLabel: string
  dataGranularity: string
  primaryPeriodCode: string | null
  primaryObservedOn: string | null
  status: AiArticleStatus
}

type AiArticleDetail = AiArticleSummary & {
  contentHtml: string | null
  contentText: string | null
  canonicalUrl: string
  fetchedAt: string
  sourceFacts: Record<string, unknown>
  seo: Record<string, unknown>
}

type AdminListResponse = {
  success: boolean
  items: AiArticleSummary[]
  error?: string
}

type AdminDetailResponse = {
  success: boolean
  article: AiArticleDetail
  error?: string
}

const ADMIN_KEY_STORAGE_KEY = 'nongsanvn-admin-api-key'
const STATUS_FILTERS: Array<AiArticleStatus | 'all'> = ['draft', 'published', 'archived', 'failed', 'all']
const REVIEWABLE_STATUSES: ReviewableAiArticleStatus[] = ['draft', 'published', 'archived']

function readStoredAdminKey() {
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeStoredAdminKey(value: string) {
  try {
    if (value) {
      window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, value)
    } else {
      window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY)
    }
  } catch {
    // Local storage is optional; the page can still use in-memory state.
  }
}

function statusLabel(value: AiArticleStatus | 'all') {
  switch (value) {
    case 'draft':
      return 'Chờ duyệt'
    case 'published':
      return 'Đã public'
    case 'archived':
      return 'Lưu trữ'
    case 'failed':
      return 'Lỗi'
    case 'all':
      return 'Tất cả'
    default:
      return value
  }
}

function articleTypeLabel(value: string) {
  switch (value) {
    case 'export_period_report':
      return 'Xuất khẩu theo kỳ'
    case 'export_monthly_report':
      return 'Xuất khẩu tháng'
    case 'world_daily_price_update':
      return 'Giá thế giới ngày'
    default:
      return value
  }
}

function formatTimestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('vi-VN') : '--'
}

function buildHeaders(adminKey: string) {
  return {
    'content-type': 'application/json',
    'x-admin-key': adminKey,
  }
}

function getArticleDate(article: AiArticleSummary) {
  return article.status === 'published' ? article.publishedAt : article.updatedAt
}

export default function AdminAiArticlesPage() {
  const [adminKey, setAdminKey] = useState(readStoredAdminKey)
  const [keyInput, setKeyInput] = useState(adminKey)
  const [statusFilter, setStatusFilter] = useState<AiArticleStatus | 'all'>('draft')
  const [items, setItems] = useState<AiArticleSummary[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<AiArticleDetail | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savingStatus, setSavingStatus] = useState<ReviewableAiArticleStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adminKey) {
      setItems([])
      setSelectedSlug(null)
      setSelectedArticle(null)
      return
    }

    let active = true

    async function loadItems() {
      setLoadingList(true)
      setError(null)
      try {
        const response = await fetch(buildApiUrl(`/api/admin/ai-articles?status=${statusFilter}&limit=80`), {
          headers: buildHeaders(adminKey),
        })
        const json = (await response.json()) as AdminListResponse
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải danh sách bài AI')
        }

        if (!active) {
          return
        }

        setItems(json.items)
        setSelectedSlug(current => {
          if (current && json.items.some(item => item.slug === current)) {
            return current
          }
          return json.items[0]?.slug ?? null
        })
      } catch (fetchError) {
        if (!active) {
          return
        }

        setItems([])
        setSelectedSlug(null)
        setSelectedArticle(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải danh sách bài AI')
      } finally {
        if (active) {
          setLoadingList(false)
        }
      }
    }

    void loadItems()

    return () => {
      active = false
    }
  }, [adminKey, statusFilter])

  useEffect(() => {
    if (!adminKey || !selectedSlug) {
      setSelectedArticle(null)
      return
    }

    let active = true

    async function loadArticle() {
      setLoadingDetail(true)
      setError(null)
      try {
        const response = await fetch(buildApiUrl(`/api/admin/ai-articles/${selectedSlug}`), {
          headers: buildHeaders(adminKey),
        })
        const json = (await response.json()) as AdminDetailResponse
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải bài AI')
        }

        if (!active) {
          return
        }

        setSelectedArticle(json.article)
      } catch (fetchError) {
        if (!active) {
          return
        }

        setSelectedArticle(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải bài AI')
      } finally {
        if (active) {
          setLoadingDetail(false)
        }
      }
    }

    void loadArticle()

    return () => {
      active = false
    }
  }, [adminKey, selectedSlug])

  const sanitizedHtml = useMemo(() => {
    return selectedArticle?.contentHtml ? DOMPurify.sanitize(selectedArticle.contentHtml) : ''
  }, [selectedArticle?.contentHtml])

  const sourceFactsJson = useMemo(() => {
    return selectedArticle ? JSON.stringify(selectedArticle.sourceFacts, null, 2) : ''
  }, [selectedArticle])

  function saveAdminKey() {
    const trimmed = keyInput.trim()
    writeStoredAdminKey(trimmed)
    setAdminKey(trimmed)
  }

  function clearAdminKey() {
    writeStoredAdminKey('')
    setAdminKey('')
    setKeyInput('')
  }

  async function updateStatus(nextStatus: ReviewableAiArticleStatus) {
    if (!adminKey || !selectedArticle) {
      return
    }

    setSavingStatus(nextStatus)
    setError(null)
    try {
      const response = await fetch(buildApiUrl(`/api/admin/ai-articles/${selectedArticle.slug}`), {
        method: 'PATCH',
        headers: buildHeaders(adminKey),
        body: JSON.stringify({ status: nextStatus }),
      })
      const json = (await response.json()) as AdminDetailResponse
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Không thể cập nhật trạng thái')
      }

      setSelectedArticle(json.article)
      setItems(current => current.map(item => (item.slug === json.article.slug ? json.article : item)))
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể cập nhật trạng thái')
    } finally {
      setSavingStatus(null)
    }
  }

  return (
    <main className="admin-ai">
      <header className="admin-ai__topbar">
        <div>
          <span className="admin-ai__eyebrow">Admin</span>
          <h1>Duyệt bài AI</h1>
        </div>
        <form
          className="admin-ai__key-form"
          onSubmit={event => {
            event.preventDefault()
            saveAdminKey()
          }}
        >
          <input
            type="password"
            value={keyInput}
            onChange={event => setKeyInput(event.target.value)}
            placeholder="ADMIN_API_KEY"
            autoComplete="current-password"
          />
          <button type="submit">Kết nối</button>
          {adminKey ? (
            <button type="button" className="admin-ai__button--secondary" onClick={clearAdminKey}>
              Xóa key
            </button>
          ) : null}
        </form>
      </header>

      <section className="admin-ai__filters" aria-label="Lọc trạng thái">
        {STATUS_FILTERS.map(status => (
          <button
            key={status}
            type="button"
            className={statusFilter === status ? 'admin-ai__filter admin-ai__filter--active' : 'admin-ai__filter'}
            onClick={() => setStatusFilter(status)}
          >
            {statusLabel(status)}
          </button>
        ))}
      </section>

      {error ? <div className="admin-ai__notice admin-ai__notice--error">{error}</div> : null}

      <section className="admin-ai__workspace">
        <aside className="admin-ai__list" aria-label="Danh sách bài AI">
          <div className="admin-ai__list-head">
            <strong>{statusLabel(statusFilter)}</strong>
            <span>{loadingList ? 'Đang tải' : `${items.length} bài`}</span>
          </div>

          {items.length > 0 ? (
            <div className="admin-ai__article-list">
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={item.slug === selectedSlug ? 'admin-ai__article-row admin-ai__article-row--active' : 'admin-ai__article-row'}
                  onClick={() => setSelectedSlug(item.slug)}
                >
                  <span className={`admin-ai__status admin-ai__status--${item.status}`}>{statusLabel(item.status)}</span>
                  <strong>{item.title}</strong>
                  <span>{articleTypeLabel(item.articleType)}</span>
                  <time>{formatTimestamp(getArticleDate(item))}</time>
                </button>
              ))}
            </div>
          ) : (
            <div className="admin-ai__empty">{adminKey ? 'Không có bài phù hợp' : 'Chưa có admin key'}</div>
          )}
        </aside>

        <article className="admin-ai__preview">
          {loadingDetail ? <div className="admin-ai__empty">Đang tải bài...</div> : null}

          {!loadingDetail && selectedArticle ? (
            <>
              <div className="admin-ai__preview-head">
                <div className="admin-ai__preview-meta">
                  <span className={`admin-ai__status admin-ai__status--${selectedArticle.status}`}>
                    {statusLabel(selectedArticle.status)}
                  </span>
                  <span>{articleTypeLabel(selectedArticle.articleType)}</span>
                  <span>{selectedArticle.contentFamilyLabel}</span>
                </div>
                <div className="admin-ai__actions">
                  {REVIEWABLE_STATUSES.map(status => (
                    <button
                      key={status}
                      type="button"
                      disabled={savingStatus !== null || selectedArticle.status === status}
                      onClick={() => void updateStatus(status)}
                    >
                      {savingStatus === status ? 'Đang lưu' : statusLabel(status)}
                    </button>
                  ))}
                  <a href={selectedArticle.path} target="_blank" rel="noreferrer">
                    Mở public
                  </a>
                </div>
              </div>

              <header className="admin-ai__article-head">
                <h2>{selectedArticle.title}</h2>
                <p>{selectedArticle.excerpt}</p>
                <dl>
                  <div>
                    <dt>Cập nhật</dt>
                    <dd>{formatTimestamp(selectedArticle.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Public</dt>
                    <dd>{selectedArticle.status === 'published' ? formatTimestamp(selectedArticle.publishedAt) : '--'}</dd>
                  </div>
                  <div>
                    <dt>Kỳ dữ liệu</dt>
                    <dd>{selectedArticle.primaryPeriodCode ?? selectedArticle.primaryObservedOn ?? '--'}</dd>
                  </div>
                </dl>
              </header>

              {sanitizedHtml ? (
                <div className="admin-ai__body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              ) : (
                <div className="admin-ai__body admin-ai__body--text">
                  <p>{selectedArticle.contentText}</p>
                </div>
              )}

              <details className="admin-ai__facts">
                <summary>Dữ liệu nguồn</summary>
                <pre>{sourceFactsJson}</pre>
              </details>
            </>
          ) : null}

          {!loadingDetail && !selectedArticle ? <div className="admin-ai__empty">Chọn một bài để duyệt</div> : null}
        </article>
      </section>
    </main>
  )
}
