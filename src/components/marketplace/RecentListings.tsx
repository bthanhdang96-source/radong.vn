import './RecentListings.css';

// Mock data representing recent postings by farmers/merchants
const MOCK_LISTINGS = [
  {
    id: 'l1',
    title: 'Sầu riêng Ri6 loại 1 chuẩn xuất khẩu',
    category: 'Rau củ quả',
    price: 85000,
    unit: 'Kg',
    location: 'Krông Pắc, Đắk Lắk',
    vendor: 'HTX Nông nghiệp Krông Pắc',
    time: '2 giờ trước',
    icon: '🍈',
  },
  {
    id: 'l2',
    title: 'Cà phê nhân xô Arabica',
    category: 'Cây công nghiệp',
    price: 90000,
    unit: 'Kg',
    location: 'Cầu Đất, Lâm Đồng',
    vendor: 'Nông trại cafe Cầu Đất',
    time: '5 giờ trước',
    icon: '☕',
  },
  {
    id: 'l3',
    title: 'Hành tím Vĩnh Châu vụ mùa',
    category: 'Lương thực',
    price: 28000,
    unit: 'Kg',
    location: 'Vĩnh Châu, Sóc Trăng',
    vendor: 'Nguyễn Văn A',
    time: 'Hôm qua',
    icon: '🧅',
  },
  {
    id: 'l4',
    title: 'Gạo ST25 chuẩn lúa tôm',
    category: 'Lương thực',
    price: 35000,
    unit: 'Kg',
    location: 'Sóc Trăng',
    vendor: 'Đại lý Gạo Sóc Trăng',
    time: 'Hôm qua',
    icon: '🌾',
  },
  {
    id: 'l5',
    title: 'Hồ tiêu đen Chư Sê',
    category: 'Cây công nghiệp',
    price: 155000,
    unit: 'Kg',
    location: 'Chư Sê, Gia Lai',
    vendor: 'Hợp tác xã Chư Sê',
    time: '2 ngày trước',
    icon: '🌿',
  },
  {
    id: 'l6',
    title: 'Tôm sú sinh thái Cà Mau',
    category: 'Thủy sản',
    price: 210000,
    unit: 'Kg',
    location: 'Năm Căn, Cà Mau',
    vendor: 'Hải sản Năm Căn',
    time: '2 ngày trước',
    icon: '🦐',
  }
];

// SVG icons
function MapPinIcon() {
  return (
    <svg className="rl-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="rl-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="rl-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );
}

export default function RecentListings() {
  return (
    <div className="recent-listings">
      <h2>Sản phẩm nổi bật</h2>
      
      <div className="rl-grid">
        {MOCK_LISTINGS.map(item => (
          <article key={item.id} className="rl-card" tabIndex={0} role="button">
            <div className="rl-image-ph">{item.icon}</div>
            <div className="rl-content">
              <span className="rl-category">{item.category}</span>
              <h3 className="rl-title">{item.title}</h3>
              
              <div className="rl-price">
                {item.price.toLocaleString('vi-VN')}₫ <span className="rl-unit">/ {item.unit}</span>
              </div>
              
              <div className="rl-meta">
                <div className="rl-meta-row">
                  <MapPinIcon />
                  <span>{item.location}</span>
                </div>
                <div className="rl-meta-row">
                  <UserIcon />
                  <span>{item.vendor}</span>
                </div>
                <div className="rl-meta-row">
                  <ClockIcon />
                  <span>{item.time}</span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
