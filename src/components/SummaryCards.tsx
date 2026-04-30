import type { ReactNode } from 'react';
import { FALLBACK_VN_PRICES, SOURCE_LABELS, type CommoditySummary, type PriceSourceStatus, type VnPricesResponse } from '../data/vnPriceTypes';
import './SummaryCards.css';

type Props = {
  data?: CommoditySummary[];
  sources?: PriceSourceStatus[];
  lastUpdated?: string;
  status?: VnPricesResponse['status'];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

function formatTimestamp(value?: string): string {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function Card({
  label,
  value,
  sub,
  variant,
  children,
}: {
  label: string;
  value: string;
  sub: string;
  variant: 'up' | 'down' | 'neutral' | 'accent';
  children?: ReactNode;
}) {
  return (
    <article className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        <p className="stat-card__sub">{sub}</p>
        {children}
      </div>
    </article>
  );
}

export default function SummaryCards({
  data = FALLBACK_VN_PRICES.data,
  sources = FALLBACK_VN_PRICES.sources,
  lastUpdated,
  status = 'fallback',
  loading = false,
  refreshing = false,
  onRefresh,
}: Props) {
  const topGainer = [...data].sort((a, b) => b.changePct - a.changePct)[0] ?? FALLBACK_VN_PRICES.data[0];
  const groupedSources = Object.values(
    sources.reduce<Record<string, (typeof sources)[number] & { total: number; healthy: number }>>((acc, source) => {
      const key = source.id;
      const existing = acc[key];
      if (!existing) {
        acc[key] = {
          ...source,
          total: 1,
          healthy: source.success ? 1 : 0,
        };
        return acc;
      }

      acc[key] = {
        ...existing,
        fetchedAt: source.fetchedAt > existing.fetchedAt ? source.fetchedAt : existing.fetchedAt,
        total: existing.total + 1,
        healthy: existing.healthy + (source.success ? 1 : 0),
        itemCount: existing.itemCount + source.itemCount,
        droppedCount: (existing.droppedCount ?? 0) + (source.droppedCount ?? 0),
        dedupCount: (existing.dedupCount ?? 0) + (source.dedupCount ?? 0),
      };
      return acc;
    }, {}),
  ).sort((a, b) => b.priority - a.priority);

  const activeSources = groupedSources.filter((source) => source.healthy > 0);
  const sourceSummary = activeSources.length > 0 ? activeSources.map((source) => SOURCE_LABELS[source.id]).join(' + ') : 'Đang sử dụng dữ liệu dự phòng';

  return (
    <section className="summary-grid" aria-label="Tổng quan thị trường">
      <Card
        label="Tổng mặt hàng"
        value={loading ? 'Đang tải...' : `${data.length}`}
        sub="Dữ liệu VN giá thực"
        variant="neutral"
      />
      <Card
        label="Nguồn dữ liệu"
        value={sourceSummary}
        sub={status === 'live' ? 'Đang lấy dữ liệu trực tiếp' : status === 'cached' ? 'Sử dụng bộ nhớ đệm' : 'Dữ liệu nội bộ'}
        variant={activeSources.length > 0 ? 'accent' : 'down'}
      >
        <div className="stat-card__tags">
          {groupedSources.map((source) => (
            <span key={`${source.id}-${source.fetchedAt}`} className={`stat-card__tag ${source.healthy > 0 ? 'stat-card__tag--ok' : 'stat-card__tag--fail'}`}>
              {source.healthy > 0 ? 'TỐT' : 'LỖI'} {SOURCE_LABELS[source.id]} {source.healthy}/{source.total}
              {(source.droppedCount ?? 0) > 0 ? ` bỏ:${source.droppedCount}` : ''}
              {(source.dedupCount ?? 0) > 0 ? ` trùng:${source.dedupCount}` : ''}
            </span>
          ))}
        </div>
      </Card>
      <Card
        label="Tăng mạnh nhất"
        value={topGainer.commodityName}
        sub={`${topGainer.changePct >= 0 ? '+' : ''}${topGainer.changePct.toFixed(2)}% hôm nay`}
        variant={topGainer.changePct >= 0 ? 'up' : 'down'}
      />
      <Card
        label="Cập nhật lúc"
        value={formatTimestamp(lastUpdated)}
        sub={refreshing ? 'Đang làm mới dữ liệu...' : 'Làm mới thủ công'}
        variant="neutral"
      >
        <button className="stat-card__button" onClick={onRefresh} disabled={!onRefresh || refreshing}>
          {refreshing ? 'Đang tải' : 'Làm mới'}
        </button>
      </Card>
    </section>
  );
}
