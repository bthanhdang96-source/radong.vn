import { useMemo } from 'react';
import { NONG_SAN_DATA, type NongSanItem } from '../data/nongSanData';
import './TopMovers.css';

// ─── Mini Bar Chart (pure SVG — no lib dep) ─────────────────────────────────
function SparkBars({ item }: { item: NongSanItem }) {
  const prices = [
    item.giaThangtruoc,
    item.giaTuanTruoc,
    item.giaHom_qua,
    item.giaCurrent,
  ];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 56;
  const H = 28;
  const barW = 10;
  const gap = 4;
  const isUp = item.thayDoi >= 0;

  return (
    <svg
      className="spark-bars"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {prices.map((p, i) => {
        const h = Math.max(3, ((p - min) / range) * (H - 4));
        const x = i * (barW + gap);
        const y = H - h;
        const opacity = 0.35 + (i / prices.length) * 0.65;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx="2"
            fill={isUp ? 'var(--color-up)' : 'var(--color-down)'}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

// ─── Single mover card ────────────────────────────────────────────────────────
function MoverCard({ item, rank }: { item: NongSanItem; rank: number }) {
  const isUp = item.thayDoi >= 0;
  const sign = isUp ? '+' : '';

  return (
    <article className={`mover-card ${isUp ? 'mover-card--up' : 'mover-card--down'}`}>
      <div className="mover-card__rank">#{rank}</div>

      <div className="mover-card__header">
        <span className="mover-card__icon">{item.icon}</span>
        <div className="mover-card__title">
          <span className="mover-card__name">{item.ten}</span>
          <span className="mover-card__en">{item.tenEn}</span>
        </div>
      </div>

      <div className="mover-card__body">
        <div className="mover-card__price-block">
          <span className="mover-card__price">
            {item.giaCurrent.toLocaleString('vi-VN')}
          </span>
          <span className="mover-card__unit">
            {item.donVi.replace('VND/', '')}
          </span>
        </div>
        <SparkBars item={item} />
      </div>

      <div className="mover-card__footer">
        <span className={`mover-pct ${isUp ? 'mover-pct--up' : 'mover-pct--down'}`}>
          {isUp ? '▲' : '▼'} {sign}{item.thayDoiPct.toFixed(2)}%
        </span>
        <span className="mover-card__abs">
          {sign}{item.thayDoi.toLocaleString('vi-VN')} VND
        </span>
      </div>
    </article>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
export default function TopMovers() {
  const { gainers, losers } = useMemo(() => {
    const sorted = [...NONG_SAN_DATA].sort(
      (a, b) => b.thayDoiPct - a.thayDoiPct,
    );
    return {
      gainers: sorted.slice(0, 3),
      losers: sorted.slice(-3).reverse(),
    };
  }, []);

  return (
    <section className="top-movers" aria-label="Biến động nổi bật hôm nay">
      <div className="top-movers__inner">

        {/* ── Gainers ── */}
        <div className="movers-group">
          <header className="movers-group__header movers-group__header--up">
            <span className="movers-group__dot" />
            <h2 className="movers-group__title">Tăng mạnh nhất</h2>
            <span className="movers-group__badge movers-group__badge--up">Top 3</span>
          </header>
          <div className="movers-group__cards">
            {gainers.map((item, i) => (
              <MoverCard key={item.id} item={item} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="movers-divider" aria-hidden="true">
          <div className="movers-divider__line" />
          <span className="movers-divider__label">VS</span>
          <div className="movers-divider__line" />
        </div>

        {/* ── Losers ── */}
        <div className="movers-group">
          <header className="movers-group__header movers-group__header--down">
            <span className="movers-group__dot movers-group__dot--down" />
            <h2 className="movers-group__title">Giảm mạnh nhất</h2>
            <span className="movers-group__badge movers-group__badge--down">Top 3</span>
          </header>
          <div className="movers-group__cards">
            {losers.map((item, i) => (
              <MoverCard key={item.id} item={item} rank={i + 1} />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
