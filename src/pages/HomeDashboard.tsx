import { useEffect, useState } from 'react';
import TickerBar from '../components/TickerBar';
import SummaryCards from '../components/SummaryCards';
import TopMovers from '../components/TopMovers';
import PriceTable from '../components/PriceTable';
import type {
  GeneratedCommodityPricePageListResponse,
  GeneratedCommodityPricePageSummary,
  GeneratedPricePageListResponse,
  GeneratedPricePageSummary,
} from '../data/generatedPricePageTypes';
import { FALLBACK_VN_PRICES, type VnPricesResponse } from '../data/vnPriceTypes';
import { buildApiUrl } from '../lib/api';
import './HomeDashboard.css';

export default function HomeDashboard() {
  const [payload, setPayload] = useState<VnPricesResponse>(FALLBACK_VN_PRICES);
  const [pricePages, setPricePages] = useState<GeneratedPricePageSummary[]>([]);
  const [commodityPages, setCommodityPages] = useState<GeneratedCommodityPricePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  function scrollToSelector(selector: string) {
    const target = document.querySelector(selector);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const [priceResponse, pageResponse, commodityPageResponse] = await Promise.all([
          fetch(buildApiUrl('/api/vn-prices')),
          fetch(buildApiUrl('/api/price-pages?limit=400')),
          fetch(buildApiUrl('/api/commodity-price-pages?limit=400')),
        ]);
        const json = await priceResponse.json();
        const pageJson: GeneratedPricePageListResponse = await pageResponse.json();
        const commodityPageJson: GeneratedCommodityPricePageListResponse = await commodityPageResponse.json();
        if (!priceResponse.ok || !json.success) {
          throw new Error(json.error ?? 'Failed to fetch VN prices');
        }

        if (active) {
          setPayload({
            status: json.status,
            fetchedAt: json.fetchedAt,
            lastUpdated: json.lastUpdated,
            data: json.data,
            sources: json.sources,
            errors: json.errors ?? [],
          });
          setPricePages(pageResponse.ok && pageJson.success ? pageJson.items : []);
          setCommodityPages(commodityPageResponse.ok && commodityPageJson.success ? commodityPageJson.items : []);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setPayload(FALLBACK_VN_PRICES);
          setPricePages([]);
          setCommodityPages([]);
          setError(err instanceof Error ? err.message : 'Failed to fetch VN prices');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [refreshNonce]);

  return (
    <div className="home-dashboard">
      <TickerBar items={payload.data} />
      <SummaryCards
        data={payload.data}
        sources={payload.sources}
        lastUpdated={payload.lastUpdated}
        status={payload.status}
        loading={loading}
      />
      <TopMovers items={payload.data} />
      <PriceTable
        data={payload.data}
        pricePages={pricePages}
        commodityPages={commodityPages}
        loading={loading}
        error={error ?? payload.errors[0] ?? null}
      />
      <div className="home-dashboard__dock" aria-label="Tác vụ nhanh trên điện thoại">
        <button className="home-dashboard__dock-button" type="button" onClick={() => scrollToSelector('.summary-grid')}>
          Tổng quan
        </button>
        <button className="home-dashboard__dock-button" type="button" onClick={() => scrollToSelector('#bang-gia')}>
          Bảng giá
        </button>
        <button
          className="home-dashboard__dock-button home-dashboard__dock-button--primary"
          type="button"
          onClick={() => setRefreshNonce(current => current + 1)}
          disabled={loading}
        >
          {loading ? 'Đang tải' : 'Làm mới'}
        </button>
      </div>
    </div>
  );
}
