import { Link, useParams } from 'react-router-dom'
import './LookupPage.css'

const LOOKUP_CATEGORIES = [
  {
    key: 'vung-trong',
    label: 'Vùng trồng',
    description: 'Mã số, địa chỉ, thị trường và thời hạn hiệu lực.',
    path: '/tra-cuu/vung-trong',
  },
  {
    key: 'co-so-dong-goi',
    label: 'Cơ sở đóng gói',
    description: 'Thông tin cơ sở, địa chỉ, điện thoại và thị trường.',
    path: '/tra-cuu/co-so-dong-goi',
  },
]

export default function LookupPage() {
  const { categorySlug } = useParams()
  const activeCategory = LOOKUP_CATEGORIES.find(category => category.key === categorySlug)

  return (
    <main className="lookup-page">
      <section className="lookup-page__header">
        <span>Tra cứu</span>
        <h1>{activeCategory?.label ?? 'Tra cứu xuất khẩu'}</h1>
        <p>Dữ liệu phase 1 đã được chuẩn bị cho Supabase. Giao diện tìm kiếm chi tiết sẽ triển khai ở phase 2.</p>
      </section>

      <section className="lookup-page__categories" aria-label="Danh mục tra cứu">
        {LOOKUP_CATEGORIES.map(category => (
          <Link
            key={category.key}
            to={category.path}
            className={`lookup-page__category${activeCategory?.key === category.key ? ' lookup-page__category--active' : ''}`}
          >
            <strong>{category.label}</strong>
            <span>{category.description}</span>
          </Link>
        ))}
      </section>
    </main>
  )
}
