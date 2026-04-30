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
  const label = value === 'Mua' ? 'Mua' : value === 'Ban' ? 'Ban' : 'Giu';
  return <span className={`badge badge--${label.toLowerCase()}`}>{label}</span>;
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
  const [category, setCategory] = useState('Tat ca');
  const [sortKey, setSortKey] = useState<SortKey>('priceAvg');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => ['Tat ca', ...new Set(data.map((item) => item.category))], [data]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...data]
      .filter((item) => (category === 'Tat ca' ? true : item.category === category))
      .filter((item) => {
        if (!query) {
          return true;
        }

        return (
          item.commodityName.toLowerCase().includes(query) ||
          item.regions.some((region) => region.region.toLowerCase().includes(query))
        );
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
    <section id="bang-gia" className="price-table-section" aria-label="Bang gia nong san">
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
          placeholder="Tim commodity hoac khu vuc..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Tim commodity"
        />
      </div>

      <div className="pt-meta">
        <span>
          Hien thi <strong>{rows.length}</strong> / {data.length} commodity
        </span>
        <span>{loading ? 'Dang tai du lieu...' : error ? `Canh bao: ${error}` : 'Du lieu API dang hoat dong'}</span>
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
              <th className="pt-th">Range</th>
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
                        <strong>{item.priceAvg.toLocaleString('vi-VN')}</strong>
                        <span>{item.unit.replace('VND/', '')}</span>
                      </td>
                      <td className={`pt-td ${isUp ? 'pt-change--up' : 'pt-change--down'}`}>
                        {item.change >= 0 ? '+' : ''}
                        {item.change.toLocaleString('vi-VN')}
                      </td>
                      <td className="pt-td">
                        <span className={`pt-pct-badge ${isUp ? 'pct--up' : 'pct--down'}`}>
                          {isUp ? '▲' : '▼'} {item.changePct >= 0 ? '+' : ''}
                          {item.changePct.toFixed(2)}%
                        </span>
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
                              <span>Nguon: {item.sources.map((source) => SOURCE_LABELS[source]).join(', ')}</span>
                            </div>
                            <table className="pt-subtable">
                              <thead>
                                <tr>
                                  <th>{detailLabel}</th>
                                  <th>Gia</th>
                                  <th>Thay doi</th>
                                  <th>Nguon</th>
                                  <th>Canh bao</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.regions.map((region, index) => (
                                  <tr key={`${item.commodity}-${region.region}-${region.source}-${index}`} className={region.hasConflict ? 'pt-subrow--conflict' : ''}>
                                    <td>{region.region}</td>
                                    <td>{region.price.toLocaleString('vi-VN')}</td>
                                    <td>
                                      {region.change === null ? '--' : `${region.change >= 0 ? '+' : ''}${region.change.toLocaleString('vi-VN')}`}
                                    </td>
                                    <td>
                                      <span className="pt-source-badge">{SOURCE_LABELS[region.source]}</span>
                                    </td>
                                    <td>{region.hasConflict ? `Lech ${region.conflictPct?.toFixed(2)}%` : '--'}</td>
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
    </section>
  );
}
