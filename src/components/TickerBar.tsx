import { useMemo } from 'react';
import { TICKER_ITEMS } from '../data/nongSanData';
import './TickerBar.css';

// Isolated, memoized rendering of a single ticker chip — prevents parent re-renders
const TickerChip = ({
  ten,
  giaCurrent,
  thayDoiPct,
  donVi,
}: {
  ten: string;
  giaCurrent: number;
  thayDoiPct: number;
  donVi: string;
}) => {
  const isUp = thayDoiPct > 0;
  const isDown = thayDoiPct < 0;
  const sign = isUp ? '+' : '';
  const cls = isUp ? 'ticker-chip--up' : isDown ? 'ticker-chip--down' : 'ticker-chip--flat';

  return (
    <span className={`ticker-chip ${cls}`}>
      <span className="ticker-chip__name">{ten}</span>
      <span className="ticker-chip__price">
        {giaCurrent.toLocaleString('vi-VN')}
        <span className="ticker-chip__unit"> {donVi.replace('VND/', '')}</span>
      </span>
      <span className="ticker-chip__change">
        {sign}{thayDoiPct.toFixed(2)}%
      </span>
    </span>
  );
};

const MemoChip = /* @__PURE__ */ (() => {
  const M = (props: Parameters<typeof TickerChip>[0]) => <TickerChip {...props} />;
  M.displayName = 'MemoChip';
  return M;
})();

export default function TickerBar() {
  // Duplicate items to create seamless infinite loop (50% trick)
  const items = useMemo(() => [...TICKER_ITEMS, ...TICKER_ITEMS], []);

  return (
    <div className="ticker-bar" role="marquee" aria-label="Giá nông sản mới nhất">
      <div className="ticker-bar__label">
        <span className="ticker-bar__dot" />
        LIVE
      </div>
      <div className="ticker-bar__track-wrap">
        <div className="ticker-bar__track">
          {items.map((item, i) => (
            <MemoChip key={`${item.id}-${i}`} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}
