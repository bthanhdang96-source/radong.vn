import type { MarketplaceListing } from '../../types/marketplace'
import './RecentListings.css'

type RecentListingsProps = {
  listings: MarketplaceListing[]
  isLoading: boolean
  error: string | null
  onRetry: () => Promise<void>
}

function MapPinIcon() {
  return (
    <svg className="rl-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="rl-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="rl-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  )
}

const categoryIcons: Record<string, string> = {
  'Rau củ quả': '🥬',
  'Cây công nghiệp': '🌱',
  'Lương thực': '🌾',
  'Thủy sản': '🦐',
  'Trái cây': '🍊',
  'Chăn nuôi': '🐄',
}

function getListingIcon(category: string) {
  return categoryIcons[category] ?? '🧺'
}

function formatUnit(unit: MarketplaceListing['unit']) {
  if (unit === 'tan') {
    return 'Tấn'
  }

  if (unit === 'ta') {
    return 'Tạ'
  }

  return 'Kg'
}

function formatRelativeTime(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))

  if (diffMinutes < 1) {
    return 'Vừa xong'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} giờ trước`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays} ngày trước`
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(createdAt))
}

export default function RecentListings({ listings, isLoading, error, onRetry }: RecentListingsProps) {
  return (
    <div className="recent-listings">
      <h2>Sản phẩm nổi bật</h2>

      {error ? (
        <div className="rl-state-card" role="status">
          <p>{error}</p>
          <button type="button" className="rl-retry" onClick={() => void onRetry()}>
            Tải lại
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rl-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="rl-card rl-card-skeleton">
              <div className="rl-image-ph rl-skeleton-block" />
              <div className="rl-content">
                <div className="rl-skeleton-line rl-skeleton-line-short" />
                <div className="rl-skeleton-line" />
                <div className="rl-skeleton-line rl-skeleton-line-medium" />
                <div className="rl-meta">
                  <div className="rl-skeleton-line rl-skeleton-line-medium" />
                  <div className="rl-skeleton-line rl-skeleton-line-medium" />
                  <div className="rl-skeleton-line rl-skeleton-line-short" />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && !error && listings.length === 0 ? (
        <div className="rl-state-card" role="status">
          <p>Chưa có tin chào bán nào trong Supabase.</p>
        </div>
      ) : null}

      {!isLoading && !error && listings.length > 0 ? (
        <div className="rl-grid">
          {listings.map(item => (
            <article key={item.id} className="rl-card">
              <div className="rl-image-ph">{getListingIcon(item.category)}</div>
              <div className="rl-content">
                <span className="rl-category">{item.category}</span>
                <h3 className="rl-title">{item.title}</h3>
                {item.description ? <p className="rl-description">{item.description}</p> : null}

                <div className="rl-price">
                  {item.price.toLocaleString('vi-VN')}₫ <span className="rl-unit">/ {formatUnit(item.unit)}</span>
                </div>

                <div className="rl-meta">
                  <div className="rl-meta-row">
                    <MapPinIcon />
                    <span>{item.location}</span>
                  </div>
                  <div className="rl-meta-row">
                    <UserIcon />
                    <span>{item.vendorName}</span>
                  </div>
                  <div className="rl-meta-row">
                    <ClockIcon />
                    <span>{formatRelativeTime(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}
