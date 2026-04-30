import { Fragment, useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  COMMODITY_META,
  FALLBACK_VN_PRICES,
  SOURCE_LABELS,
  type CommoditySummary,
} from '../data/vnPriceTypes';
import './PriceTable.css';

type SortKey = 'commodityName' | 'priceAvg' | 'change' | 'changePct';
type SortDir = 'asc' | 'desc';

function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const safeHigh = high <= low ? low + 1 : high;
  const pct = Math.min(100, Math.max(0, ((current - low) / (safeHigh - low)) * 100));

  return (
    <div className="range-bar">
      <span className="range-bar__low">{Math.round(low / 1000)}k</span>
      <div className="range-bar__track">
        <div className="range-bar__fill" style={{ width: `${pct}%` }} />
        <div className="range-bar__dot" style={{ left: `${pct}%` }} />
      </div>
      <span className="range-bar__high">{Math.round(high / 1000)}k</span>
    </div>
  );
}

function RecommendationBadge({ value }: { value: CommoditySummary['recommendation'] }) {
  return <span className={`badge badge--${value.toLowerCase()}`}>{value}</span>;
}

function ChangeBadge({ change, changePct }: { change: number; changePct: number }) {
  const isUp = change >= 0;

  return (
    <span className={`pt-pct-badge ${isUp ? 'pct--up' : 'pct--down'}`}>
      {isUp ? '▲' : '▼'} {changePct >= 0 ? '+' : ''}
      {changePct.toFixed(2)}%
    </span>
  );
}

function RegionChange({ change }: { change: number | null }) {
  if (change === null) {
    return <>--</>;
  }

  return <>{change >= 0 ? '+' : ''}{change.toLocaleString('vi-VN')}</>;
}

export default function PriceTable({
  data = FALLBACK_VN_PRICES.data,
  loading = false,
  error = null,
}: {
  data?: CommoditySummary[];
  loading?: boolean;
  error?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [sortKey, setSortKey] = useState<SortKey>('priceAvg');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => ['Tất cả', ...new Set(data.map((item) => item.category))], [data]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...data]
      .filter((item) => (category === 'Tất cả' ? true : item.category === category))
      .filter((item) => {
        if (!query) {
          return true;
        }

        return item.commodityName.toLowerCase().includes(query) || item.regions.some((region) => region.region.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string, 'vi') : (av as number) - (bv as number);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [category, data, search, sortDir, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === 'commodityName' ? 'asc' : 'desc');
  }

  function toggleExpanded(commodity: string) {
    setExpanded((current) => ({
      ...current,
      [commodity]: !current[commodity],
    }));
  }

  return (
    <section id="bang-gia" className="price-table-section" aria-label="Bảng giá nông sản">
      <div className="pt-toolbar">
        <div className="pt-tabs" role="tablist" aria-label="Loc theo danh muc">
          {categories.map((item) => (
            <button
              key={item}
              className={`pt-tab${category === item ? ' pt-tab--active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {CATEGORY_LABELS[item] ?? item}
            </button>
          ))}
        </div>
        <input
          className="pt-search"
          type="search"
          placeholder="Tìm mặt hàng hoặc khu vực..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Tìm mặt hàng"
        />
      </div>

      <div className="pt-meta">
        <span>
          Hiển thị <strong>{rows.length}</strong> / {data.length} mặt hàng
        </span>
        <span>{loading ? 'Đang tải dữ liệu...' : error ? `Cảnh báo: ${error}` : 'Dữ liệu API đang hoạt động'}</span>
      </div>

      <div className="pt-scroll-wrap">
        <table className="pt-table" aria-label="Bang gia nong san Viet Nam">
          <thead>
            <tr>
              <th className="pt-th pt-th--name" onClick={() => toggleSort('commodityName')}>Mat hang</th>
              <th className="pt-th" onClick={() => toggleSort('priceAvg')}>Gia TB</th>
              <th className="pt-th" onClick={() => toggleSort('change')}>Thay doi</th>
              <th className="pt-th" onClick={() => toggleSort('changePct')}>% thay doi</th>
              <th className="pt-th">Bien do vung</th>
              <th className="pt-th">Dai 52 tuan</th>
              <th className="pt-th">Khuyen nghi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="pt-empty">
                  Khong co du lieu khop bo loc hien tai.
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const isExpanded = Boolean(expanded[item.commodity]);
                const isUp = item.change >= 0;
                const detailLabel = item.regions.length > 1 ? 'Khu vuc / loai' : 'Chi tiet';

                return (
                  <Fragment key={item.commodity}>
                    <tr className={`pt-row ${isExpanded ? 'pt-row--expanded' : ''}`}>
                      <td className="pt-td pt-td--name">
                        <button className="pt-expand" onClick={() => toggleExpanded(item.commodity)} aria-expanded={isExpanded}>
                          <span className="pt-expand__icon">{isExpanded ? '▼' : '▶'}</span>
                          <span className="pt-code">{COMMODITY_META[item.commodity]?.short ?? 'VN'}</span>
                          <span className="pt-name__text">
                            <strong>{item.commodityName}</strong>
                            <small>{COMMODITY_META[item.commodity]?.nameEn ?? 'Vietnam commodity'}</small>
                          </span>
                        </button>
                      </td>
                      <td className="pt-td pt-td--price">
                        <div className="pt-price-container">
                          <strong>{item.priceAvg.toLocaleString('vi-VN')}</strong>
                          <span>{item.unit.replace('VND/', '')}</span>
                        </div>
                      </td>
                      <td className={`pt-td ${isUp ? 'pt-change--up' : 'pt-change--down'}`}>
                        {item.change >= 0 ? '+' : ''}
                        {item.change.toLocaleString('vi-VN')}
                      </td>
                      <td className="pt-td">
                        <ChangeBadge change={item.change} changePct={item.changePct} />
                      </td>
                      <td className="pt-td">
                        <div className="pt-spread">
                          <span>{item.priceLow.toLocaleString('vi-VN')}</span>
                          <strong>{item.priceHigh.toLocaleString('vi-VN')}</strong>
                        </div>
                      </td>
                      <td className="pt-td pt-td--range">
                        <RangeBar low={item.low52w} high={item.high52w} current={item.priceAvg} />
                      </td>
                      <td className="pt-td pt-td--badge">
                        <RecommendationBadge value={item.recommendation} />
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="pt-detail-row">
                        <td colSpan={7}>
                          <div className="pt-detail">
                            <div className="pt-detail__summary">
                              <span>{detailLabel}: {item.regions.length}</span>
                              <span>Nguồn: {item.sources.map((source) => SOURCE_LABELS[source]).join(', ')}</span>
                            </div>
                            <table className="pt-subtable">
                              <thead>
                                <tr>
                                  <th>{detailLabel}</th>
                                  <th>Giá</th>
                                  <th>Thay đổi</th>
                                  <th>Nguồn</th>
                                  <th>Cảnh báo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.regions.map((region, index) => (
                                  <tr key={`${item.commodity}-${region.region}-${region.source}-${index}`} className={region.hasConflict ? 'pt-subrow--conflict' : ''}>
                                    <td>{region.region}</td>
                                    <td>{region.price.toLocaleString('vi-VN')}</td>
                                    <td><RegionChange change={region.change} /></td>
                                    <td>
                                      <span className="pt-source-badge">{SOURCE_LABELS[region.source]}</span>
                                    </td>
                                    <td>{region.hasConflict ? `Lệch ${region.conflictPct?.toFixed(2)}%` : '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-mobile-list" aria-label="Danh sách giá nông sản trên điện thoại">
        {rows.length === 0 ? (
          <div className="pt-mobile-empty">Không có dữ liệu khớp bộ lọc hiện tại.</div>
        ) : (
          rows.map((item) => {
            const isExpanded = Boolean(expanded[item.commodity]);

            return (
              <article key={`${item.commodity}-mobile`} className={`pt-mobile-card${isExpanded ? ' pt-mobile-card--expanded' : ''}`}>
                <button className="pt-mobile-card__header" type="button" onClick={() => toggleExpanded(item.commodity)} aria-expanded={isExpanded}>
                  <div className="pt-mobile-card__title">
                    <div className="pt-mobile-card__name">
                      <strong>{item.commodityName}</strong>
                    </div>
                  </div>
                  <div className="pt-mobile-card__actions">
                    <RecommendationBadge value={item.recommendation} />
                    <span className="pt-mobile-card__toggle">{isExpanded ? 'Ẩn' : 'Xem'}</span>
                  </div>
                </button>

                <div className="pt-mobile-card__metrics">
                  <div className="pt-mobile-card__metric">
                    <span className="pt-mobile-card__label">Giá trung bình</span>
                    <strong>{item.priceAvg.toLocaleString('vi-VN')}</strong>
                    <small>{item.unit}</small>
                  </div>
                  <div className="pt-mobile-card__metric">
                    <span className="pt-mobile-card__label">Biến động</span>
                    <strong>{item.change >= 0 ? '+' : ''}{item.change.toLocaleString('vi-VN')}</strong>
                    <ChangeBadge change={item.change} changePct={item.changePct} />
                  </div>
                  <div className="pt-mobile-card__metric">
                    <span className="pt-mobile-card__label">Mức giá</span>
                    <strong>{item.priceLow.toLocaleString('vi-VN')} - {item.priceHigh.toLocaleString('vi-VN')}</strong>
                    <small>{item.regions.length} khu vực / loại</small>
                  </div>
                  <div className="pt-mobile-card__metric pt-mobile-card__metric--range">
                    <span className="pt-mobile-card__label">Vị trí 52 tuần</span>
                    <RangeBar low={item.low52w} high={item.high52w} current={item.priceAvg} />
                  </div>
                </div>

                <div className="pt-mobile-card__sources">
                  {item.sources.map((source) => (
                    <span key={`${item.commodity}-${source}`} className="pt-source-badge">
                      {SOURCE_LABELS[source]}
                    </span>
                  ))}
                </div>

                {isExpanded ? (
                  <div className="pt-mobile-card__detail">
                    {item.regions.map((region, index) => (
                      <div
                        key={`${item.commodity}-mobile-${region.region}-${region.source}-${index}`}
                        className={`pt-mobile-region${region.hasConflict ? ' pt-mobile-region--conflict' : ''}`}
                      >
                        <div className="pt-mobile-region__meta">
                          <strong>{region.region}</strong>
                          <span>{SOURCE_LABELS[region.source]}</span>
                        </div>
                        <div className="pt-mobile-region__price">
                          <strong>{region.price.toLocaleString('vi-VN')}</strong>
                          <span><RegionChange change={region.change} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
