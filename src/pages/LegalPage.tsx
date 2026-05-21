import { Link, Navigate, useLocation } from 'react-router-dom'
import './LegalPage.css'

const LEGAL_CONTENT = {
  '/chinh-sach-bao-mat': {
    eyebrow: 'Chính sách',
    title: 'Chính sách bảo mật',
    intro: 'NôngSản VN chỉ thu thập dữ liệu cần thiết để vận hành trải nghiệm đọc tin, tra cứu và xem giá nông sản.',
    sections: [
      {
        title: 'Dữ liệu được xử lý',
        body: 'Trang có thể lưu tùy chọn giao diện, bộ nhớ đệm nội dung và dấu trang tra cứu trên trình duyệt của bạn để tải lại nhanh hơn.',
      },
      {
        title: 'Mục đích sử dụng',
        body: 'Dữ liệu được dùng để hiển thị nội dung phù hợp, cải thiện độ ổn định của trang và hạn chế tải lại dữ liệu không cần thiết.',
      },
      {
        title: 'Giới hạn',
        body: 'Thông tin giá cả và nội dung tổng hợp chỉ dùng cho mục đích tham khảo. Người dùng cần tự kiểm chứng trước khi giao dịch.',
      },
    ],
  },
  '/dieu-khoan-su-dung': {
    eyebrow: 'Điều khoản',
    title: 'Điều khoản sử dụng',
    intro: 'Khi sử dụng NôngSản VN, bạn đồng ý dùng thông tin trên trang như nguồn tham khảo thị trường, không phải cam kết giao dịch.',
    sections: [
      {
        title: 'Phạm vi thông tin',
        body: 'Dữ liệu giá, tin tức và tra cứu có thể được tổng hợp từ nhiều nguồn công khai và có độ trễ so với thị trường thực tế.',
      },
      {
        title: 'Trách nhiệm người dùng',
        body: 'Bạn chịu trách nhiệm kiểm tra lại nguồn, chất lượng hàng hóa và điều kiện giao dịch trước khi ra quyết định mua bán.',
      },
      {
        title: 'Thay đổi nội dung',
        body: 'NôngSản VN có thể cập nhật nội dung, cách hiển thị hoặc nguồn dữ liệu để cải thiện độ hữu ích của dịch vụ.',
      },
    ],
  },
}

export default function LegalPage() {
  const { pathname } = useLocation()
  const page = LEGAL_CONTENT[pathname as keyof typeof LEGAL_CONTENT]

  if (!page) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="legal-page">
      <article className="legal-page__card">
        <nav className="legal-page__breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Trang chủ</Link>
          <span>/</span>
          <span>{page.title}</span>
        </nav>
        <span className="legal-page__eyebrow">{page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p className="legal-page__intro">{page.intro}</p>
        <div className="legal-page__sections">
          {page.sections.map(section => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}
