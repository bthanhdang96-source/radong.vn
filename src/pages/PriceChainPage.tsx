import { useEffect, useState } from 'react'
import PriceChainSummaryCards from '../components/marketplace/PriceChainSummaryCards'
import PriceChainTable from '../components/marketplace/PriceChainTable'
import type { VnPriceChainResponse } from '../data/vnPriceTypes'
import { buildApiUrl } from '../lib/api'
import './PriceChainPage.css'

const EMPTY_PRICE_CHAIN: VnPriceChainResponse = {
  success: true,
  status: 'fallback',
  lastUpdated: '',
  sources: [],
  errors: [],
  data: [],
}

export default function PriceChainPage() {
  const [payload, setPayload] = useState<VnPriceChainResponse>(EMPTY_PRICE_CHAIN)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const response = await fetch(buildApiUrl('/api/vn-price-chain'))
      const json: VnPriceChainResponse = await response.json()

      if (!response.ok || !json.success) {
        throw new Error('Không thể tải dữ liệu chuỗi giá')
      }

      setPayload(json)
      setError(null)
    } catch (fetchError) {
      setPayload(EMPTY_PRICE_CHAIN)
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải dữ liệu chuỗi giá')
    } finally {
      setLoading(false)
    }
  }

  const dataSource = payload.status === 'live' ? 'api' : 'fallback'
  const lastUpdatedLabel = payload.lastUpdated ? new Date(payload.lastUpdated).toLocaleString('vi-VN') : '--'
  const pageError = error ?? payload.errors[0] ?? null

  return (
    <div className="price-chain-page">
      <header className="price-chain-page__hero">
        <div className="price-chain-page__hero-content">
          <div className="price-chain-page__hero-left">
            <h1 className="price-chain-page__title">Chuỗi giá nông sản</h1>
            <p className="price-chain-page__subtitle">
              Theo dõi liên mạch giá farm gate, wholesale, retail, export và đối chiếu retail theo từng vùng.
            </p>
          </div>

          <div className="price-chain-page__hero-right">
            <div className="price-chain-page__meta">
              <span className={`price-chain-page__badge price-chain-page__badge--${dataSource}`}>
                <span className={`price-chain-page__badge-dot price-chain-page__badge-dot--${dataSource}`} />
                {dataSource === 'api' ? 'Supabase live' : 'Dự phòng'}
              </span>
              <span className="price-chain-page__update">Cập nhật: {lastUpdatedLabel}</span>
            </div>
            <button
              type="button"
              className="price-chain-page__refresh"
              onClick={() => {
                void fetchData()
              }}
              disabled={loading}
              aria-label="Làm mới dữ liệu chuỗi giá"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? 'price-chain-page__refresh-spin' : ''}
              >
                <path d="M1 4v6h6" />
                <path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="price-chain-page__hero-line" />
      </header>

      {pageError ? <div className="price-chain-page__error">{pageError}</div> : null}

      <PriceChainSummaryCards data={payload.data} lastUpdated={payload.lastUpdated} />
      <PriceChainTable data={payload.data} loading={loading} error={pageError} sources={payload.sources} />
    </div>
  )
}
