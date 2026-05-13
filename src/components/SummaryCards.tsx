import type { ReactNode } from 'react'
import { FALLBACK_VN_PRICES, type CommoditySummary, type PriceSourceStatus, type VnPricesResponse } from '../data/vnPriceTypes'
import './SummaryCards.css'

type Props = {
  data?: CommoditySummary[]
  sources?: PriceSourceStatus[]
  lastUpdated?: string
  status?: VnPricesResponse['status']
  loading?: boolean
  refreshing?: boolean
  onRefresh?: () => void
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function Card({
  label,
  value,
  sub,
  variant,
  children,
}: {
  label: string
  value: string
  sub: string
  variant: 'up' | 'down' | 'neutral' | 'accent'
  children?: ReactNode
}) {
  return (
    <article className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        <p className="stat-card__sub">{sub}</p>
        {children}
      </div>
    </article>
  )
}

export default function SummaryCards({
  data = FALLBACK_VN_PRICES.data,
  lastUpdated,
  status = 'fallback',
  loading = false,
  refreshing = false,
  onRefresh,
}: Props) {
  const topGainer = [...data].sort((a, b) => b.changePct - a.changePct)[0] ?? FALLBACK_VN_PRICES.data[0]
  const statusLabel = status === 'live' ? 'Live' : status === 'cached' ? 'Cached' : 'Fallback'
  const statusSub = status === 'live' ? 'Đồng bộ trực tiếp' : status === 'cached' ? 'Từ bộ nhớ đệm' : 'Dữ liệu dự phòng'
  const statusVariant = status === 'fallback' ? 'down' : status === 'cached' ? 'neutral' : 'accent'

  return (
    <section className="summary-grid" aria-label="Tổng quan thị trường">
      <Card
        label="Tổng mặt hàng"
        value={loading ? 'Đang tải...' : `${data.length}`}
        sub="Dữ liệu VN giá thực"
        variant="neutral"
      />
      <Card
        label="Trạng thái dữ liệu"
        value={statusLabel}
        sub={statusSub}
        variant={statusVariant}
      />
      <Card
        label="Tăng mạnh nhất"
        value={topGainer.commodityName}
        sub={`${topGainer.changePct >= 0 ? '+' : ''}${topGainer.changePct.toFixed(2)}% hôm nay`}
        variant={topGainer.changePct >= 0 ? 'up' : 'down'}
      />
      <Card
        label="Cập nhật lúc"
        value={formatTimestamp(lastUpdated)}
        sub={refreshing ? 'Đang làm mới dữ liệu...' : 'Tự động đồng bộ theo lịch'}
        variant="neutral"
      >
        {onRefresh ? (
          <button className="stat-card__button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Đang tải' : 'Làm mới'}
          </button>
        ) : null}
      </Card>
    </section>
  )
}
