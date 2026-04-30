import { useState, useMemo, useCallback } from 'react';
import {
  NONG_SAN_DATA,
  CATEGORIES,
  type Category,
  type NongSanItem,
} from '../data/nongSanData';
import DetailModal from './DetailModal';
import './PriceTable.css';

// ─── Types ──────────────────────────────────────────────────────────────────
type SortKey = keyof Pick<
  NongSanItem,
  'ten' | 'giaCurrent' | 'thayDoi' | 'thayDoiPct' | 'giaHom_qua' | 'giaTuanTruoc'
>;
type SortDir = 'asc' | 'desc';

// ─── SVG Icons (no emoji, no external dep) ──────────────────────────────────
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconSort({ dir }: { dir: SortDir | null }) {
  if (!dir) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'asc'
        ? <path d="M12 19V5M5 12l7-7 7 7" />
        : <path d="M12 5v14M5 12l7 7 7-7" />}
    </svg>
  );
}

function IconClear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Category pill labels with counts ────────────────────────────────────────
function CategoryTabs({
  active,
  onChange,
}: {
  active: Category;
  onChange: (c: Category) => void;
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { 'Tất cả': NONG_SAN_DATA.length };
    NONG_SAN_DATA.forEach((item) => {
      map[item.category] = (map[item.category] || 0) + 1;
    });
    return map;
  }, []);

  const categoryIcons: Record<Category, string> = {
    'Tất cả': '○',
    'Lương thực': '◈',
    'Cây công nghiệp': '◉',
    'Rau củ quả': '◆',
    'Thủy sản': '◇',
    'Chăn nuôi': '◎',
  };

  return (
    <div className="pt-tabs" role="tablist" aria-label="Lọc theo danh mục">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={active === cat}
          className={`pt-tab${active === cat ? ' pt-tab--active' : ''}`}
          onClick={() => onChange(cat)}
        >
          <span className="pt-tab__icon">{categoryIcons[cat]}</span>
          <span className="pt-tab__label">{cat}</span>
          <span className="pt-tab__count">{counts[cat] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

// ─── 52-week range bar ────────────────────────────────────────────────────────
function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div className="range-bar" title={`52W: ${low.toLocaleString('vi-VN')} – ${high.toLocaleString('vi-VN')}`}>
      <span className="range-bar__low">{(low / 1000).toFixed(0)}k</span>
      <div className="range-bar__track">
        <div className="range-bar__fill" style={{ width: `${pct}%` }} />
        <div className="range-bar__dot" style={{ left: `${pct}%` }} />
      </div>
      <span className="range-bar__high">{(high / 1000).toFixed(0)}k</span>
    </div>
  );
}

// ─── Sparkline (7 days) ───────────────────────────────────────────────────────
function Sparkline({ item }: { item: NongSanItem }) {
  // We mock a 7-day trend using the available data points
  const points = [
    item.giaThangtruoc,
    item.giaTuanTruoc,
    item.giaHom_qua,
    item.giaCurrent,
  ];
  
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const isUp = item.thayDoi >= 0;
  
  const width = 60;
  const height = 24;
  const strokeColor = isUp ? 'var(--color-up)' : 'var(--color-down)';
  
  // Transform points to SVG coordinates
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 4) - 2; // -2 for padding
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(' L ')}`;

  return (
    <svg className="pt-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={pathD} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r="2" fill={strokeColor} />
    </svg>
  );
}

// ─── Recommendation badge ─────────────────────────────────────────────────────
function RecommendBadge({ value }: { value: 'Mua' | 'Bán' | 'Giữ' }) {
  const cls = value === 'Mua' ? 'badge--buy' : value === 'Bán' ? 'badge--sell' : 'badge--hold';
  return <span className={`badge ${cls}`}>{value}</span>;
}

// ─── Sortable column header ───────────────────────────────────────────────────
function SortTh({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const isActive = sortKey === col;
  return (
    <th
      className={`pt-th pt-th--sortable${isActive ? ' pt-th--active' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onSort(col)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSort(col)}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="pt-th__inner">
        {label}
        <span className="pt-th__icon">
          <IconSort dir={isActive ? sortDir : null} />
        </span>
      </span>
    </th>
  );
}

// ─── Main PriceTable ──────────────────────────────────────────────────────────
export default function PriceTable() {
  const [category, setCategory] = useState<Category>('Tất cả');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('thayDoiPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedItem, setSelectedItem] = useState<NongSanItem | null>(null);

  const handleSort = useCallback(
    (col: SortKey) => {
      if (col === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(col);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  const rows = useMemo(() => {
    let list = NONG_SAN_DATA;

    // Category filter
    if (category !== 'Tất cả') {
      list = list.filter((i) => i.category === category);
    }

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.ten.toLowerCase().includes(q) ||
          i.tenEn.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string, 'vi') : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [category, search, sortKey, sortDir]);

  const fmtVND = (n: number) => n.toLocaleString('vi-VN');
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const fmtChange = (n: number) => `${n >= 0 ? '+' : ''}${fmtVND(n)}`;

  return (
    <section id="bang-gia" className="price-table-section" aria-label="Bảng giá nông sản">
      {/* ── Toolbar ── */}
      <div className="pt-toolbar">
        <CategoryTabs active={category} onChange={setCategory} />
        <div className="pt-search-wrap">
          <span className="pt-search-icon"><IconSearch /></span>
          <input
            id="search-input"
            className="pt-search"
            type="text"
            placeholder="Tìm nông sản..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm kiếm nông sản"
          />
          {search && (
            <button className="pt-search-clear" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm">
              <IconClear />
            </button>
          )}
        </div>
      </div>

      {/* ── Result count ── */}
      <div className="pt-meta">
        <span className="pt-meta__count">
          Hiển thị <strong>{rows.length}</strong> / {NONG_SAN_DATA.length} mặt hàng
        </span>
        <span className="pt-meta__update">
          Cập nhật: {new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="pt-scroll-wrap">
        <table className="pt-table" aria-label="Bảng giá nông sản Việt Nam">
          <thead>
            <tr>
              <SortTh col="ten"          label="Nông sản"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="pt-th--name" />
              <SortTh col="giaCurrent"   label="Giá hiện tại"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="thayDoi"      label="Thay đổi"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="thayDoiPct"   label="% Thay đổi"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="giaHom_qua"   label="Hôm qua"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="giaTuanTruoc" label="Tuần trước"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="pt-th pt-th--center">Chuỗi giá 7D</th>
              <th className="pt-th">Dải 52 tuần</th>
              <th className="pt-th pt-th--center">Khuyến nghị</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="pt-empty">
                  <div className="pt-empty__inner">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35M11 8v3M11 14h.01" />
                    </svg>
                    <p>Không tìm thấy kết quả cho "<strong>{search}</strong>"</p>
                    <button className="pt-empty__reset" onClick={() => { setSearch(''); setCategory('Tất cả'); }}>
                      Xóa bộ lọc
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((item, idx) => {
                const isUp   = item.thayDoi > 0;
                const isDown = item.thayDoi < 0;
                const dirCls = isUp ? 'row--up' : isDown ? 'row--down' : 'row--flat';

                return (
                  <tr
                    key={item.id}
                    className={`pt-row ${dirCls}`}
                    style={{ '--row-index': idx, cursor: 'pointer' } as React.CSSProperties}
                    onClick={() => setSelectedItem(item)}
                  >
                    {/* Name */}
                    <td className="pt-td pt-td--name">
                      <div className="pt-name">
                        <span className="pt-name__icon">{item.icon}</span>
                        <div className="pt-name__text">
                          <span className="pt-name__vi">{item.ten}</span>
                          <span className="pt-name__en">{item.tenEn}</span>
                        </div>
                      </div>
                    </td>

                    {/* Current price */}
                    <td className="pt-td pt-td--price">
                      <div className="pt-price">
                        <span className="pt-price__value">{fmtVND(item.giaCurrent)}</span>
                        <span className="pt-price__unit">{item.donVi.replace('VND/', '')}</span>
                      </div>
                    </td>

                    {/* Change */}
                    <td className={`pt-td pt-td--change pt-change`}>
                      <span className={`pt-change__val${isUp ? ' pt-change--up' : isDown ? ' pt-change--down' : ''}`}>
                        {fmtChange(item.thayDoi)}
                      </span>
                    </td>

                    {/* Change % */}
                    <td className="pt-td pt-td--pct">
                      <span className={`pt-pct-badge${isUp ? ' pct--up' : isDown ? ' pct--down' : ' pct--flat'}`}>
                        {isUp ? '▲' : isDown ? '▼' : '─'} {fmtPct(item.thayDoiPct)}
                      </span>
                    </td>

                    {/* Yesterday */}
                    <td className="pt-td pt-td--num">{fmtVND(item.giaHom_qua)}</td>

                    {/* Last week */}
                    <td className="pt-td pt-td--num">{fmtVND(item.giaTuanTruoc)}</td>

                    {/* Sparkline 7D */}
                    <td className="pt-td pt-td--center">
                      <Sparkline item={item} />
                    </td>

                    {/* 52W Range */}
                    <td className="pt-td pt-td--range">
                      <RangeBar low={item.low52w} high={item.high52w} current={item.giaCurrent} />
                    </td>

                    {/* Recommendation */}
                    <td className="pt-td pt-td--badge">
                      <RecommendBadge value={item.khuyenNghi} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="pt-footer">
        <p className="pt-footer__note">
          * Dữ liệu giá mang tính tham khảo. Giá thực tế có thể biến động tuỳ theo khu vực và thời điểm giao dịch.
        </p>
      </div>

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </section>
  );
}
