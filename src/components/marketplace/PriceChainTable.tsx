import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GeneratedPricePageSummary } from '../../data/generatedPricePageTypes'
import type { PriceChainItem } from '../../data/vnPriceTypes'
import './PriceChainTable.css'

type Props = {
  data: PriceChainItem[]
  pricePages: GeneratedPricePageSummary[]
  loading: boolean
  error: string | null
  lastUpdated: string
}

function buildPricePageLookup(pricePages: GeneratedPricePageSummary[]) {
  return pricePages.reduce<Map<string, GeneratedPricePageSummary>>((acc, page) => {
    const provinceKey = page.provinceCode ? `${page.commoditySlug}::${page.provinceCode}` : null
    if (provinceKey && !acc.has(provinceKey)) {
      acc.set(provinceKey, page)
    }

    return acc
  }, new Map())
}

export default function PriceChainTable({ data, pricePages, loading, error, lastUpdated }: Props) {
  const [activeCategory, setActiveCategory] = useState('Tất cả')
  const [expandedCommodity, setExpandedCommodity] = useState<string | null>(null)
  const pricePageLookup = useMemo(() => buildPricePageLookup(pricePages), [pricePages])

  const categories = ['Tất cả', ...new Set(data.map(item => item.category))]
  const filteredData = activeCategory === 'Tất cả' ? data : data.filter(item => item.category === activeCategory)

  if (loading) {
    return (
      <section className="pct" aria-label="Đang tải chuỗi giá">
        <div className="pct__skeleton-tabs">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="pct__skeleton-pill" />
          ))}
        </div>
        <div className="pct__skeleton-table">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="pct__skeleton-row" />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="pct" aria-label="Bảng chuỗi giá">
      <div className="pct__controls">
        <div className="pct__tabs" role="tablist" aria-label="Lọc theo danh mục">
          {categories.map(category => {
            const count = category === 'Tất cả' ? data.length : data.filter(item => item.category === category).length
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                className={`pct__tab${activeCategory === category ? ' pct__tab--active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
                <span className="pct__tab-count">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {error ? <div className="pct__error">{error}</div> : null}

      <div className="pct__table-shell">
        <table className="pct__table">
          <thead>
            <tr>
              <th>Mặt hàng</th>
              <th>Farm gate</th>
              <th>Wholesale</th>
              <th>Retail</th>
              <th>Export</th>
              <th>Biên retail</th>
              <th>Biên export</th>
              <th>Xu hướng 7 ngày</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={8} className="pct__empty">
                  Chưa có dữ liệu chuỗi giá.
                </td>
              </tr>
            ) : (
              filteredData.flatMap(item => {
                const isExpanded = expandedCommodity === item.commodity
                const canExpand = item.retailRegions.length > 0

                return [
                  <tr key={item.commodity} className="pct__row">
                    <td>
                      <button
                        type="button"
                        className={`pct__commodity${canExpand ? ' pct__commodity--expandable' : ''}`}
                        onClick={() => setExpandedCommodity(isExpanded ? null : item.commodity)}
                        disabled={!canExpand}
                      >
                        <span className="pct__commodity-name">{item.commodityName}</span>
                        <span className="pct__commodity-meta">
                          {item.category} · {item.unit}
                        </span>
                      </button>
                    </td>
                    <td>{formatVnd(item.farmGateVnd)}</td>
                    <td>{formatVnd(item.wholesaleVnd)}</td>
                    <td>{formatVnd(item.retailVnd)}</td>
                    <td>
                      <div className="pct__stack">
                        <span>{formatVnd(item.exportVnd)}</span>
                        <span className="pct__subtle">{formatUsd(item.exportUsd)}</span>
                      </div>
                    </td>
                    <td className={getDeltaClass(item.retailVsFarmgatePct)}>{formatPercent(item.retailVsFarmgatePct)}</td>
                    <td className={getDeltaClass(item.exportVsFarmgatePct)}>{formatPercent(item.exportVsFarmgatePct)}</td>
                    <td className={getDeltaClass(item.trend7dPct)}>{formatPercent(item.trend7dPct)}</td>
                  </tr>,
                  isExpanded ? (
                    <tr key={`${item.commodity}-regions`} className="pct__details-row">
                      <td colSpan={8}>
                        <div className="pct__details">
                          <div className="pct__details-header">
                            <strong>Retail theo vùng</strong>
                            <span>{new Date(item.updatedAt).toLocaleString('vi-VN')}</span>
                          </div>
                          <div className="pct__detail-grid">
                            {item.retailRegions.map(region => {
                              const linkedPage = pricePageLookup.get(`${item.commodity}::${region.provinceCode}`) ?? null
                              return (
                                <article key={`${item.commodity}-${region.provinceCode}`} className="pct__detail-card">
                                  <div className="pct__detail-top">
                                    <strong>{region.region}</strong>
                                    <span>{region.provinceCode}</span>
                                  </div>
                                  <div className="pct__detail-price">{formatVnd(region.avgPrice)}</div>
                                  <div className="pct__detail-meta">
                                    <span className={getDeltaClass(region.vsNationalAvgPct)}>
                                      {formatPercent(region.vsNationalAvgPct)}
                                    </span>
                                    <span>{region.dataPoints} điểm dữ liệu</span>
                                  </div>
                                  {linkedPage ? (
                                    <Link className="pct__detail-link" to={linkedPage.path}>
                                      Xem trang phân tích
                                    </Link>
                                  ) : null}
                                </article>
                              )
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ].filter(Boolean)
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pct__footer">
        <span>
          Hiển thị {filteredData.length.toLocaleString('vi-VN')} / {data.length.toLocaleString('vi-VN')} mặt hàng
        </span>
        <span>Cập nhật: {lastUpdated ? new Date(lastUpdated).toLocaleString('vi-VN') : '--'}</span>
      </div>
    </section>
  )
}

function formatVnd(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return `${Math.round(value).toLocaleString('vi-VN')} VND/kg`
}

function formatUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return `${value.toFixed(2)} USD/kg`
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function getDeltaClass(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'pct__delta pct__delta--neutral'
  }

  if (value > 0) {
    return 'pct__delta pct__delta--up'
  }

  if (value < 0) {
    return 'pct__delta pct__delta--down'
  }

  return 'pct__delta pct__delta--neutral'
}
