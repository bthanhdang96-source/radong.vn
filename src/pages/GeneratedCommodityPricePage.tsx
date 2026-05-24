import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import {
  type GeneratedCommodityPricePageDetail,
  type GeneratedCommodityPricePageDetailResponse,
  type GeneratedCommodityPricePageSummary,
  type GeneratedPricePageSummary,
} from '../data/generatedPricePageTypes'
import { buildApiUrl } from '../lib/api'
import './GeneratedCommodityPricePage.css'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value: number, unit = 'VND/kg') {
  return `${Math.round(value).toLocaleString('vi-VN')} ${unit.replace(/^VND\//, 'đồng/')}`
}

function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function getTrendTone(value: number | null) {
  if (value === null || value === 0) {
    return 'neutral'
  }

  return value > 0 ? 'up' : 'down'
}

function TrendPercent({ value }: { value: number | null }) {
  return <span className={`generated-commodity-price-page__trend generated-commodity-price-page__trend--${getTrendTone(value)}`}>{value === null ? '--' : formatPercent(value)}</span>
}

function formatChainValue(value: number | null, unit = 'VND/kg') {
  return value === null ? '--' : formatCurrency(value, unit)
}

function formatQualityGrade(value: string | null) {
  switch (value) {
  case 'loai-1':
    return 'Loại 1'
  case 'loai-a':
    return 'Loại A'
  case 'loai-b':
    return 'Loại B'
  case 'loai-c':
    return 'Loại C'
  case 'loai-cd':
    return 'Loại C-D'
  case 'loai-tuyen':
    return 'Loại tuyển'
  case 'loai-dep':
    return 'Loại đẹp'
  case 'hang-xo':
    return 'Hàng xô'
  case 'kem':
    return 'Kém'
  case 'dat':
    return 'Đạt'
  case 'dat-nang':
    return 'Đạt nặng'
  default:
    return value ?? '--'
  }
}

function RelatedCommodityList({ items }: { items: GeneratedCommodityPricePageSummary[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="generated-commodity-price-page__rail">
      <div className="generated-commodity-price-page__rail-head">
        <span>Cùng nhóm hàng</span>
      </div>
      <div className="generated-commodity-price-page__rail-list">
        {items.map(item => (
          <Link key={item.id} className="generated-commodity-price-page__rail-item" to={item.path}>
            <time>{formatDateTime(item.updatedAt)}</time>
            <strong>{item.title}</strong>
            <p>{item.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

function RelatedLocationList({ items }: { items: GeneratedPricePageSummary[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="generated-commodity-price-page__rail">
      <div className="generated-commodity-price-page__rail-head">
        <span>Trang theo địa bàn</span>
      </div>
      <div className="generated-commodity-price-page__rail-list">
        {items.map(item => (
          <Link key={item.id} className="generated-commodity-price-page__rail-item" to={item.path}>
            <time>{formatDateTime(item.updatedAt)}</time>
            <strong>{item.title}</strong>
            <p>{item.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function GeneratedCommodityPricePage() {
  const { commoditySlug } = useParams()
  const [page, setPage] = useState<GeneratedCommodityPricePageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!commoditySlug) {
      setLoading(false)
      setError('Không tìm thấy trang giá')
      return
    }

    let active = true
    const controller = new AbortController()

    async function loadPage() {
      setLoading(true)
      try {
        const response = await fetch(buildApiUrl(`/api/commodity-price-pages/${commoditySlug}`), {
          signal: controller.signal,
        })
        const json = (await response.json()) as GeneratedCommodityPricePageDetailResponse & { error?: string }
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải trang giá')
        }

        if (!active) {
          return
        }

        setPage(json.page)
        setError(null)
        document.title = json.page.seo.title
      } catch (fetchError) {
        if (controller.signal.aborted || !active) {
          return
        }

        setPage(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải trang giá')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadPage()

    return () => {
      active = false
      controller.abort()
    }
  }, [commoditySlug])

  if (loading) {
    return <main className="generated-commodity-price-page generated-commodity-price-page--state">Đang tải trang giá...</main>
  }

  if (!page) {
    return (
      <main className="generated-commodity-price-page generated-commodity-price-page--state">
        <p>{error ?? 'Không tìm thấy trang giá'}</p>
        <Link to="/bang-gia" className="generated-commodity-price-page__back-link">
          Quay lại bảng giá
        </Link>
      </main>
    )
  }

  return (
    <main className="generated-commodity-price-page">
      <div className="generated-commodity-price-page__frame">
        <div className="generated-commodity-price-page__main">
          <nav className="generated-commodity-price-page__breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Trang chủ</Link>
            <span>/</span>
            <Link to="/bang-gia">Bảng giá</Link>
            <span>/</span>
            <span>{page.title}</span>
          </nav>

          <header className="generated-commodity-price-page__header">
            <div className="generated-commodity-price-page__meta">
              <span className="generated-commodity-price-page__badge">
                {page.renderMode === 'national_article' ? 'Tin giá hôm nay' : 'Tổng hợp theo vùng'}
              </span>
              {page.category ? <span>{page.category}</span> : null}
              <span>Cập nhật: {formatDateTime(page.updatedAt)}</span>
            </div>
            <h1>{page.title}</h1>
            <p className="generated-commodity-price-page__excerpt">{page.answerSummary}</p>
          </header>

          {page.thumbnailUrl ? (
            <figure className="generated-commodity-price-page__hero">
              <img src={page.thumbnailUrl} alt={page.thumbnailAlt ?? page.title} loading="eager" />
            </figure>
          ) : null}

          <section className="generated-commodity-price-page__facts">
            <article>
              <span>Giá hiện tại</span>
              <strong>{formatCurrency(page.headlineLatestPriceVnd, page.headlineLatestPriceUnit)}</strong>
            </article>
            <article>
              <span>So với hôm qua</span>
              <strong><TrendPercent value={page.dayChangePct} /></strong>
            </article>
            <article>
              <span>So với 7 ngày</span>
              <strong><TrendPercent value={page.change7dPct} /></strong>
            </article>
            <article>
              <span>{page.renderMode === 'national_article' ? 'Phạm vi tham khảo' : 'Số khu vực'}</span>
              <strong>{page.renderMode === 'national_article' ? (page.nationalScopeLabel ?? 'Việt Nam') : `${page.locationCount} khu vực`}</strong>
            </article>
          </section>

          {page.chainCards.length > 0 ? (
            <section className="generated-commodity-price-page__chain">
              <div className="generated-commodity-price-page__section-head">
                <h2>Chuỗi giá trị</h2>
                <p>Tóm tắt các mức giá chính của cùng mặt hàng để tiện đối chiếu trước khi mua bán.</p>
              </div>
              <div className="generated-commodity-price-page__chain-grid">
                {page.chainCards.map(card => (
                  <article key={card.priceType} className="generated-commodity-price-page__chain-card">
                    <span>{card.label}</span>
                    <strong>{formatChainValue(card.latestPriceVnd, card.latestPriceUnit)}</strong>
                    <small>{card.latestObservedOn ?? 'Chưa có dữ liệu'}</small>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {page.varietySections.length > 0 ? (
            <section className="generated-commodity-price-page__varieties">
              <div className="generated-commodity-price-page__section-head">
                <h2>Giá theo giống</h2>
                <p>Mỗi giống được tách riêng để độc giả so sánh đúng chất lượng và loại hàng.</p>
              </div>

              <div className="generated-commodity-price-page__variety-list">
                {page.varietySections.map(section => (
                  <article key={section.variety} className="generated-commodity-price-page__variety-card">
                    <header className="generated-commodity-price-page__variety-head">
                      <div>
                        <h3>{section.varietyLabel}</h3>
                        <p>Mức giá đại diện cho nhóm chất lượng đang được theo dõi.</p>
                      </div>
                      <strong>{formatCurrency(section.headlineLatestPriceVnd, section.rows[0]?.latestPriceUnit ?? page.headlineLatestPriceUnit)}</strong>
                    </header>

                    <div className="generated-commodity-price-page__variety-stats">
                      <span>
                        Dải giá: {formatCurrency(section.lowestPriceVnd, section.rows[0]?.latestPriceUnit ?? page.headlineLatestPriceUnit)} -{' '}
                        {formatCurrency(section.highestPriceVnd, section.rows[0]?.latestPriceUnit ?? page.headlineLatestPriceUnit)}
                      </span>
                      <span>So với 7 ngày: <TrendPercent value={section.change7dPct} /></span>
                    </div>

                    <div className="generated-commodity-price-page__table-wrap">
                      <table className="generated-commodity-price-page__variety-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Khu vực</th>
                            <th>Grade</th>
                            <th>Giá hiện tại</th>
                            <th>So với hôm qua</th>
                            <th>So với 7 ngày</th>
                            <th>Cập nhật</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map(row => (
                            <tr key={`${section.variety}-${row.scopeType}-${row.scopeKey}-${row.qualityGrade ?? 'na'}`}>
                              <td>{row.sortRank}</td>
                              <td>{row.locationLabel}</td>
                              <td>{formatQualityGrade(row.qualityGrade)}</td>
                              <td>{formatCurrency(row.latestPriceVnd, row.latestPriceUnit)}</td>
                              <td><TrendPercent value={row.dayChangePct} /></td>
                              <td><TrendPercent value={row.change7dPct} /></td>
                              <td>{row.latestObservedOn}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {page.unitSections.length > 0 ? (
            <section className="generated-commodity-price-page__varieties">
              <div className="generated-commodity-price-page__section-head">
                <h2>Giá theo đơn vị</h2>
                <p>Các đơn vị được tách riêng để tránh so sánh lẫn giữa kg, trái, chục hoặc thùng.</p>
              </div>

              <div className="generated-commodity-price-page__variety-list">
                {page.unitSections.map(section => (
                  <article key={section.unitKey} className="generated-commodity-price-page__variety-card">
                    <header className="generated-commodity-price-page__variety-head">
                      <div>
                        <h3>{section.unitLabel}</h3>
                        <p>Giá đại diện chỉ tổng hợp các dòng cùng đơn vị.</p>
                      </div>
                      <strong>{formatCurrency(section.headlineLatestPriceVnd, section.rows[0]?.latestPriceUnit ?? page.headlineLatestPriceUnit)}</strong>
                    </header>

                    <div className="generated-commodity-price-page__variety-stats">
                      <span>
                        Dải giá: {formatCurrency(section.lowestPriceVnd, section.rows[0]?.latestPriceUnit ?? page.headlineLatestPriceUnit)} -{' '}
                        {formatCurrency(section.highestPriceVnd, section.rows[0]?.latestPriceUnit ?? page.headlineLatestPriceUnit)}
                      </span>
                      <span>So với 7 ngày: <TrendPercent value={section.change7dPct} /></span>
                    </div>

                    <div className="generated-commodity-price-page__table-wrap">
                      <table className="generated-commodity-price-page__variety-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Khu vực</th>
                            <th>Loại giá</th>
                            <th>Giá hiện tại</th>
                            <th>So với hôm qua</th>
                            <th>So với 7 ngày</th>
                            <th>Cập nhật</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map(row => (
                            <tr key={`${section.unitKey}-${row.scopeType}-${row.scopeKey}-${row.priceType}`}>
                              <td>{row.sortRank}</td>
                              <td>{row.locationLabel}</td>
                              <td>{row.priceType}</td>
                              <td>{formatCurrency(row.latestPriceVnd, row.latestPriceUnit)}</td>
                              <td><TrendPercent value={row.dayChangePct} /></td>
                              <td><TrendPercent value={row.change7dPct} /></td>
                              <td>{row.latestObservedOn}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {page.renderMode === 'regional_table' && page.regionRows.length > 0 && page.varietySections.length === 0 && page.unitSections.length === 0 ? (
            <section className="generated-commodity-price-page__table">
              <div className="generated-commodity-price-page__section-head">
                <h2>Bảng giá theo vùng hôm nay</h2>
                <p>Sắp xếp theo mức giá hiện tại giảm dần.</p>
              </div>
              <div className="generated-commodity-price-page__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Khu vực</th>
                      <th>Giá hiện tại</th>
                      <th>So với hôm qua</th>
                      <th>So với 7 ngày</th>
                      <th>So với bình quân</th>
                      <th>Cập nhật</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.regionRows.map(row => (
                      <tr key={`${row.scopeType}-${row.scopeKey}`}>
                        <td>{row.sortRank}</td>
                        <td>{row.locationLabel}</td>
                        <td>{formatCurrency(row.latestPriceVnd, row.latestPriceUnit)}</td>
                        <td><TrendPercent value={row.dayChangePct} /></td>
                        <td><TrendPercent value={row.change7dPct} /></td>
                        <td><TrendPercent value={row.vsNationalAvgPct} /></td>
                        <td>{row.latestObservedOn}</td>
                        <td>
                          <Link className="generated-commodity-price-page__detail-link" to={row.path}>
                            Xem trang
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <article
            className="generated-commodity-price-page__body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page.bodyHtml) }}
          />

          <section className="generated-commodity-price-page__faq">
            <h2>Câu hỏi thường gặp</h2>
            <div className="generated-commodity-price-page__faq-list">
              {page.faq.map(item => (
                <article key={item.question} className="generated-commodity-price-page__faq-item">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="generated-commodity-price-page__cta-row">
            <Link to="/bang-gia" className="generated-commodity-price-page__cta-link">
              Xem bảng giá tổng hợp
            </Link>
            <Link to="/chuoi-gia" className="generated-commodity-price-page__cta-link generated-commodity-price-page__cta-link--secondary">
              Xem chuỗi giá
            </Link>
          </section>
        </div>

        <aside className="generated-commodity-price-page__aside">
          <RelatedLocationList items={page.relatedLocationPages} />
          <RelatedCommodityList items={page.relatedCommodityPages} />
        </aside>
      </div>
    </main>
  )
}
