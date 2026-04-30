import { useEffect, useState } from 'react';
import TickerBar from '../components/TickerBar';
import SummaryCards from '../components/SummaryCards';
import TopMovers from '../components/TopMovers';
import PriceTable from '../components/PriceTable';
import { FALLBACK_VN_PRICES, type VnPricesResponse } from '../data/vnPriceTypes';

export default function HomeDashboard() {
  const [payload, setPayload] = useState<VnPricesResponse>(FALLBACK_VN_PRICES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/vn-prices');
        const json = await response.json();
        if (!response.ok || !json.success) {
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
          setError(null);
        }
      } catch (err) {
        if (active) {
          setPayload(FALLBACK_VN_PRICES);
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
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/vn-prices/refresh');
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Refresh failed');
      }

      setPayload({
        status: json.status,
        fetchedAt: json.fetchedAt,
        lastUpdated: json.lastUpdated,
        data: json.data,
        sources: json.sources,
        errors: json.errors ?? [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <TickerBar items={payload.data} />
      <SummaryCards
        data={payload.data}
        sources={payload.sources}
        lastUpdated={payload.lastUpdated}
        status={payload.status}
        loading={loading}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
      <TopMovers items={payload.data} />
      <PriceTable data={payload.data} loading={loading} error={error ?? payload.errors[0] ?? null} />
    </>
  );
}
