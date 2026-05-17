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

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString('vi-VN')} đồng/kg`
}

function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
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
              <img src={page.thumbnailUrl} alt={page.title} loading="eager" />
            </figure>
          ) : null}

          <section className="generated-commodity-price-page__facts">
            <article>
              <span>Giá hiện tại</span>
              <strong>{formatCurrency(page.headlineLatestPriceVnd)}</strong>
            </article>
            <article>
              <span>So với hôm qua</span>
              <strong>{formatPercent(page.dayChangePct)}</strong>
            </article>
            <article>
              <span>So với 7 ngày</span>
              <strong>{formatPercent(page.change7dPct)}</strong>
            </article>
            <article>
              <span>{page.renderMode === 'national_article' ? 'Phạm vi dữ liệu' : 'Số khu vực'}</span>
              <strong>{page.renderMode === 'national_article' ? (page.nationalScopeLabel ?? 'Việt Nam') : `${page.locationCount} khu vực`}</strong>
            </article>
          </section>

          {page.renderMode === 'regional_table' && page.regionRows.length > 0 ? (
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
                        <td>{formatCurrency(row.latestPriceVnd)}</td>
                        <td>{formatPercent(row.dayChangePct)}</td>
                        <td>{formatPercent(row.change7dPct)}</td>
                        <td>{row.vsNationalAvgPct === null ? '--' : formatPercent(row.vsNationalAvgPct)}</td>
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
