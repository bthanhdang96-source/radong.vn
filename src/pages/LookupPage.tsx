import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { buildApiUrl } from '../lib/api'
import './LookupPage.css'

type RegistryType = 'production_area' | 'packing_facility'

type ApprovalPeriod = {
  round: number
  startsOn: string | null
  endsOn: string | null
  startRaw: string | null
  endRaw: string | null
}

type LookupItem = {
  id: string
  registryType: RegistryType
  sourceUrl: string
  sourcePage: number
  sourceRowNumber: number | null
  name: string
  address: string | null
  phone: string | null
  phoneDisplay: string | null
  market: string | null
  province: string | null
  district: string | null
  commune: string | null
  product: string
  registryCode: string | null
  approvalPeriods: ApprovalPeriod[]
  harvestStatus: 'harvesting' | 'soon' | 'ended' | 'unknown'
  harvestStatusLabel: string
  seasonProgressPct: number | null
  latestCrawledAt: string
  capacity: string | null
  certifications: string[]
}

type LookupResponse = {
  success: boolean
  items: LookupItem[]
  total: number
  page: number
  limit: number
  latestCrawledAt: string | null
  stats: Record<RegistryType, number>
  filters: {
    provinces: string[]
    markets: string[]
    products: string[]
  }
  error?: string
}

type RegistryTab = {
  slug: string
  type: RegistryType
  label: string
  shortLabel: string
}

const TABS: RegistryTab[] = [
  { slug: 'vung-trong', type: 'production_area', label: 'Vùng trồng nông sản', shortLabel: 'Vùng trồng' },
  { slug: 'co-so-dong-goi', type: 'packing_facility', label: 'Cơ sở đóng gói', shortLabel: 'Đóng gói' },
]

const FAVORITES_KEY = 'nongsanvn_export_registry_favorites'
const DEFAULT_RESPONSE: LookupResponse = {
  success: true,
  items: [],
  total: 0,
  page: 1,
  limit: 24,
  latestCrawledAt: null,
  stats: {
    production_area: 0,
    packing_facility: 0,
  },
  filters: {
    provinces: [],
    markets: [],
    products: [],
  },
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '--'
}

function getMapPoint(item: LookupItem, index: number) {
  const text = `${item.province ?? ''}${item.district ?? ''}${item.name}`
  let hash = index + 17
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 9973
  }

  return {
    x: 12 + (hash % 72),
    y: 10 + ((hash * 7) % 76),
  }
}

function getFavoriteId(item: LookupItem) {
  return `${item.registryType}:${item.id}`
}

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function buildQuery(params: {
  type: RegistryType
  search: string
  province: string
  market: string
  product: string
  status: string
  page: number
}) {
  const query = new URLSearchParams({
    type: params.type,
    page: String(params.page),
    limit: '24',
  })

  if (params.search.trim()) {
    query.set('q', params.search.trim())
  }
  if (params.province !== 'all') {
    query.set('province', params.province)
  }
  if (params.market !== 'all') {
    query.set('market', params.market)
  }
  if (params.product !== 'all') {
    query.set('product', params.product)
  }
  if (params.status === 'harvesting') {
    query.set('status', 'harvesting')
  }

  return query
}

function SeasonBar({ item }: { item: LookupItem }) {
  if (item.registryType !== 'production_area') {
    return null
  }

  const pct = item.seasonProgressPct ?? 0
  const firstPeriod = item.approvalPeriods[0]
  return (
    <div className={`lookup-card__season lookup-card__season--${item.harvestStatus}`}>
      <div className="lookup-card__season-row">
        <span>{item.harvestStatusLabel}</span>
        <strong>{item.seasonProgressPct === null ? '--' : `${item.seasonProgressPct}%`}</strong>
      </div>
      <div className="lookup-card__progress" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <div className="lookup-card__period">
        {firstPeriod ? `Đợt ${firstPeriod.round}: ${firstPeriod.startRaw ?? '--'} - ${firstPeriod.endRaw ?? '--'}` : 'Chưa có lịch mùa vụ'}
      </div>
    </div>
  )
}

function LookupCard({
  item,
  index,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  item: LookupItem
  index: number
  selected: boolean
  favorite: boolean
  onSelect: (item: LookupItem) => void
  onToggleFavorite: (item: LookupItem) => void
}) {
  return (
    <article
      id={`registry-card-${item.id}`}
      className={`lookup-card${selected ? ' lookup-card--selected' : ''}`}
      onClick={() => onSelect(item)}
    >
      <div className="lookup-card__topline">
        <span className={`lookup-card__type lookup-card__type--${item.registryType}`}>
          {item.registryType === 'production_area' ? 'Vùng trồng' : 'Đóng gói'}
        </span>
        {item.market ? <span className="lookup-card__market">{item.market}</span> : null}
      </div>

      <h2>{item.name}</h2>

      <div className="lookup-card__meta">
        <span>{item.product}</span>
        {item.registryCode ? <span>Mã: {item.registryCode}</span> : null}
        {item.sourceRowNumber ? <span>Dòng nguồn: {item.sourceRowNumber}</span> : <span>#{index + 1}</span>}
      </div>

      <p className="lookup-card__address">{item.address ?? 'Chưa có địa chỉ'}</p>

      <SeasonBar item={item} />

      {item.registryType === 'packing_facility' && (item.capacity || item.certifications.length > 0) ? (
        <div className="lookup-card__facility-extra">
          {item.capacity ? <span>Công suất: {item.capacity}</span> : null}
          {item.certifications.map(certification => (
            <span key={certification}>{certification}</span>
          ))}
        </div>
      ) : null}

      <div className="lookup-card__actions" onClick={event => event.stopPropagation()}>
        {item.phone ? (
          <a href={`tel:${item.phone}`} className={`lookup-card__call lookup-card__call--${item.registryType}`}>
            Gọi {item.phoneDisplay ?? item.phone}
          </a>
        ) : (
          <span className="lookup-card__no-phone">Chưa có số liên hệ</span>
        )}
        <button type="button" className={favorite ? 'lookup-card__favorite lookup-card__favorite--active' : 'lookup-card__favorite'} onClick={() => onToggleFavorite(item)}>
          {favorite ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
    </article>
  )
}

function SimulatedMap({
  items,
  activeType,
  selectedId,
  onSelect,
  onCloseMobile,
}: {
  items: LookupItem[]
  activeType: RegistryType
  selectedId: string | null
  onSelect: (item: LookupItem) => void
  onCloseMobile?: () => void
}) {
  const selectedItem = items.find(item => item.id === selectedId)

  return (
    <aside className="lookup-map" aria-label="Sơ đồ vị trí hỗ trợ">
      <div className="lookup-map__head">
        <div>
          <span>Sơ đồ vị trí</span>
          <strong>{items.length} điểm đang hiển thị</strong>
        </div>
        {onCloseMobile ? <button type="button" onClick={onCloseMobile}>Danh sách</button> : null}
      </div>
      <div className="lookup-map__canvas">
        <div className="lookup-map__route lookup-map__route--one" />
        <div className="lookup-map__route lookup-map__route--two" />
        {items.map((item, index) => {
          const point = getMapPoint(item, index)
          const selected = selectedId === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`lookup-map__pin lookup-map__pin--${activeType}${selected ? ' lookup-map__pin--selected' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={item.name}
              onClick={() => onSelect(item)}
            />
          )
        })}
      </div>
      {selectedItem ? (
        <div className="lookup-map__popup">
          <span>{selectedItem.registryType === 'production_area' ? 'Vùng trồng' : 'Cơ sở đóng gói'}</span>
          <strong>{selectedItem.name}</strong>
          <p>{selectedItem.address}</p>
          {selectedItem.phone ? <a href={`tel:${selectedItem.phone}`}>Gọi {selectedItem.phoneDisplay}</a> : null}
        </div>
      ) : null}
    </aside>
  )
}

export default function LookupPage() {
  const { categorySlug } = useParams()
  const navigate = useNavigate()
  const activeTab = TABS.find(tab => tab.slug === categorySlug) ?? TABS[0]
  const [search, setSearch] = useState('')
  const [province, setProvince] = useState('all')
  const [market, setMarket] = useState('all')
  const [product, setProduct] = useState('all')
  const [status, setStatus] = useState<'all' | 'harvesting'>('all')
  const [page, setPage] = useState(1)
  const [payload, setPayload] = useState<LookupResponse>(DEFAULT_RESPONSE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileMapOpen, setMobileMapOpen] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites())

  useEffect(() => {
    if (!categorySlug || !TABS.some(tab => tab.slug === categorySlug)) {
      navigate('/tra-cuu/vung-trong', { replace: true })
    }
  }, [categorySlug, navigate])

  useEffect(() => {
    setPage(1)
    setSelectedId(null)
    setMobileMapOpen(false)
  }, [activeTab.type, search, province, market, product, status])

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadEntries() {
      setLoading(true)
      try {
        const query = buildQuery({
          type: activeTab.type,
          search,
          province,
          market,
          product,
          status: activeTab.type === 'production_area' ? status : 'all',
          page,
        })
        const response = await fetch(buildApiUrl(`/api/export-registry/entries?${query.toString()}`), {
          signal: controller.signal,
        })
        const json: LookupResponse = await response.json()
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải dữ liệu tra cứu')
        }
        if (!active) {
          return
        }
        setPayload(json)
        setError(null)
      } catch (fetchError) {
        if (!active || controller.signal.aborted) {
          return
        }
        setPayload(DEFAULT_RESPONSE)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải dữ liệu tra cứu')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadEntries()

    return () => {
      active = false
      controller.abort()
    }
  }, [activeTab.type, market, page, product, province, search, status])

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const totalPages = Math.max(1, Math.ceil(payload.total / payload.limit))
  const selectedItem = payload.items.find(item => item.id === selectedId)

  function switchTab(tab: RegistryTab) {
    navigate(`/tra-cuu/${tab.slug}`)
    setProvince('all')
    setMarket('all')
    setProduct('all')
    setStatus('all')
  }

  function toggleFavorite(item: LookupItem) {
    const favoriteId = getFavoriteId(item)
    setFavorites(current => {
      const next = current.includes(favoriteId)
        ? current.filter(value => value !== favoriteId)
        : [...current, favoriteId]
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      return next
    })
  }

  function selectItem(item: LookupItem) {
    setSelectedId(item.id)
    window.requestAnimationFrame(() => {
      document.getElementById(`registry-card-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  return (
    <main className={`lookup-page${mobileMapOpen ? ' lookup-page--map-open' : ''}`}>
      <button type="button" className="lookup-page__map-fab" onClick={() => setMobileMapOpen(current => !current)}>
        {mobileMapOpen ? 'Xem danh sách' : 'Xem bản đồ'}
      </button>

      <section className="lookup-shell">
        <div className="lookup-main">
          <header className="lookup-hero">
            <div>
              <span className="lookup-hero__eyebrow">Đồng bộ PPD</span>
              <h1>Tra cứu vùng trồng & cơ sở đóng gói</h1>
              <p>Dữ liệu công khai được chuẩn hóa để người mua, hợp tác xã và đơn vị xuất khẩu quét nhanh theo địa phương, thị trường và mùa vụ.</p>
            </div>
            <div className="lookup-stats">
              <article>
                <span>Vùng trồng</span>
                <strong>{payload.stats.production_area.toLocaleString('vi-VN')}</strong>
              </article>
              <article>
                <span>Cơ sở đóng gói</span>
                <strong>{payload.stats.packing_facility.toLocaleString('vi-VN')}</strong>
              </article>
              <article>
                <span>Đã lưu</span>
                <strong>{favorites.length}</strong>
              </article>
            </div>
          </header>

          <section className="lookup-controls">
            <div className="lookup-tabs" role="tablist" aria-label="Danh mục tra cứu">
              {TABS.map(tab => (
                <button
                  key={tab.slug}
                  type="button"
                  className={activeTab.type === tab.type ? 'lookup-tabs__tab lookup-tabs__tab--active' : 'lookup-tabs__tab'}
                  onClick={() => switchTab(tab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="lookup-filter-grid">
              <label className="lookup-search">
                <span>Tìm kiếm</span>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Tên, mã, số điện thoại, xã/huyện/tỉnh..."
                />
              </label>
              <label>
                <span>Sản phẩm</span>
                <select value={product} onChange={event => setProduct(event.target.value)}>
                  <option value="all">Tất cả</option>
                  {payload.filters.products.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Địa phương</span>
                <select value={province} onChange={event => setProvince(event.target.value)}>
                  <option value="all">Tất cả</option>
                  {payload.filters.provinces.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Thị trường</span>
                <select value={market} onChange={event => setMarket(event.target.value)}>
                  <option value="all">Tất cả</option>
                  {payload.filters.markets.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>

            {activeTab.type === 'production_area' ? (
              <div className="lookup-status-filter">
                <button type="button" className={status === 'all' ? 'is-active' : ''} onClick={() => setStatus('all')}>Tất cả</button>
                <button type="button" className={status === 'harvesting' ? 'is-active' : ''} onClick={() => setStatus('harvesting')}>Đang thu hoạch</button>
              </div>
            ) : null}
          </section>

          <section className="lookup-results-head">
            <span>{loading ? 'Đang tải...' : `${payload.total.toLocaleString('vi-VN')} kết quả`}</span>
            <span>Cập nhật: {formatDate(payload.latestCrawledAt)}</span>
          </section>

          {error ? <div className="lookup-state lookup-state--error">{error}</div> : null}
          {!error && loading ? <div className="lookup-state">Đang tải dữ liệu tra cứu...</div> : null}
          {!error && !loading && payload.items.length === 0 ? <div className="lookup-state">Không có dữ liệu phù hợp bộ lọc.</div> : null}

          {!error && !loading && payload.items.length > 0 ? (
            <>
              <section className="lookup-card-grid">
                {payload.items.map((item, index) => (
                  <LookupCard
                    key={item.id}
                    item={item}
                    index={index}
                    selected={selectedId === item.id}
                    favorite={favoriteSet.has(getFavoriteId(item))}
                    onSelect={selectItem}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </section>

              <nav className="lookup-pagination" aria-label="Phân trang tra cứu">
                <button type="button" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Trước</button>
                <span>Trang {payload.page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Tiếp</button>
              </nav>
            </>
          ) : null}
        </div>

        <SimulatedMap
          items={payload.items}
          activeType={activeTab.type}
          selectedId={selectedItem?.id ?? null}
          onSelect={selectItem}
          onCloseMobile={mobileMapOpen ? () => setMobileMapOpen(false) : undefined}
        />
      </section>
    </main>
  )
}
