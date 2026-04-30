import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer" aria-label="Thông tin pháp lý">
      <div className="footer__container">
        <div className="footer__top">
          <div className="footer__brand">
            <div className="footer__logo">
              <span className="footer__logo-main">NôngSản</span>
              <span className="footer__logo-sub">VN</span>
            </div>
            <p className="footer__desc">
              Nền tảng cập nhật giá nông sản trực tuyến tại Việt Nam. Dữ liệu được tổng hợp từ các sàn giao dịch và chợ đầu mối uy tín.
            </p>
          </div>
          
          <div className="footer__links-group">
            <h3 className="footer__title">Dịch vụ</h3>
            <ul className="footer__links">
              <li><a href="#bang-gia">Bảng giá trực tuyến</a></li>
              <li><a href="#phan-tich">Phân tích kỹ thuật</a></li>
              <li><a href="#du-bao">Dự báo thị trường</a></li>
              <li><a href="#api">API Dữ liệu</a></li>
            </ul>
          </div>
          
          <div className="footer__links-group">
            <h3 className="footer__title">Hỗ trợ</h3>
            <ul className="footer__links">
              <li><a href="#faq">Câu hỏi thường gặp</a></li>
              <li><a href="#lien-he">Liên hệ</a></li>
              <li><a href="#bao-mat">Chính sách bảo mật</a></li>
              <li><a href="#dieu-khoan">Điều khoản sử dụng</a></li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            &copy; {new Date().getFullYear()} NôngSản VN. Giữ toàn quyền.
          </p>
          <div className="footer__warning">
            <strong>Tuyên bố từ chối trách nhiệm:</strong> Mọi thông tin giá cả trên nền tảng NôngSản VN chỉ mang tính phỏng đoán và dùng để tham khảo.
            Giao dịch nông sản tiềm ẩn rủi ro về biến động giá mạnh, vui lòng tự cân nhắc trước mọi quyết định.
          </div>
        </div>
      </div>
    </footer>
  );
}
