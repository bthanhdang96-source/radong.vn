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
  const activeSources = sources.filter((source) => source.success);
  const sourceSummary = activeSources.length > 0 ? activeSources.map((source) => SOURCE_LABELS[source.id]).join(' + ') : 'Dang su dung fallback';

  return (
    <section className="summary-grid" aria-label="Tong quan thi truong">
      <Card
        label="Tong mat hang"
        value={loading ? 'Dang tai...' : `${data.length}`}
        sub="dashboard VN gia thuc"
        variant="neutral"
      />
      <Card
        label="Nguon data"
        value={sourceSummary}
        sub={status === 'live' ? 'crawler dang song' : status === 'cached' ? 'su dung cache gan nhat' : 'fallback noi bo'}
        variant={activeSources.length > 0 ? 'accent' : 'down'}
      >
        <div className="stat-card__tags">
          {sources.map((source) => (
            <span key={`${source.label}-${source.fetchedAt}`} className={`stat-card__tag ${source.success ? 'stat-card__tag--ok' : 'stat-card__tag--fail'}`}>
              {source.success ? 'OK' : 'ERR'} {SOURCE_LABELS[source.id]}
            </span>
          ))}
        </div>
      </Card>
      <Card
        label="Tang manh nhat"
        value={topGainer.commodityName}
        sub={`${topGainer.changePct >= 0 ? '+' : ''}${topGainer.changePct.toFixed(2)}% hom nay`}
        variant={topGainer.changePct >= 0 ? 'up' : 'down'}
      />
      <Card
        label="Cap nhat luc"
        value={formatTimestamp(lastUpdated)}
        sub={refreshing ? 'dang lam moi du lieu...' : 'refresh API /api/vn-prices/refresh'}
        variant="neutral"
      >
        <button className="stat-card__button" onClick={onRefresh} disabled={!onRefresh || refreshing}>
          {refreshing ? 'Dang refresh' : 'Refresh'}
        </button>
      </Card>
    </section>
  );
}
