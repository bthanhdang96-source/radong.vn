import { useMemo } from 'react';
import { NONG_SAN_DATA } from '../data/nongSanData';
import './SummaryCards.css';

interface StatCard {
  label: string;
  value: string;
  sub: string;
  variant: 'up' | 'down' | 'neutral' | 'accent';
  icon: string; /* SVG path data */
}

// SVG path strings — no emoji, no lucide dependency
const ICON_GRID = 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z';
const ICON_TREND_UP = 'M22 7l-8.5 8.5L9 11 2 18M16 7h6v6';
const ICON_TREND_DOWN = 'M22 17l-8.5-8.5L9 13 2 6M16 17h6v-6';
const ICON_TAG = 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01';

function StatCardItem({ label, value, sub, variant, icon }: StatCard) {
  return (
    <article className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        <p className="stat-card__sub">{sub}</p>
      </div>
    </article>
  );
}

export default function SummaryCards() {
  const stats = useMemo<StatCard[]>(() => {
    const total = NONG_SAN_DATA.length;

    const topGainer = NONG_SAN_DATA.reduce((best, item) =>
      item.thayDoiPct > best.thayDoiPct ? item : best
    );
    const topLoser = NONG_SAN_DATA.reduce((worst, item) =>
      item.thayDoiPct < worst.thayDoiPct ? item : worst
    );
    const buyCount = NONG_SAN_DATA.filter(i => i.khuyenNghi === 'Mua').length;

    return [
      {
        label: 'Tổng mặt hàng',
        value: `${total}`,
        sub: 'trên 5 nhóm ngành',
        variant: 'neutral',
        icon: ICON_GRID,
      },
      {
        label: 'Tăng mạnh nhất',
        value: topGainer.ten,
        sub: `+${topGainer.thayDoiPct.toFixed(2)}% hôm nay`,
        variant: 'up',
        icon: ICON_TREND_UP,
      },
      {
        label: 'Giảm mạnh nhất',
        value: topLoser.ten,
        sub: `${topLoser.thayDoiPct.toFixed(2)}% hôm nay`,
        variant: 'down',
        icon: ICON_TREND_DOWN,
      },
      {
        label: 'Khuyến nghị MUA',
        value: `${buyCount} / ${total}`,
        sub: `${((buyCount / total) * 100).toFixed(0)}% danh mục`,
        variant: 'accent',
        icon: ICON_TAG,
      },
    ];
  }, []);

  return (
    <section className="summary-grid" aria-label="Tổng quan thị trường">
      {stats.map((s, i) => (
        <StatCardItem key={s.label} {...s} style={{ animationDelay: `${i * 80}ms` } as React.CSSProperties} />
      ))}
    </section>
  );
}
