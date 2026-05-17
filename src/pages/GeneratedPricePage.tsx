import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import {
  buildGeneratedCommodityPricePagePath,
  type GeneratedPricePageDetail,
  type GeneratedPricePageDetailResponse,
  type GeneratedPricePageSummary,
} from '../data/generatedPricePageTypes'
import { buildApiUrl } from '../lib/api'
import './GeneratedPricePage.css'

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

function RelatedList({ title, items }: { title: string; items: GeneratedPricePageSummary[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="generated-price-page__rail">
      <div className="generated-price-page__rail-head">
        <span>{title}</span>
      </div>
      <div className="generated-price-page__rail-list">
        {items.map(item => (
          <Link key={item.id} className="generated-price-page__rail-item" to={item.path}>
            <time>{formatDateTime(item.updatedAt)}</time>
            <strong>{item.title}</strong>
            <p>{item.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function GeneratedPricePage() {
  const { commoditySlug, locationSlug } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState<GeneratedPricePageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!commoditySlug || !locationSlug) {
      setLoading(false)
      setError('Không tìm thấy trang giá')
      return
    }

    if (locationSlug === 'viet-nam') {
      navigate(buildGeneratedCommodityPricePagePath(commoditySlug), { replace: true })
      return
    }

    let active = true
    const controller = new AbortController()

    async function loadPage() {
      setLoading(true)
      try {
        const response = await fetch(buildApiUrl(`/api/price-pages/${commoditySlug}/${locationSlug}`), {
          signal: controller.signal,
        })
        const json = (await response.json()) as GeneratedPricePageDetailResponse & { error?: string }
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
  }, [commoditySlug, locationSlug, navigate])

  if (loading) {
    return <main className="generated-price-page generated-price-page--state">Đang tải trang phân tích giá...</main>
  }

  if (!page) {
    return (
      <main className="generated-price-page generated-price-page--state">
        <p>{error ?? 'Không tìm thấy trang giá'}</p>
        <Link to="/bang-gia" className="generated-price-page__back-link">
          Quay lại bảng giá
        </Link>
      </main>
    )
  }

  return (
    <main className="generated-price-page">
      <div className="generated-price-page__frame">
        <div className="generated-price-page__main">
          <nav className="generated-price-page__breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Trang chủ</Link>
            <span>/</span>
            <Link to="/bang-gia">Bảng giá</Link>
            <span>/</span>
            <span>{page.locationLabel}</span>
          </nav>

          <header className="generated-price-page__header">
            <div className="generated-price-page__meta">
              <span className="generated-price-page__badge">Phân tích giá tự động</span>
              {page.category ? <span>{page.category}</span> : null}
              <span>Cập nhật: {formatDateTime(page.updatedAt)}</span>
            </div>
            <h1>{page.title}</h1>
            <p className="generated-price-page__excerpt">{page.answerSummary}</p>
          </header>

          {page.thumbnailUrl ? (
            <figure className="generated-price-page__hero">
              <img src={page.thumbnailUrl} alt={page.thumbnailAlt ?? page.title} loading="eager" />
            </figure>
          ) : null}

          <section className="generated-price-page__facts">
            <article>
              <span>Giá hiện tại</span>
              <strong>{formatCurrency(page.latestPriceVnd)}</strong>
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
              <span>Biên độ 7 ngày</span>
              <strong>{formatCurrency(page.minPrice7dVnd)} - {formatCurrency(page.maxPrice7dVnd)}</strong>
            </article>
          </section>

          <article
            className="generated-price-page__body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page.bodyHtml) }}
          />

          <section className="generated-price-page__faq">
            <h2>Câu hỏi thường gặp</h2>
            <div className="generated-price-page__faq-list">
              {page.faq.map(item => (
                <article key={item.question} className="generated-price-page__faq-item">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="generated-price-page__cta-row">
            <Link to={buildGeneratedCommodityPricePagePath(page.commoditySlug)} className="generated-price-page__cta-link">
              Xem bài theo hàng hóa
            </Link>
            <Link to="/bang-gia" className="generated-price-page__cta-link">
              Xem bảng giá tổng hợp
            </Link>
            <Link to="/chuoi-gia" className="generated-price-page__cta-link generated-price-page__cta-link--secondary">
              Xem chuỗi giá
            </Link>
          </section>
        </div>

        <aside className="generated-price-page__aside">
          <RelatedList title="Cùng nông sản" items={page.relatedByCommodity} />
          <RelatedList title="Cùng địa bàn" items={page.relatedByLocation} />
        </aside>
      </div>
    </main>
  )
}
