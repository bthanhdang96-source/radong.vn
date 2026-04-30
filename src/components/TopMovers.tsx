import { useMemo } from 'react';
import { COMMODITY_META, FALLBACK_VN_PRICES, type CommoditySummary } from '../data/vnPriceTypes';
import './TopMovers.css';

function SparkBars({ item }: { item: CommoditySummary }) {
  const prices = [item.low52w, item.priceLow, item.priceAvg, item.priceHigh];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const isUp = item.change >= 0;

  return (
    <svg className="spark-bars" viewBox="0 0 56 28" preserveAspectRatio="none" aria-hidden="true">
      {prices.map((price, index) => {
        const height = Math.max(3, ((price - min) / range) * 24);
        const x = index * 14;
        const y = 28 - height;
        const opacity = 0.35 + index * 0.15;
        return (
          <rect
            key={`${item.commodity}-${index}`}
            x={x}
            y={y}
            width="10"
            height={height}
            rx="2"
            fill={isUp ? 'var(--color-up)' : 'var(--color-down)'}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function MoverCard({ item, rank }: { item: CommoditySummary; rank: number }) {
  const isUp = item.changePct >= 0;
  const sign = isUp ? '+' : '';

  return (
    <article className={`mover-card ${isUp ? 'mover-card--up' : 'mover-card--down'}`}>
      <div className="mover-card__rank">#{rank}</div>
      <div className="mover-card__header">
        <span className="mover-card__icon">{COMMODITY_META[item.commodity]?.short ?? 'VN'}</span>
        <div className="mover-card__title">
          <span className="mover-card__name">{item.commodityName}</span>
          <span className="mover-card__en">{COMMODITY_META[item.commodity]?.nameEn ?? 'Vietnam commodity'}</span>
        </div>
      </div>
      <div className="mover-card__body">
        <div className="mover-card__price-block">
          <span className="mover-card__price">{item.priceAvg.toLocaleString('vi-VN')}</span>
          <span className="mover-card__unit">{item.unit.replace('VND/', '')}</span>
        </div>
        <SparkBars item={item} />
      </div>
      <div className="mover-card__footer">
        <span className={`mover-pct ${isUp ? 'mover-pct--up' : 'mover-pct--down'}`}>
          {isUp ? '▲' : '▼'} {sign}
          {item.changePct.toFixed(2)}%
        </span>
        <span className="mover-card__abs">
          {sign}
          {item.change.toLocaleString('vi-VN')} VND
        </span>
      </div>
    </article>
  );
}

export default function TopMovers({ items = FALLBACK_VN_PRICES.data }: { items?: CommoditySummary[] }) {
  const { gainers, losers } = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.changePct - a.changePct);
    return {
      gainers: sorted.slice(0, Math.min(3, sorted.length)),
      losers: sorted.slice(-Math.min(3, sorted.length)).reverse(),
    };
  }, [items]);

  return (
    <section className="top-movers" aria-label="Bien dong noi bat hom nay">
      <div className="top-movers__inner">
        <div className="movers-group">
          <header className="movers-group__header movers-group__header--up">
            <span className="movers-group__dot" />
            <h2 className="movers-group__title">Tang manh nhat</h2>
            <span className="movers-group__badge movers-group__badge--up">Top {gainers.length}</span>
          </header>
          <div className="movers-group__cards">
            {gainers.map((item, index) => (
              <MoverCard key={item.commodity} item={item} rank={index + 1} />
            ))}
          </div>
        </div>

        <div className="movers-divider" aria-hidden="true">
          <div className="movers-divider__line" />
          <span className="movers-divider__label">VS</span>
          <div className="movers-divider__line" />
        </div>

        <div className="movers-group">
          <header className="movers-group__header movers-group__header--down">
            <span className="movers-group__dot movers-group__dot--down" />
            <h2 className="movers-group__title">Giam manh nhat</h2>
            <span className="movers-group__badge movers-group__badge--down">Top {losers.length}</span>
          </header>
          <div className="movers-group__cards">
            {losers.map((item, index) => (
              <MoverCard key={`${item.commodity}-down`} item={item} rank={index + 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
