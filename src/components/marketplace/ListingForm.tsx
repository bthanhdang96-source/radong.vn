import { FormEvent, useState } from 'react';
import { CATEGORIES } from '../../data/nongSanData';
import './ListingForm.css';

export default function ListingForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Mock network request
    setTimeout(() => {
      setIsSubmitting(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1000);
  };

  return (
    <div className="listing-form-card">
      <h2>Đăng tin Báo giá</h2>
      <form className="listing-form" onSubmit={handleSubmit}>
        
        {/* Mock Image Upload */}
        <div className="lf-upload" role="button" tabIndex={0} aria-label="Tải lên hình ảnh">
          <svg className="lf-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <div className="lf-upload-text">
            <span>Nhấn để chọn</span> hoặc kéo thả hình ảnh
          </div>
        </div>

        <div className="lf-group">
          <label htmlFor="lf-name">Tên nông sản</label>
          <input id="lf-name" type="text" placeholder="VD: Sầu riêng Ri6, Tiêu đen..." required />
        </div>

        <div className="lf-row">
          <div className="lf-group">
            <label htmlFor="lf-cat">Danh mục</label>
            <select id="lf-cat">
              {CATEGORIES.filter(c => c !== 'Tất cả').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="lf-group">
            <label htmlFor="lf-loc">Khu vực / Tỉnh</label>
            <input id="lf-loc" type="text" placeholder="VD: Đắk Lắk" required />
          </div>
        </div>

        <div className="lf-row">
          <div className="lf-group">
            <label htmlFor="lf-price">Giá chào bán (VNĐ)</label>
            <input id="lf-price" type="number" placeholder="VD: 55000" min="0" required />
          </div>
          <div className="lf-group">
            <label htmlFor="lf-unit">Đơn vị tính</label>
            <select id="lf-unit">
              <option value="kg">1 Kg</option>
              <option value="tan">1 Tấn</option>
              <option value="ta">1 Tạ</option>
            </select>
          </div>
        </div>

        <div className="lf-group">
          <label htmlFor="lf-desc">Mô tả thêm (Tùy chọn)</label>
          <textarea id="lf-desc" placeholder="Tình trạng, thông tin vận chuyển, phương thức thanh toán..."></textarea>
        </div>

        <button type="submit" className="lf-submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý...' : success ? 'Đăng thành công ✓' : 'Đăng tin ngay'}
        </button>
      </form>
    </div>
  );
}
