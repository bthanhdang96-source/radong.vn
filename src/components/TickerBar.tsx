import { useMemo } from 'react';
import { COMMODITY_META, FALLBACK_VN_PRICES, type CommoditySummary } from '../data/vnPriceTypes';
import './TickerBar.css';

function TickerChip({ item }: { item: CommoditySummary }) {
  const isUp = item.changePct > 0;
  const isDown = item.changePct < 0;
  const cls = isUp ? 'ticker-chip--up' : isDown ? 'ticker-chip--down' : 'ticker-chip--flat';

  return (
    <span className={`ticker-chip ${cls}`}>
      <span className="ticker-chip__name">
        <span className="ticker-chip__code">{COMMODITY_META[item.commodity]?.short ?? 'VN'}</span>
        {item.commodityName}
      </span>
      <span className="ticker-chip__price">
        {item.priceAvg.toLocaleString('vi-VN')}
        <span className="ticker-chip__unit"> {item.unit.replace('VND/', '')}</span>
      </span>
      <span className="ticker-chip__change">
        {item.changePct >= 0 ? '+' : ''}
        {item.changePct.toFixed(2)}%
      </span>
    </span>
  );
}

export default function TickerBar({ items = FALLBACK_VN_PRICES.data }: { items?: CommoditySummary[] }) {
  const loopItems = useMemo(() => [...items, ...items], [items]);

  return (
    <div className="ticker-bar" role="marquee" aria-label="Gia nong san moi nhat">
      <div className="ticker-bar__label">
        <span className="ticker-bar__dot" />
        LIVE
      </div>
      <div className="ticker-bar__track-wrap">
        <div className="ticker-bar__track">
          {loopItems.map((item, index) => (
            <TickerChip key={`${item.commodity}-${index}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
