import type { PriceChainItem } from '../../data/vnPriceTypes'
import './PriceChainSummaryCards.css'

type Props = {
  data: PriceChainItem[]
  lastUpdated: string
}

export default function PriceChainSummaryCards({ data, lastUpdated }: Props) {
  const retailCount = data.filter(item => item.retailVnd !== null).length
  const completeChainCount = data.filter(
    item => item.farmGateVnd !== null && item.wholesaleVnd !== null && item.retailVnd !== null,
  ).length
  const widestSpread = data.reduce<PriceChainItem | null>((current, item) => {
    if (item.retailVsFarmgatePct === null) {
      return current
    }

    if (!current || (current.retailVsFarmgatePct ?? Number.NEGATIVE_INFINITY) < item.retailVsFarmgatePct) {
      return item
    }

    return current
  }, null)

  const cards = [
    {
      label: 'Mặt hàng retail',
      value: retailCount.toLocaleString('vi-VN'),
      detail: `${data.length.toLocaleString('vi-VN')} mặt hàng đang theo dõi`,
    },
    {
      label: 'Chuỗi nội địa đủ tầng',
      value: completeChainCount.toLocaleString('vi-VN'),
      detail: 'farm gate + wholesale + retail',
    },
    {
      label: 'Biên retail lớn nhất',
      value:
        widestSpread?.retailVsFarmgatePct !== null && widestSpread?.retailVsFarmgatePct !== undefined
          ? `${widestSpread.retailVsFarmgatePct > 0 ? '+' : ''}${widestSpread.retailVsFarmgatePct.toFixed(1)}%`
          : '--',
      detail: widestSpread?.commodityName ?? 'Chưa có dữ liệu spread',
    },
    {
      label: 'Cập nhật cuối',
      value: lastUpdated ? new Date(lastUpdated).toLocaleString('vi-VN') : '--',
      detail: 'Supabase curated views',
    },
  ]

  return (
    <section className="pcs" aria-label="Tóm tắt chuỗi giá">
      {cards.map(card => (
        <article key={card.label} className="pcs__card">
          <span className="pcs__label">{card.label}</span>
          <strong className="pcs__value">{card.value}</strong>
          <span className="pcs__detail">{card.detail}</span>
        </article>
      ))}
    </section>
  )
}
