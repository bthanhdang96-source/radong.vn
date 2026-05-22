# Improve Plan - Remaining UX Audit Items

Ngày cập nhật: 2026-05-22

File này chỉ giữ lại các hạng mục cải thiện lớn chưa làm sau đợt fix P0/P1 và sau khi đã bổ sung sort cho trang `/tra-cuu`.

## 1. Biểu đồ giá theo thời gian

**Mục tiêu:** thêm biểu đồ xu hướng giá cho trang `/gia-nong-san/:slug`, giúp người dùng nhìn được biến động thay vì chỉ đọc giá hôm nay.

**Cần làm:**
- Xác định API lịch sử giá ổn định cho từng commodity.
- Hỗ trợ các khoảng thời gian 7/30/90 ngày.
- Thiết kế line chart responsive cho desktop/mobile.
- Có tooltip, empty state, loading state và fallback khi thiếu dữ liệu.
- Ưu tiên component dùng lại được cho trang giá hàng hóa và bảng giá tổng.

**Gợi ý triển khai:** dùng Recharts hoặc Chart.js nếu muốn nhanh; nếu muốn kiểm soát bundle size thì tạo SVG chart nội bộ.

## 2. SEO hoàn chỉnh

**Mục tiêu:** nâng cấp SEO cho tin tức và trang giá để tăng khả năng index, preview khi chia sẻ và độ rõ ràng với search engine.

**Cần làm:**
- Tạo `Seo` component hoặc hook dùng chung.
- Dynamic `<title>` và `<meta name="description">` cho từng page.
- Canonical URL cho article, price page, legal page.
- Open Graph/Twitter card cho share preview.
- Structured data:
  - `Article` cho bài viết.
  - `BreadcrumbList` cho các trang có breadcrumb.
  - `PriceSpecification` hoặc schema phù hợp cho trang giá.

**Lưu ý:** chỉ dùng dữ liệu thật từ API/page model; không tự bịa author, publisher contact hoặc image credit.

## 3. Footer, contact và pháp lý bản đầy đủ

**Mục tiêu:** thay trang pháp lý tối thiểu hiện tại bằng nội dung đầy đủ, đáng tin cậy.

**Cần làm:**
- Xác nhận thông tin đơn vị vận hành.
- Xác nhận email, địa chỉ, hotline hoặc kênh liên hệ thật.
- Viết nội dung chính sách bảo mật chi tiết hơn: dữ liệu lưu localStorage, cache, tracking nếu có, nguồn dữ liệu.
- Viết điều khoản sử dụng rõ hơn: phạm vi tham khảo, giới hạn trách nhiệm, rủi ro giao dịch.
- Cân nhắc thêm trang liên hệ nếu có dữ liệu thật.

**Không nên làm:** thêm email, hotline, fanpage hoặc địa chỉ giả.

## 4. Unit selector cho trang giá

**Mục tiêu:** cho người dùng xem giá theo đơn vị phù hợp như đồng/kg, đồng/tấn, đồng/thùng, đồng/trái.

**Cần làm:**
- Kiểm kê các đơn vị hiện có trong data.
- Phân biệt đơn vị có thể quy đổi tuyến tính và đơn vị không thể quy đổi.
- Thiết kế selector theo từng commodity, chỉ hiện khi có nhiều đơn vị hợp lệ.
- Không trộn dữ liệu khác bản chất, ví dụ kg với trái/chục nếu không có hệ số quy đổi đáng tin cậy.
- Bảng, facts bar và biểu đồ phải đồng bộ theo đơn vị đang chọn.

## 5. Pagination backend chuẩn cho news feed

**Mục tiêu:** thay cơ chế “Xem thêm” bằng tăng `limit` bằng phân trang/cursor thật.

**Cần làm:**
- Backend `/api/content/feed` trả `nextCursor` hoặc `hasMore` nhất quán.
- Frontend append thêm item thay vì fetch lại toàn bộ danh sách lớn.
- Có trạng thái “đã hết nội dung”.
- Cache client theo query/family/cursor để tránh reload thừa.

**Lợi ích:** giảm tải API, UX ổn định hơn và tránh nhảy layout khi feed lớn.

**Follow-up sau bước 1:** tối ưu source-level pagination để `/api/content/feed` không cần overfetch nhiều nguồn:
- Dùng cursor sẵn có của `/api/news/articles` khi lấy nhóm news.
- Thêm cursor/range cho generated price pages và commodity price pages.
- Chỉ lấy một cửa sổ nhỏ từ từng nguồn rồi merge/sort ở content feed service.

## 6. Article metadata nâng cao

**Mục tiêu:** bài viết có tác giả, nguồn ảnh, caption và source metadata tốt hơn.

**Cần làm:**
- Cải thiện ingestion/extraction để lấy author thật khi nguồn có.
- Lấy caption/credit ảnh hero nếu có trong bài gốc.
- Hiển thị canonical/source link theo cách phù hợp.
- Có fallback rõ ràng khi không có author/caption thay vì hiển thị thông tin giả.

**Phạm vi:** đây là phần backend/news ingestion kết hợp UI, không chỉ sửa component.

## 7. Brand/logo refresh

**Mục tiêu:** logo/icon truyền tải rõ hơn chủ đề nông sản.

**Cần làm:**
- Thiết kế lại logo mark theo hướng đơn giản, nhận diện tốt ở navbar/mobile/favicon.
- Kiểm tra độ rõ ở kích thước 24-36px.
- Cập nhật favicon/app icon nếu có.
- Đảm bảo không phá layout navbar hiện tại.

**Lưu ý:** đây là design asset work, không nên thay bằng SVG ngẫu nhiên nếu chưa có hướng brand.

## Roadmap đề xuất

1. Biểu đồ giá 30 ngày cho trang giá hàng hóa.
2. SEO/meta/schema dùng chung.
3. Pagination backend chuẩn cho news feed - bước 2: source-level pagination optimization.
4. Article metadata/caption/source extraction.
5. Footer/contact/pháp lý đầy đủ sau khi có thông tin thật.
6. Unit selector sau khi chốt quy tắc quy đổi dữ liệu.
7. Brand/logo refresh khi có direction thiết kế.

## Tiêu chí ưu tiên

- Ưu tiên trước các tính năng giúp người dùng ra quyết định tốt hơn: biểu đồ giá và metadata tin.
- Ưu tiên sau các phần cần thông tin nghiệp vụ hoặc pháp lý từ người vận hành: contact, pháp lý đầy đủ, brand.
- Không thêm dữ liệu giả để làm UI có vẻ đầy đủ.
