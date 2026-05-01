import { useState, type ChangeEvent, type FormEvent } from 'react'
import { CATEGORIES } from '../../data/nongSanData'
import type { MarketplaceListingInsert, MarketplaceUnit } from '../../types/marketplace'
import './ListingForm.css'

type ListingFormProps = {
  onSubmit: (payload: MarketplaceListingInsert) => Promise<void>
}

type FormState = {
  title: string
  category: string
  location: string
  price: string
  unit: MarketplaceUnit
  description: string
  vendorName: string
}

const categories = CATEGORIES.slice(1)

const initialFormState: FormState = {
  title: '',
  category: categories[0] ?? 'Khác',
  location: '',
  price: '',
  unit: 'kg',
  description: '',
  vendorName: '',
}

export default function ListingForm({ onSubmit }: ListingFormProps) {
  const [form, setForm] = useState<FormState>(initialFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setSuccess(false)
    setError(null)

    try {
      await onSubmit({
        title: form.title.trim(),
        category: form.category,
        location: form.location.trim(),
        price: Number(form.price),
        unit: form.unit,
        description: form.description.trim() || null,
        vendorName: form.vendorName.trim(),
      })

      setForm(initialFormState)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể đăng tin lúc này.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="listing-form-card">
      <h2>Đăng tin Báo giá</h2>
      <form className="listing-form" onSubmit={handleSubmit}>
        <div className="lf-upload" aria-hidden="true">
          <svg className="lf-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <div className="lf-upload-text">
            <span>Hình ảnh sẽ cập nhật sau</span> khi tạo xong luồng Supabase cơ bản
          </div>
        </div>

        <div className="lf-group">
          <label htmlFor="lf-vendor">Người bán / Đơn vị</label>
          <input
            id="lf-vendor"
            name="vendorName"
            type="text"
            placeholder="VD: HTX Nông nghiệp Krông Pắc"
            value={form.vendorName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="lf-group">
          <label htmlFor="lf-name">Tên nông sản</label>
          <input
            id="lf-name"
            name="title"
            type="text"
            placeholder="VD: Sầu riêng Ri6, Tiêu đen..."
            value={form.title}
            onChange={handleChange}
            required
          />
        </div>

        <div className="lf-row">
          <div className="lf-group">
            <label htmlFor="lf-cat">Danh mục</label>
            <select id="lf-cat" name="category" value={form.category} onChange={handleChange}>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="lf-group">
            <label htmlFor="lf-loc">Khu vực / Tỉnh</label>
            <input
              id="lf-loc"
              name="location"
              type="text"
              placeholder="VD: Đắk Lắk"
              value={form.location}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="lf-row">
          <div className="lf-group">
            <label htmlFor="lf-price">Giá chào bán (VND)</label>
            <input
              id="lf-price"
              name="price"
              type="number"
              placeholder="VD: 55000"
              min="0"
              value={form.price}
              onChange={handleChange}
              required
            />
          </div>
          <div className="lf-group">
            <label htmlFor="lf-unit">Đơn vị tính</label>
            <select id="lf-unit" name="unit" value={form.unit} onChange={handleChange}>
              <option value="kg">1 Kg</option>
              <option value="tan">1 Tấn</option>
              <option value="ta">1 Tạ</option>
            </select>
          </div>
        </div>

        <div className="lf-group">
          <label htmlFor="lf-desc">Mô tả thêm (Tùy chọn)</label>
          <textarea
            id="lf-desc"
            name="description"
            placeholder="Tình trạng, thông tin vận chuyển, phương thức thanh toán..."
            value={form.description}
            onChange={handleChange}
          />
        </div>

        {error ? <p className="lf-message lf-message-error">{error}</p> : null}
        {success ? <p className="lf-message lf-message-success">Đăng tin thành công.</p> : null}

        <button type="submit" className="lf-submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý...' : 'Đăng tin ngay'}
        </button>
      </form>
    </div>
  )
}
