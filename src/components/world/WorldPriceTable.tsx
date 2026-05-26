import { useState, useMemo, useCallback, type CSSProperties } from 'react'
import type { WorldCommodityItem, WorldCategory } from '../../data/worldCommodityData'
import './WorldPriceTable.css'

interface Props {
  data: WorldCommodityItem[]
  categories: WorldCategory[]
  exchangeRate: number
  loading?: boolean
}

type SortKey = 'name' | 'priceCurrent' | 'changePct' | 'priceVndKg'
type SortDir = 'asc' | 'desc'

export default function WorldPriceTable({ data, categories, exchangeRate, loading }: Props) {
  const [activeCategory, setActiveCategory] = useState<WorldCategory>('Tất cả')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(direction => (direction === 'asc' ? 'desc' : 'asc'))
        return key
      }

      setSortDir(key === 'name' ? 'asc' : 'desc')
      return key
    })
  }, [])

  const filteredData = useMemo(() => {
    let result = data

    if (activeCategory !== 'Tất cả') {
      result = result.filter(item => item.category === activeCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        item =>
          item.name.toLowerCase().includes(q) ||
          item.nameEn.toLowerCase().includes(q) ||
          item.symbol.toLowerCase().includes(q),
      )
    }

    return [...result].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = getCommodityPriority(a) - getCommodityPriority(b)
          if (cmp === 0) {
            cmp = a.name.localeCompare(b.name, 'vi')
          }
          break
        case 'priceCurrent':
          cmp = a.priceCurrent - b.priceCurrent
          break
        case 'changePct':
          cmp = a.changePct - b.changePct
          break
        case 'priceVndKg':
          cmp = (getReferenceVndKg(a, exchangeRate) ?? Number.NEGATIVE_INFINITY) - (getReferenceVndKg(b, exchangeRate) ?? Number.NEGATIVE_INFINITY)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [activeCategory, data, exchangeRate, searchQuery, sortDir, sortKey])

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <span className="wpt-sort-icon wpt-sort-icon--inactive">&#8597;</span>
    }

    return <span className="wpt-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  if (loading) {
    return (
      <section className="wpt" aria-label="Đang tải giá thế giới">
        <div className="wpt__skeleton-tabs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wpt__skeleton-tab" />
          ))}
        </div>
        <div className="wpt__skeleton-table">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="wpt__skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="wpt" aria-label="Bảng giá nông sản thế giới">
      <div className="wpt__controls">
        <div className="wpt__tabs" role="tablist">
          {categories.map(cat => {
            const count = cat === 'Tất cả' ? data.length : data.filter(item => item.category === cat).length
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                className={`wpt__tab${activeCategory === cat ? ' wpt__tab--active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                <span className="wpt__tab-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="wpt__search">
          <svg className="wpt__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="wpt__search-input"
            placeholder="Tìm kiếm mặt hàng..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            aria-label="Tìm kiếm mặt hàng"
          />
          {searchQuery ? (
            <button className="wpt__search-clear" onClick={() => setSearchQuery('')} aria-label="Xóa tìm kiếm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="wpt__table-wrapper">
        <table className="wpt__table">
          <thead>
            <tr>
              <th className="wpt__th wpt__th--name" onClick={() => handleSort('name')}>
                Mặt hàng {renderSortIcon('name')}
              </th>
              <th className="wpt__th wpt__th--exchange">Sàn</th>
              <th className="wpt__th wpt__th--price" onClick={() => handleSort('priceCurrent')}>
                Giá (USD) {renderSortIcon('priceCurrent')}
              </th>
              <th className="wpt__th wpt__th--price-vnd" onClick={() => handleSort('priceVndKg')}>
                VND/kg quy đổi {renderSortIcon('priceVndKg')}
              </th>
              <th className="wpt__th wpt__th--change" onClick={() => handleSort('changePct')}>
                Thay đổi {renderSortIcon('changePct')}
              </th>
              <th className="wpt__th wpt__th--frequency">Tần suất dữ liệu</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={6} className="wpt__empty">
                  <div className="wpt__empty-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                      <path d="M8 11h6" />
                    </svg>
                    <p>Không tìm thấy mặt hàng nào</p>
                    <span>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((item, index) => {
                const isUp = item.changePct > 0
                const isDown = item.changePct < 0
                const priceVnd = getReferenceVndKg(item, exchangeRate)

                return (
                  <tr
                    key={item.id}
                    className="wpt__row"
                    style={{ '--row-index': index } as CSSProperties}
                  >
                    <td className="wpt__td wpt__td--name">
                      <div className="wpt__commodity">
                        <div className="wpt__commodity-info">
                          <span className="wpt__commodity-name">{item.name}</span>
                        </div>
                      </div>
                    </td>

                    <td className="wpt__td wpt__td--exchange">
                      <span className="wpt__exchange-badge">{item.exchange}</span>
                    </td>

                    <td className="wpt__td wpt__td--price">
                      <div className="wpt__price-block">
                        <span className="wpt__price-main">{formatPrice(item.priceCurrent)}</span>
                        <span className="wpt__price-unit">{item.unit}</span>
                      </div>
                    </td>

                    <td className="wpt__td wpt__td--price-vnd">
                      <span className="wpt__price-vnd">
                        {priceVnd !== null ? formatVnd(priceVnd) : '--'}
                      </span>
                    </td>

                    <td className={`wpt__td wpt__td--change ${isUp ? 'wpt__td--up' : isDown ? 'wpt__td--down' : ''}`}>
                      <div className="wpt__change-block">
                        <span className="wpt__change-pct">
                          {isUp ? '+' : ''}{item.changePct}%
                        </span>
                        <span className="wpt__change-abs">
                          {isUp ? '+' : ''}{formatPrice(item.change)}
                        </span>
                      </div>
                    </td>

                    <td className="wpt__td wpt__td--frequency">
                      <div className="wpt__frequency-block">
                        <span className="wpt__frequency-main">{getDataFrequencyLabel(item)}</span>
                        {item.observedOn ? (
                          <span className="wpt__frequency-sub">Dữ liệu: {formatDateVi(item.observedOn)}</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="wpt__footer">
        <span className="wpt__footer-count">
          Hiển thị {filteredData.length} / {data.length} mặt hàng
        </span>
        <span className="wpt__footer-source">
          Tỷ giá tham chiếu: {exchangeRate.toLocaleString('vi-VN')} VND/USD
        </span>
      </div>
    </section>
  )
}

function formatPrice(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  if (Math.abs(value) >= 1) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function formatVnd(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} tr`
  }

  if (value >= 1_000) {
    return Math.round(value).toLocaleString('vi-VN')
  }

  return value.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
}

function getReferenceVndKg(item: WorldCommodityItem, rate: number): number | null {
  if (typeof item.priceVndKg === 'number' && Number.isFinite(item.priceVndKg)) {
    return item.priceVndKg
  }

  const unit = item.unit.toLowerCase()
  if (unit.includes('usd/kg')) {
    return item.priceCurrent * rate
  }

  if (unit.includes('usd/tấn') || unit.includes('usd/tan') || unit.includes('usd/ton')) {
    return (item.priceCurrent * rate) / 1000
  }

  return null
}

function getCommodityPriority(item: WorldCommodityItem): number {
  const haystack = `${item.id} ${item.name} ${item.nameEn}`.toLowerCase()

  if (haystack.includes('coffee') || haystack.includes('cà phê') || haystack.includes('ca phe')) {
    return 0
  }

  if (haystack.includes('rice') || haystack.includes('gạo') || haystack.includes('gao')) {
    return 1
  }

  if (haystack.includes('pepper') || haystack.includes('tiêu') || haystack.includes('tieu')) {
    return 2
  }

  if (haystack.includes('cashew') || haystack.includes('điều') || haystack.includes('dieu')) {
    return 3
  }

  return 4
}

function getDataFrequencyLabel(item: WorldCommodityItem): string {
  const granularity = (item.dataGranularity ?? '').toLowerCase()

  if (granularity === 'daily') {
    return 'Cập nhật hàng ngày'
  }

  if (granularity === 'weekly') {
    return 'Cập nhật hàng tuần'
  }

  if (granularity === 'monthly') {
    return 'Cập nhật hàng tháng'
  }

  if (granularity === 'period' || granularity === 'as_published') {
    const periodLabel = resolvePeriodLabel(item)
    return periodLabel ? `Cập nhật kỳ ${periodLabel}` : 'Cập nhật theo kỳ'
  }

  return 'Tần suất chưa xác định'
}

function resolvePeriodLabel(item: WorldCommodityItem): string | null {
  const sourceLabel = item.sourceObservationLabel ?? ''
  const dates = [...sourceLabel.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(match => match[1])
  if (dates.length >= 2) {
    return `${formatDateVi(dates[0])} - ${formatDateVi(dates[1])}`
  }

  if (dates.length === 1) {
    return `${formatDateVi(dates[0])} - ${formatDateVi(dates[0])}`
  }

  if (item.observedOn) {
    return `${formatDateVi(item.observedOn)} - ${formatDateVi(item.observedOn)}`
  }

  return null
}

function formatDateVi(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('vi-VN')
}
