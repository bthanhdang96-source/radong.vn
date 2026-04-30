import { useState, useMemo, useCallback, type CSSProperties } from 'react';
import type { WorldCommodityItem, WorldCategory } from '../../data/worldCommodityData';
import { WORLD_CATEGORIES } from '../../data/worldCommodityData';
import './WorldPriceTable.css';

interface Props {
  data: WorldCommodityItem[];
  exchangeRate: number;
  loading?: boolean;
}

type SortKey = 'name' | 'priceCurrent' | 'changePct' | 'priceVND';
type SortDir = 'asc' | 'desc';

export default function WorldPriceTable({ data, exchangeRate, loading }: Props) {
  const [activeCategory, setActiveCategory] = useState<WorldCategory>('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir(key === 'name' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const filteredData = useMemo(() => {
    let result = data;

    // Category filter
    if (activeCategory !== 'Tất cả') {
      result = result.filter((item) => item.category === activeCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.nameEn.toLowerCase().includes(q) ||
          item.symbol.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'vi');
          break;
        case 'priceCurrent':
          cmp = a.priceCurrent - b.priceCurrent;
          break;
        case 'changePct':
          cmp = a.changePct - b.changePct;
          break;
        case 'priceVND':
          cmp = a.priceCurrent - b.priceCurrent; // same ratio
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [data, activeCategory, searchQuery, sortKey, sortDir]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="wpt-sort-icon wpt-sort-icon--inactive">&#8597;</span>;
    return (
      <span className="wpt-sort-icon">
        {sortDir === 'asc' ? '\u25B2' : '\u25BC'}
      </span>
    );
  };

  // 52W range bar
  const renderRangeBar = (item: WorldCommodityItem) => {
    const range = item.high52w - item.low52w;
    if (range <= 0) return null;
    const position = ((item.priceCurrent - item.low52w) / range) * 100;
    const clampedPos = Math.max(0, Math.min(100, position));

    return (
      <div className="wpt-range">
        <span className="wpt-range__low">{formatPrice(item.low52w)}</span>
        <div className="wpt-range__bar">
          <div className="wpt-range__fill" style={{ width: `${clampedPos}%` }} />
          <div className="wpt-range__marker" style={{ left: `${clampedPos}%` }} />
        </div>
        <span className="wpt-range__high">{formatPrice(item.high52w)}</span>
      </div>
    );
  };

  // Loading skeleton
  if (loading) {
    return (
      <section className="wpt" aria-label="Loading world prices">
        <div className="wpt__skeleton-tabs">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wpt__skeleton-tab" />
          ))}
        </div>
        <div className="wpt__skeleton-table">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="wpt__skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="wpt" aria-label="World commodity prices table">
      {/* Category tabs */}
      <div className="wpt__controls">
        <div className="wpt__tabs" role="tablist">
          {WORLD_CATEGORIES.map((cat) => {
            const count =
              cat === 'Tất cả'
                ? data.length
                : data.filter((d) => d.category === cat).length;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                className={`wpt__tab${activeCategory === cat ? ' wpt__tab--active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                <span className="wpt__tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="wpt__search">
          <svg className="wpt__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="wpt__search-input"
            placeholder="Tìm kiếm mặt hàng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search commodities"
          />
          {searchQuery && (
            <button className="wpt__search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="wpt__table-wrapper">
        <table className="wpt__table">
          <thead>
            <tr>
              <th className="wpt__th wpt__th--name" onClick={() => handleSort('name')}>
                Mặt hàng {renderSortIcon('name')}
              </th>
              <th className="wpt__th wpt__th--exchange">Sàn</th>
              <th className="wpt__th wpt__th--price" onClick={() => handleSort('priceCurrent')}>
                Giá (USD) {renderSortIcon('priceCurrent')}
              </th>
              <th className="wpt__th wpt__th--price-vnd" onClick={() => handleSort('priceVND')}>
                Giá (VND) {renderSortIcon('priceVND')}
              </th>
              <th className="wpt__th wpt__th--change" onClick={() => handleSort('changePct')}>
                Thay đổi {renderSortIcon('changePct')}
              </th>
              <th className="wpt__th wpt__th--range">52 Tuần</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={6} className="wpt__empty">
                  <div className="wpt__empty-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                      <path d="M8 11h6" />
                    </svg>
                    <p>Không tìm thấy mặt hàng nào</p>
                    <span>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((item, index) => {
                const isUp = item.changePct > 0;
                const isDown = item.changePct < 0;
                const priceVND = convertToVND(item.priceCurrent, exchangeRate);

                return (
                  <tr
                    key={item.id}
                    className="wpt__row"
                    style={{ '--row-index': index } as CSSProperties}
                  >
                    {/* Name */}
                    <td className="wpt__td wpt__td--name">
                      <div className="wpt__commodity">
                        <div className="wpt__commodity-info">
                          <span className="wpt__commodity-name">{item.name}</span>
                          <span className="wpt__commodity-en">{item.nameEn}</span>
                        </div>
                        <span className="wpt__symbol">{item.symbol}</span>
                      </div>
                    </td>

                    {/* Exchange */}
                    <td className="wpt__td wpt__td--exchange">
                      <span className="wpt__exchange-badge">{item.exchange}</span>
                    </td>

                    {/* Price USD */}
                    <td className="wpt__td wpt__td--price">
                      <div className="wpt__price-block">
                        <span className="wpt__price-main">{formatPrice(item.priceCurrent)}</span>
                        <span className="wpt__price-unit">{item.unit}</span>
                      </div>
                    </td>

                    {/* Price VND */}
                    <td className="wpt__td wpt__td--price-vnd">
                      <span className="wpt__price-vnd">
                        {priceVND !== null ? formatVND(priceVND) : '--'}
                      </span>
                    </td>

                    {/* Change */}
                    <td className={`wpt__td wpt__td--change ${isUp ? 'wpt__td--up' : isDown ? 'wpt__td--down' : ''}`}>
                      <div className="wpt__change-block">
                        <span className="wpt__change-pct">
                          {isUp ? '+' : ''}{item.changePct}%
                        </span>
                        <span className="wpt__change-abs">
                          {isUp ? '+' : ''}{formatPrice(item.change)}
                        </span>
                      </div>
                    </td>

                    {/* 52W Range */}
                    <td className="wpt__td wpt__td--range">
                      {renderRangeBar(item)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="wpt__footer">
        <span className="wpt__footer-count">
          Hiển thị {filteredData.length} / {data.length} mặt hàng
        </span>
        <span className="wpt__footer-source">
          Nguồn: World Bank Commodity Markets &middot; Tỷ giá: {exchangeRate.toLocaleString('vi-VN')} VND/USD
        </span>
      </div>
    </section>
  );
}

// ─── Helpers ────────────────────────────────────────────

function formatPrice(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  if (Math.abs(value) >= 1) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatVND(value: number): string {
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + ' tr';
  }
  if (value >= 1_000) {
    return Math.round(value).toLocaleString('vi-VN');
  }
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}

/**
 * Convert USD price to VND based on unit.
 * Prices in "USD/tấn" are per metric ton,
 * "USD/kg" are per kilogram, etc.
 */
function convertToVND(priceUSD: number, rate: number): number | null {
  // Simple conversion: just multiply by exchange rate
  // The unit stays the same (VND/kg, VND/tấn, etc.)
  return priceUSD * rate;
}
