import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { buildApiUrl } from '../lib/api'
import './AdminAiArticlesPage.css'

type AiArticleStatus = 'draft' | 'published' | 'archived' | 'failed'
type ReviewableAiArticleStatus = Exclude<AiArticleStatus, 'failed'>
type AiArticleTypeFilter = 'all' | 'export_period_report' | 'export_monthly_report' | 'world_daily_price_update' | 'agri_blog'
type AiBlogAudience = 'farmer' | 'trader' | 'exporter'
type AiBlogStyle = 'guide' | 'analysis' | 'market_note'
type AiBlogTopicSeedStatus = 'pending' | 'used' | 'archived'

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
  quality: Record<string, unknown>
}

type AiBlogTopicSeed = {
  id: string
  topicKey: string
  audience: AiBlogAudience
  headlineHint: string
  keywordMain: string
  keywordsSub: string[]
  style: AiBlogStyle
  priority: number
  status: AiBlogTopicSeedStatus
  sourceRef: Record<string, unknown>
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
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

type BlogSeedListResponse = {
  success: boolean
  items: AiBlogTopicSeed[]
  error?: string
}

type BlogSeedMutationResponse = {
  success: boolean
  seed: AiBlogTopicSeed
  error?: string
}

type GenerateResponse = {
  success: boolean
  status: string
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  errors?: string[]
  error?: string
}

const ADMIN_KEY_STORAGE_KEY = 'nongsanvn-admin-api-key'
const STATUS_FILTERS: Array<AiArticleStatus | 'all'> = ['draft', 'published', 'archived', 'failed', 'all']
const ARTICLE_TYPE_FILTERS: AiArticleTypeFilter[] = ['all', 'agri_blog', 'world_daily_price_update', 'export_period_report', 'export_monthly_report']
const REVIEWABLE_STATUSES: ReviewableAiArticleStatus[] = ['draft', 'published', 'archived']
const BLOG_AUDIENCES: AiBlogAudience[] = ['farmer', 'trader', 'exporter']
const BLOG_STYLES: AiBlogStyle[] = ['guide', 'market_note', 'analysis']

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
    case 'agri_blog':
      return 'Blog nông nghiệp'
    case 'all':
      return 'Tất cả loại'
    default:
      return value
  }
}

function audienceLabel(value: AiBlogAudience | string | null | undefined) {
  switch (value) {
    case 'farmer':
      return 'Nông dân'
    case 'trader':
      return 'Tiểu thương'
    case 'exporter':
      return 'Doanh nghiệp xuất khẩu'
    default:
      return value ?? '--'
  }
}

function styleLabel(value: AiBlogStyle | string | null | undefined) {
  switch (value) {
    case 'guide':
      return 'Hướng dẫn'
    case 'market_note':
      return 'Ghi chú thị trường'
    case 'analysis':
      return 'Phân tích'
    default:
      return value ?? '--'
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
  const [articleTypeFilter, setArticleTypeFilter] = useState<AiArticleTypeFilter>('all')
  const [items, setItems] = useState<AiArticleSummary[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<AiArticleDetail | null>(null)
  const [blogSeeds, setBlogSeeds] = useState<AiBlogTopicSeed[]>([])
  const [seedForm, setSeedForm] = useState({
    audience: 'farmer' as AiBlogAudience,
    style: 'guide' as AiBlogStyle,
    headlineHint: '',
    keywordMain: '',
    keywordsSub: '',
    priority: 50,
  })
  const [generateAudience, setGenerateAudience] = useState<'all' | AiBlogAudience>('all')
  const [dailyLimit, setDailyLimit] = useState(3)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingSeeds, setLoadingSeeds] = useState(false)
  const [creatingSeed, setCreatingSeed] = useState(false)
  const [generatingBlog, setGeneratingBlog] = useState(false)
  const [savingStatus, setSavingStatus] = useState<ReviewableAiArticleStatus | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!adminKey) {
      setItems([])
      setBlogSeeds([])
      setSelectedSlug(null)
      setSelectedArticle(null)
      return
    }

    let active = true

    async function loadItems() {
      setLoadingList(true)
      setError(null)
      try {
        const params = new URLSearchParams({ status: statusFilter, limit: '80' })
        if (articleTypeFilter !== 'all') {
          params.set('articleType', articleTypeFilter)
        }
        const response = await fetch(buildApiUrl(`/api/admin/ai-articles?${params.toString()}`), {
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
  }, [adminKey, statusFilter, articleTypeFilter, refreshToken])

  useEffect(() => {
    if (!adminKey) {
      return
    }

    let active = true

    async function loadSeeds() {
      setLoadingSeeds(true)
      setError(null)
      try {
        const response = await fetch(buildApiUrl('/api/admin/ai-blog-topic-seeds?status=all&limit=80'), {
          headers: buildHeaders(adminKey),
        })
        const json = (await response.json()) as BlogSeedListResponse
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải topic seed blog')
        }

        if (active) {
          setBlogSeeds(json.items)
        }
      } catch (fetchError) {
        if (active) {
          setBlogSeeds([])
          setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải topic seed blog')
        }
      } finally {
        if (active) {
          setLoadingSeeds(false)
        }
      }
    }

    void loadSeeds()

    return () => {
      active = false
    }
  }, [adminKey, refreshToken])

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

  const qualityJson = useMemo(() => {
    return selectedArticle ? JSON.stringify(selectedArticle.quality, null, 2) : ''
  }, [selectedArticle])

  const qualityWarnings = useMemo(() => {
    const warnings = selectedArticle?.quality?.warnings
    return Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === 'string') : []
  }, [selectedArticle?.quality])

  const selectedBlogContext = selectedArticle?.articleType === 'agri_blog' ? selectedArticle.sourceFacts : null
  const selectedBlogAudience = typeof selectedBlogContext?.audience === 'string' ? selectedBlogContext.audience : null
  const selectedBlogStyle = typeof selectedBlogContext?.style === 'string' ? selectedBlogContext.style : null

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
      setRefreshToken(current => current + 1)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể cập nhật trạng thái')
    } finally {
      setSavingStatus(null)
    }
  }

  async function createSeed() {
    if (!adminKey || !seedForm.headlineHint.trim() || !seedForm.keywordMain.trim()) {
      return
    }

    setCreatingSeed(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch(buildApiUrl('/api/admin/ai-blog-topic-seeds'), {
        method: 'POST',
        headers: buildHeaders(adminKey),
        body: JSON.stringify({
          audience: seedForm.audience,
          style: seedForm.style,
          headlineHint: seedForm.headlineHint,
          keywordMain: seedForm.keywordMain,
          keywordsSub: seedForm.keywordsSub,
          priority: seedForm.priority,
        }),
      })
      const json = (await response.json()) as BlogSeedMutationResponse
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Không thể tạo topic seed')
      }

      setSeedForm(current => ({ ...current, headlineHint: '', keywordMain: '', keywordsSub: '', priority: 50 }))
      setSuccessMessage('Đã tạo topic seed blog')
      setRefreshToken(current => current + 1)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể tạo topic seed')
    } finally {
      setCreatingSeed(false)
    }
  }

  async function updateSeedStatus(seed: AiBlogTopicSeed, status: AiBlogTopicSeedStatus) {
    if (!adminKey) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch(buildApiUrl(`/api/admin/ai-blog-topic-seeds/${seed.id}`), {
        method: 'PATCH',
        headers: buildHeaders(adminKey),
        body: JSON.stringify({ status }),
      })
      const json = (await response.json()) as BlogSeedMutationResponse
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Không thể cập nhật topic seed')
      }

      setBlogSeeds(current => current.map(item => (item.id === seed.id ? json.seed : item)))
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể cập nhật topic seed')
    }
  }

  async function deleteSeed(seed: AiBlogTopicSeed) {
    if (!adminKey) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch(buildApiUrl(`/api/admin/ai-blog-topic-seeds/${seed.id}`), {
        method: 'DELETE',
        headers: buildHeaders(adminKey),
      })
      const json = (await response.json()) as { success: boolean; error?: string }
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Không thể xóa topic seed')
      }

      setBlogSeeds(current => current.filter(item => item.id !== seed.id))
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể xóa topic seed')
    }
  }

  async function generateBlog(seed?: AiBlogTopicSeed) {
    if (!adminKey) {
      return
    }

    setGeneratingBlog(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch(buildApiUrl('/api/admin/ai-articles/generate-blog'), {
        method: 'POST',
        headers: buildHeaders(adminKey),
        body: JSON.stringify({
          audience: seed ? seed.audience : generateAudience === 'all' ? undefined : generateAudience,
          seedId: seed?.id,
          dailyLimit,
        }),
      })
      const json = (await response.json()) as GenerateResponse
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? json.errors?.join('; ') ?? 'Không thể tạo blog AI')
      }

      setStatusFilter('draft')
      setArticleTypeFilter('agri_blog')
      setSuccessMessage(`Đã tạo ${json.createdCount} draft blog, bỏ qua ${json.skippedCount}`)
      setRefreshToken(current => current + 1)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể tạo blog AI')
    } finally {
      setGeneratingBlog(false)
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

      <section className="admin-ai__filters" aria-label="Lọc loại bài">
        {ARTICLE_TYPE_FILTERS.map(articleType => (
          <button
            key={articleType}
            type="button"
            className={articleTypeFilter === articleType ? 'admin-ai__filter admin-ai__filter--active' : 'admin-ai__filter'}
            onClick={() => setArticleTypeFilter(articleType)}
          >
            {articleTypeLabel(articleType)}
          </button>
        ))}
      </section>

      {adminKey ? (
        <section className="admin-ai__blog-tools">
          <div className="admin-ai__blog-generate">
            <div>
              <strong>Blog nông nghiệp</strong>
              <span>{loadingSeeds ? 'Đang tải seed' : `${blogSeeds.filter(seed => seed.status === 'pending').length} seed chờ`}</span>
            </div>
            <select value={generateAudience} onChange={event => setGenerateAudience(event.target.value as 'all' | AiBlogAudience)}>
              <option value="all">3 nhóm độc giả</option>
              {BLOG_AUDIENCES.map(audience => (
                <option key={audience} value={audience}>
                  {audienceLabel(audience)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="3"
              value={dailyLimit}
              onChange={event => setDailyLimit(Math.max(1, Math.min(3, Number(event.target.value) || 3)))}
              aria-label="Số draft blog"
            />
            <button type="button" disabled={generatingBlog} onClick={() => void generateBlog()}>
              {generatingBlog ? 'Đang tạo' : 'Tạo draft blog'}
            </button>
          </div>

          <form
            className="admin-ai__seed-form"
            onSubmit={event => {
              event.preventDefault()
              void createSeed()
            }}
          >
            <select
              value={seedForm.audience}
              onChange={event => setSeedForm(current => ({ ...current, audience: event.target.value as AiBlogAudience }))}
            >
              {BLOG_AUDIENCES.map(audience => (
                <option key={audience} value={audience}>
                  {audienceLabel(audience)}
                </option>
              ))}
            </select>
            <select value={seedForm.style} onChange={event => setSeedForm(current => ({ ...current, style: event.target.value as AiBlogStyle }))}>
              {BLOG_STYLES.map(style => (
                <option key={style} value={style}>
                  {styleLabel(style)}
                </option>
              ))}
            </select>
            <input
              value={seedForm.headlineHint}
              onChange={event => setSeedForm(current => ({ ...current, headlineHint: event.target.value }))}
              placeholder="Gợi ý tiêu đề"
            />
            <input
              value={seedForm.keywordMain}
              onChange={event => setSeedForm(current => ({ ...current, keywordMain: event.target.value }))}
              placeholder="Từ khóa chính"
            />
            <input
              value={seedForm.keywordsSub}
              onChange={event => setSeedForm(current => ({ ...current, keywordsSub: event.target.value }))}
              placeholder="Từ khóa phụ, cách nhau bằng dấu phẩy"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={seedForm.priority}
              onChange={event => setSeedForm(current => ({ ...current, priority: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))}
              aria-label="Độ ưu tiên seed"
            />
            <button type="submit" disabled={creatingSeed || !seedForm.headlineHint.trim() || !seedForm.keywordMain.trim()}>
              {creatingSeed ? 'Đang lưu' : 'Thêm seed'}
            </button>
          </form>

          {blogSeeds.length > 0 ? (
            <div className="admin-ai__seed-list">
              {blogSeeds.slice(0, 8).map(seed => (
                <div key={seed.id} className="admin-ai__seed-row">
                  <div>
                    <span className={`admin-ai__status admin-ai__status--${seed.status}`}>{seed.status}</span>
                    <strong>{seed.headlineHint}</strong>
                    <span>
                      {audienceLabel(seed.audience)} · {styleLabel(seed.style)} · {seed.keywordMain}
                    </span>
                  </div>
                  <div className="admin-ai__seed-actions">
                    <button type="button" disabled={generatingBlog || seed.status !== 'pending'} onClick={() => void generateBlog(seed)}>
                      Tạo
                    </button>
                    <button
                      type="button"
                      className="admin-ai__button--secondary"
                      onClick={() => void updateSeedStatus(seed, seed.status === 'archived' ? 'pending' : 'archived')}
                    >
                      {seed.status === 'archived' ? 'Mở lại' : 'Lưu trữ'}
                    </button>
                    <button type="button" className="admin-ai__button--secondary" onClick={() => void deleteSeed(seed)}>
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <div className="admin-ai__notice admin-ai__notice--error">{error}</div> : null}
      {successMessage ? <div className="admin-ai__notice admin-ai__notice--success">{successMessage}</div> : null}

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
                  {selectedArticle.articleType === 'agri_blog' ? (
                    <>
                      <span>{audienceLabel(selectedBlogAudience)}</span>
                      <span>{styleLabel(selectedBlogStyle)}</span>
                    </>
                  ) : null}
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

              {qualityWarnings.length > 0 ? (
                <section className="admin-ai__quality">
                  <strong>Cảnh báo chất lượng</strong>
                  <ul>
                    {qualityWarnings.map(warning => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

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
              <details className="admin-ai__facts">
                <summary>SEO & quality</summary>
                <pre>{qualityJson}</pre>
              </details>
            </>
          ) : null}

          {!loadingDetail && !selectedArticle ? <div className="admin-ai__empty">Chọn một bài để duyệt</div> : null}
        </article>
      </section>
    </main>
  )
}
