import ListingForm from '../components/marketplace/ListingForm';
import RecentListings from '../components/marketplace/RecentListings';
import './MarketplacePage.css';

export default function MarketplacePage() {
  return (
    <main className="marketplace-page" aria-label="Chợ đầu mối nông sản">
      <header className="mp-hero">
        <h1>Báo giá Nông sản / Chợ đầu mối</h1>
        <p>
          Đăng bán sản phẩm của bạn trực tiếp tới hàng ngàn thương lái, hoặc cập nhật nguồn hàng mới nhất ngay trên hệ thống.
        </p>
      </header>

      <div className="mp-grid">
        <section className="mp-feed" aria-label="Danh sách chào bán mới nhất">
          <RecentListings />
        </section>

        <aside className="mp-sidebar" aria-label="Đăng tin chào bán">
          <ListingForm />
        </aside>
      </div>
    </main>
  );
}
