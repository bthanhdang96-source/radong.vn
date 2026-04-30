import { useMemo } from 'react';
import type { WorldCommodityItem } from '../../data/worldCommodityData';
import './WorldSummaryCards.css';

interface Props {
  data: WorldCommodityItem[];
  exchangeRate: number;
}

export default function WorldSummaryCards({ data, exchangeRate }: Props) {
  const stats = useMemo(() => {
    if (!data.length) return null;

    const upItems = data.filter((d) => d.changePct > 0);
    const downItems = data.filter((d) => d.changePct < 0);

    const topGainer = upItems.length
      ? upItems.reduce((a, b) => (a.changePct > b.changePct ? a : b))
      : null;

    const topLoser = downItems.length
      ? downItems.reduce((a, b) => (a.changePct < b.changePct ? a : b))
      : null;

    return {
      total: data.length,
      upCount: upItems.length,
      downCount: downItems.length,
      topGainer,
      topLoser,
      exchangeRate,
    };
  }, [data, exchangeRate]);

  if (!stats) return null;

  return (
    <section className="world-summary" aria-label="World market summary">
      {/* Card 1: Total tracked */}
      <div className="world-summary__card" style={{ '--card-index': 0 } as React.CSSProperties}>
        <div className="world-summary__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 110 20 10 10 0 010-20z" />
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
          </svg>
        </div>
        <div className="world-summary__content">
          <span className="world-summary__label">Mặt hàng theo dõi</span>
          <span className="world-summary__value">{stats.total}</span>
          <span className="world-summary__detail">
            <span className="world-summary__up">{stats.upCount} tăng</span>
            {' / '}
            <span className="world-summary__down">{stats.downCount} giảm</span>
          </span>
        </div>
      </div>

      {/* Card 2: Top Gainer */}
      <div className="world-summary__card world-summary__card--up" style={{ '--card-index': 1 } as React.CSSProperties}>
        <div className="world-summary__icon world-summary__icon--up">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </div>
        <div className="world-summary__content">
          <span className="world-summary__label">Tăng mạnh nhất</span>
          <span className="world-summary__value world-summary__value--up">
            {stats.topGainer ? `+${stats.topGainer.changePct}%` : '--'}
          </span>
          <span className="world-summary__detail">
            {stats.topGainer?.name ?? '--'}
          </span>
        </div>
      </div>

      {/* Card 3: Top Loser */}
      <div className="world-summary__card world-summary__card--down" style={{ '--card-index': 2 } as React.CSSProperties}>
        <div className="world-summary__icon world-summary__icon--down">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className="world-summary__content">
          <span className="world-summary__label">Giảm mạnh nhất</span>
          <span className="world-summary__value world-summary__value--down">
            {stats.topLoser ? `${stats.topLoser.changePct}%` : '--'}
          </span>
          <span className="world-summary__detail">
            {stats.topLoser?.name ?? '--'}
          </span>
        </div>
      </div>

      {/* Card 4: Exchange Rate */}
      <div className="world-summary__card" style={{ '--card-index': 3 } as React.CSSProperties}>
        <div className="world-summary__icon world-summary__icon--rate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        </div>
        <div className="world-summary__content">
          <span className="world-summary__label">Tỷ giá tham chiếu</span>
          <span className="world-summary__value">
            {stats.exchangeRate.toLocaleString('vi-VN')}
          </span>
          <span className="world-summary__detail">USD/VND</span>
        </div>
      </div>
    </section>
  );
}
