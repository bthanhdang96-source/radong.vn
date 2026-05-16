import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GeneratedPricePageSummary } from '../data/generatedPricePageTypes'
import {
  CATEGORY_LABELS,
  FALLBACK_VN_PRICES,
  type CommoditySummary,
  type TrendDirection,
} from '../data/vnPriceTypes'
import { buildSparklinePath, getSparklineLastPoint, getTrendDirection } from '../utils/priceTrend'
import { formatSignedVnPrice, formatVnPrice } from '../utils/vnPriceFormat'
import './PriceTable.css'

type SortKey = 'commodityName' | 'priceAvg' | 'change' | 'changePct'
type SortDir = 'asc' | 'desc'

const SPARKLINE_WIDTH = 160
const SPARKLINE_HEIGHT = 30

function normalizeLookupKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildPricePageLookup(pricePages: GeneratedPricePageSummary[]) {
  return pricePages.reduce<Map<string, GeneratedPricePageSummary>>((acc, page) => {
    const provinceKey = page.provinceCode ? `${page.commoditySlug}::${page.provinceCode}` : null
    const labelKey = `${page.commoditySlug}::${normalizeLookupKey(page.locationLabel)}`

    if (provinceKey && !acc.has(provinceKey)) {
      acc.set(provinceKey, page)
    }

    if (!acc.has(labelKey)) {
      acc.set(labelKey, page)
    }

    return acc
  }, new Map())
}

function getTrendVariant(direction: TrendDirection) {
  if (direction === 'Tăng') {
    return 'up'
  }

  if (direction === 'Giảm') {
    return 'down'
  }

  return 'neutral'
}

function TrendBadge({ value }: { value: TrendDirection }) {
  const variant = getTrendVariant(value)
  return <span className={`badge badge--${variant}`}>{value}</span>
}

function Sparkline({
  points,
  trendDirection,
}: {
  points: CommoditySummary['sparkline30d']
  trendDirection: TrendDirection
}) {
  const direction = trendDirection || getTrendDirection(null)
  const variant = points.length < 2 ? 'neutral' : getTrendVariant(direction)
  const path = buildSparklinePath(points, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)
  const lastPoint = getSparklineLastPoint(points, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)

  return (
    <div className={`pt-sparkline pt-sparkline--${variant}`} aria-hidden="true">
      <svg
        className="pt-sparkline__svg"
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <path className="pt-sparkline__path" d={path} />
        <circle className="pt-sparkline__dot" cx={lastPoint.x} cy={lastPoint.y} r="3.25" />
      </svg>
    </div>
  )
}

function ChangeBadge({ change, changePct }: { change: number; changePct: number }) {
  const isUp = change >= 0

  return (
    <span className={`pt-pct-badge ${isUp ? 'pct--up' : 'pct--down'}`}>
      {isUp ? '▲' : '▼'} {changePct >= 0 ? '+' : ''}
      {changePct.toFixed(2)}%
    </span>
  )
}

function RegionChange({ change }: { change: number | null }) {
  if (change === null) {
    return <>--</>
  }

  return <>{formatSignedVnPrice(change)}</>
}

export default function PriceTable({
  data = FALLBACK_VN_PRICES.data,
  pricePages = [],
  loading = false,
  error = null,
}: {
  data?: CommoditySummary[]
  pricePages?: GeneratedPricePageSummary[]
  loading?: boolean
  error?: string | null
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tất cả')
  const [sortKey, setSortKey] = useState<SortKey>('priceAvg')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const categories = useMemo(() => ['Tất cả', ...new Set(data.map(item => item.category))], [data])
  const pricePageLookup = useMemo(() => buildPricePageLookup(pricePages), [pricePages])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...data]
      .filter(item => (category === 'Tất cả' ? true : item.category === category))
      .filter(item => {
        if (!query) {
          return true
        }

        return item.commodityName.toLowerCase().includes(query) || item.regions.some(region => region.region.toLowerCase().includes(query))
      })
      .sort((left, right) => {
        const leftValue = left[sortKey]
        const rightValue = right[sortKey]
        const compare = typeof leftValue === 'string'
          ? leftValue.localeCompare(rightValue as string, 'vi')
          : (leftValue as number) - (rightValue as number)

        return sortDir === 'asc' ? compare : -compare
      })
  }, [category, data, search, sortDir, sortKey])

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDir(nextKey === 'commodityName' ? 'asc' : 'desc')
  }

  function toggleExpanded(commodity: string) {
    setExpanded(current => ({
      ...current,
      [commodity]: !current[commodity],
    }))
  }

  function resolvePricePage(commoditySlug: string, regionLabel: string) {
    return (
      pricePageLookup.get(`${commoditySlug}::${normalizeLookupKey(regionLabel)}`) ??
      null
    )
  }

  return (
    <section id="bang-gia" className="price-table-section" aria-label="Bảng giá nông sản">
      <div className="pt-toolbar">
        <div className="pt-tabs" role="tablist" aria-label="Lọc theo danh mục">
          {categories.map(item => (
            <button
              key={item}
              className={`pt-tab${category === item ? ' pt-tab--active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {CATEGORY_LABELS[item] ?? item}
            </button>
          ))}
        </div>
        <input
          className="pt-search"
          type="search"
          placeholder="Tìm mặt hàng hoặc khu vực..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          aria-label="Tìm mặt hàng"
        />
      </div>

      <div className="pt-meta">
        <span>
          Hiển thị <strong>{rows.length}</strong> / {data.length} mặt hàng
        </span>
        <span>{loading ? 'Đang tải dữ liệu...' : error ? `Cảnh báo: ${error}` : 'Dữ liệu API đang hoạt động'}</span>
      </div>

      <div className="pt-scroll-wrap">
        <table className="pt-table" aria-label="Bảng giá nông sản Việt Nam">
          <thead>
            <tr>
              <th className="pt-th pt-th--name" onClick={() => toggleSort('commodityName')}>Mặt hàng</th>
              <th className="pt-th" onClick={() => toggleSort('priceAvg')}>Giá TB</th>
              <th className="pt-th" onClick={() => toggleSort('change')}>Thay đổi</th>
              <th className="pt-th" onClick={() => toggleSort('changePct')}>% thay đổi</th>
              <th className="pt-th">Cao - thấp</th>
              <th className="pt-th">Xu hướng 30 ngày</th>
              <th className="pt-th">Nhận định xu hướng</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="pt-empty">
                  Không có dữ liệu khớp bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              rows.map(item => {
                const isExpanded = Boolean(expanded[item.commodity])
                const isUp = item.change >= 0
                const detailLabel = item.regions.length > 1 ? 'Khu vực / loại' : 'Chi tiết'
                const trendDirection = item.trendDirection || getTrendDirection(item.trend7dPct)

                return (
                  <Fragment key={item.commodity}>
                    <tr className={`pt-row ${isExpanded ? 'pt-row--expanded' : ''}`}>
                      <td className="pt-td pt-td--name">
                        <button className="pt-expand" onClick={() => toggleExpanded(item.commodity)} aria-expanded={isExpanded}>
                          <span className="pt-expand__icon">{isExpanded ? '▼' : '▶'}</span>
                          <span className="pt-name__text">
                            <strong>{item.commodityName}</strong>
                          </span>
                        </button>
                      </td>
                      <td className="pt-td pt-td--price">
                        <div className="pt-price-container">
                          <strong>{formatVnPrice(item.priceAvg)}</strong>
                          <span>{item.unit.replace('VND/', '')}</span>
                        </div>
                      </td>
                      <td className={`pt-td ${isUp ? 'pt-change--up' : 'pt-change--down'}`}>
                        {formatSignedVnPrice(item.change)}
                      </td>
                      <td className="pt-td">
                        <ChangeBadge change={item.change} changePct={item.changePct} />
                      </td>
                      <td className="pt-td">
                        <div className="pt-spread">
                          <span>{formatVnPrice(item.priceLow)}</span>
                          <strong>{formatVnPrice(item.priceHigh)}</strong>
                        </div>
                      </td>
                      <td className="pt-td pt-td--trend">
                        <Sparkline points={item.sparkline30d} trendDirection={trendDirection} />
                      </td>
                      <td className="pt-td pt-td--badge">
                        <TrendBadge value={trendDirection} />
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="pt-detail-row">
                        <td colSpan={7}>
                          <div className="pt-detail">
                            <div className="pt-detail__summary">
                              <span>{detailLabel}: {item.regions.length}</span>
                            </div>
                            <table className="pt-subtable">
                              <thead>
                                <tr>
                                  <th>{detailLabel}</th>
                                  <th>Giá</th>
                                  <th>Thay đổi</th>
                                  <th>Cảnh báo</th>
                                  <th>Trang</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.regions.map((region, index) => {
                                  const linkedPage = resolvePricePage(item.commodity, region.region)
                                  return (
                                    <tr key={`${item.commodity}-${region.region}-${region.source}-${index}`} className={region.hasConflict ? 'pt-subrow--conflict' : ''}>
                                      <td>{region.region}</td>
                                      <td>{formatVnPrice(region.price)}</td>
                                      <td><RegionChange change={region.change} /></td>
                                      <td>{region.hasConflict ? `Lệch ${region.conflictPct?.toFixed(2)}%` : '--'}</td>
                                      <td>
                                        {linkedPage ? (
                                          <Link className="pt-region-link" to={linkedPage.path}>
                                            Xem trang
                                          </Link>
                                        ) : (
                                          '--'
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-mobile-list" aria-label="Danh sách giá nông sản trên điện thoại">
        {rows.length === 0 ? (
          <div className="pt-mobile-empty">Không có dữ liệu khớp bộ lọc hiện tại.</div>
        ) : (
          rows.map(item => {
            const isExpanded = Boolean(expanded[item.commodity])
            const trendDirection = item.trendDirection || getTrendDirection(item.trend7dPct)

            return (
              <article key={`${item.commodity}-mobile`} className={`pt-mobile-card${isExpanded ? ' pt-mobile-card--expanded' : ''}`}>
                <button className="pt-mobile-card__header" type="button" onClick={() => toggleExpanded(item.commodity)} aria-expanded={isExpanded}>
                  <div className="pt-mobile-card__title">
                    <div className="pt-mobile-card__name">
                      <strong>{item.commodityName}</strong>
                    </div>
                  </div>
                  <div className="pt-mobile-card__actions">
                    <TrendBadge value={trendDirection} />
                    <span className="pt-mobile-card__toggle">{isExpanded ? 'Ẩn' : 'Xem'}</span>
                  </div>
                </button>

                <div className="pt-mobile-card__metrics">
                  <div className="pt-mobile-card__metric">
                    <span className="pt-mobile-card__label">Giá trung bình</span>
                    <strong>{formatVnPrice(item.priceAvg)}</strong>
                    <small>{item.unit}</small>
                  </div>
                  <div className="pt-mobile-card__metric">
                    <span className="pt-mobile-card__label">Biến động</span>
                    <strong>{formatSignedVnPrice(item.change)}</strong>
                    <ChangeBadge change={item.change} changePct={item.changePct} />
                  </div>
                  <div className="pt-mobile-card__metric">
                    <span className="pt-mobile-card__label">Cao - thấp</span>
                    <strong>{formatVnPrice(item.priceLow)} - {formatVnPrice(item.priceHigh)}</strong>
                    <small>{item.regions.length} khu vực / loại</small>
                  </div>
                  <div className="pt-mobile-card__metric pt-mobile-card__metric--trend">
                    <span className="pt-mobile-card__label">Xu hướng 30 ngày</span>
                    <Sparkline points={item.sparkline30d} trendDirection={trendDirection} />
                  </div>
                </div>

                {isExpanded ? (
                  <div className="pt-mobile-card__detail">
                    {item.regions.map((region, index) => {
                      const linkedPage = resolvePricePage(item.commodity, region.region)
                      return (
                        <div
                          key={`${item.commodity}-mobile-${region.region}-${region.source}-${index}`}
                          className={`pt-mobile-region${region.hasConflict ? ' pt-mobile-region--conflict' : ''}`}
                        >
                          <div className="pt-mobile-region__meta">
                            <strong>{region.region}</strong>
                            <span>{region.hasConflict ? 'Chênh lệch nguồn' : 'Ổn định'}</span>
                          </div>
                          <div className="pt-mobile-region__price">
                            <strong>{formatVnPrice(region.price)}</strong>
                            <span><RegionChange change={region.change} /></span>
                          </div>
                          {linkedPage ? (
                            <Link className="pt-region-link" to={linkedPage.path}>
                              Xem trang phân tích
                            </Link>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
