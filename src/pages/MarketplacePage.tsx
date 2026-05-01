import { useEffect, useState } from 'react'
import ListingForm from '../components/marketplace/ListingForm'
import RecentListings from '../components/marketplace/RecentListings'
import { createMarketplaceListing, fetchMarketplaceListings } from '../lib/marketplace'
import type { MarketplaceListing, MarketplaceListingInsert } from '../types/marketplace'
import './MarketplacePage.css'

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadListings = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const nextListings = await fetchMarketplaceListings()
      setListings(nextListings)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải dữ liệu chào bán.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadListings()
  }, [])

  const handleCreateListing = async (payload: MarketplaceListingInsert) => {
    const createdListing = await createMarketplaceListing(payload)
    setListings(current => [createdListing, ...current].slice(0, 12))
  }

  return (
    <main className="marketplace-page" aria-label="Chợ đầu mối nông sản">
      <header className="mp-hero">
        <h1>Báo giá Nông sản / Chợ đầu mối</h1>
        <p>Đăng bán sản phẩm của bạn trực tiếp tới hàng ngàn thương lái, hoặc cập nhật nguồn hàng mới nhất ngay trên hệ thống.</p>
      </header>

      <div className="mp-grid">
        <section className="mp-feed" aria-label="Danh sách chào bán mới nhất">
          <RecentListings listings={listings} isLoading={isLoading} error={error} onRetry={loadListings} />
        </section>

        <aside className="mp-sidebar" aria-label="Đăng tin chào bán">
          <ListingForm onSubmit={handleCreateListing} />
        </aside>
      </div>
    </main>
  )
}
