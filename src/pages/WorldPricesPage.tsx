import { useCallback, useEffect, useState } from 'react'
import WorldSummaryCards from '../components/world/WorldSummaryCards'
import WorldPriceTable from '../components/world/WorldPriceTable'
import { DEFAULT_USD_VND_RATE, FALLBACK_WORLD_DATA, type WorldCommodityItem, type WorldPricesResponse } from '../data/worldCommodityData'
import './WorldPricesPage.css'

export default function WorldPricesPage() {
  const [data, setData] = useState<WorldCommodityItem[]>([])
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_USD_VND_RATE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'api' | 'fallback'>('fallback')
  const [lastUpdate, setLastUpdate] = useState<string>('')

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(forceRefresh ? '/api/world-prices?refresh=1' : '/api/world-prices')

      if (!response.ok) {
        throw new Error(`API responded with ${response.status}`)
      }

      const result: WorldPricesResponse = await response.json()

      if (result.success && result.data.length > 0) {
        setData(result.data)
        setExchangeRate(result.exchangeRate)
        setDataSource('api')
        setLastUpdate(new Date().toLocaleDateString('vi-VN'))
      } else {
        throw new Error('Empty response from API')
      }
    } catch {
      console.warn('[WorldPrices] API unavailable, using fallback data')
      setData(FALLBACK_WORLD_DATA)
      setExchangeRate(DEFAULT_USD_VND_RATE)
      setDataSource('fallback')
      setLastUpdate('04/2026 (tham chiếu)')
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return (
    <div className="world-page">
      <header className="world-page__hero">
        <div className="world-page__hero-content">
          <div className="world-page__hero-left">
            <h1 className="world-page__title">
              <svg className="world-page__globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
              </svg>
              Giá Nông Sản Thế Giới
            </h1>
            <p className="world-page__subtitle">
              Theo dõi giá cả hàng hóa nông sản quốc tế, tập trung các mặt hàng Việt Nam sản xuất và xuất khẩu chính
            </p>
          </div>

          <div className="world-page__hero-right">
            <div className="world-page__meta">
              <span className={`world-page__badge world-page__badge--${dataSource}`}>
                {dataSource === 'api' ? (
                  <>
                    <span className="world-page__badge-dot world-page__badge-dot--live" />
                    Dữ liệu trực tiếp
                  </>
                ) : (
                  <>
                    <span className="world-page__badge-dot world-page__badge-dot--static" />
                    Dữ liệu dự phòng
                  </>
                )}
              </span>
              {lastUpdate ? <span className="world-page__update">Cập nhật: {lastUpdate}</span> : null}
            </div>
            <button
              className="world-page__refresh"
              onClick={() => {
                void fetchData(true)
              }}
              disabled={loading}
              aria-label="Làm mới dữ liệu"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? 'world-page__refresh-spin' : ''}
              >
                <path d="M1 4v6h6" />
                <path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="world-page__hero-line" />
      </header>

      {error ? (
        <div className="world-page__error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      ) : null}

      <WorldSummaryCards data={data} exchangeRate={exchangeRate} />
      <WorldPriceTable data={data} exchangeRate={exchangeRate} loading={loading} />
    </div>
  )
}
