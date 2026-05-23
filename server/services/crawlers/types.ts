export type SourceId =
  | 'nongnghiep'
  | 'vietnambiz'
  | 'congthuong'
  | 'chogia'
  | 'daklak_sct'
  | 'dongnai_sct_daugiay'
  | 'banggianongsan'
  | 'giahotieu'
  | 'kimhungmarket'
  | 'vietfood'
  | 'giaca_nsvl'
  | 'bhx'
  | 'coop'
  | 'customs'
  | 'agroinfo_fruit_report'
  | 'fallback';

export interface SourceSnapshot {
  id: SourceId;
  label: string;
  url: string;
  fetchedAt: string;
  success: boolean;
  itemCount: number;
  priority: number;
  coverage: string[];
  latestArticleUrl?: string;
  error?: string;
  droppedCount?: number;
  dedupCount?: number;
  validationErrors?: string[];
  metadata?: Record<string, unknown>;
}

export interface CrawledPriceItem {
  commodity: string;
  commodityName: string;
  category: string;
  region: string;
  price: number;
  unit: string;
  unitRaw?: string | null;
  normalizedUnitKey?: 'kg' | 'trai' | 'chuc' | 'ton' | null;
  unitQuantity?: number | null;
  change: number | null;
  changePct: number | null;
  timestamp: string;
  source: SourceId;
  priceType?: 'farm_gate' | 'wholesale' | 'retail' | 'export';
  variety?: string | null;
  qualityGrade?: string | null;
  marketName?: string | null;
  articleTitle?: string | null;
  countryCode?: string | null;
  exchangeRate?: number | null;
  priceUsd?: number | null;
  dataGranularity?: 'point_in_time' | 'daily' | 'period' | 'monthly' | 'unknown';
  temporalCoverage?: 'observation_time' | 'calendar_day' | 'report_period' | 'calendar_month' | 'unknown';
  periodType?: string | null;
  periodCode?: string | null;
  periodLabel?: string | null;
  periodYear?: number | null;
  periodMonth?: number | null;
  periodNumber?: number | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  aggregationMethod?: string | null;
  geographicScope?: 'market_or_region' | 'province' | 'national' | 'world' | 'unknown';
  sourceDetail?: string | null;
  dedupeKey?: string | null;
  extra?: Record<string, unknown>;
  previousPrice?: number | null;
}

export interface CrawledDayData {
  date: string;
  items: CrawledPriceItem[];
  sources: SourceSnapshot[];
}

export interface RegionPrice {
  region: string;
  price: number;
  change: number | null;
  changePct: number | null;
  source: SourceId;
  hasConflict: boolean;
  conflictPct: number | null;
}

export type TrendDirection = 'Tăng' | 'Giảm' | 'Trung tính';

export interface CommoditySparkPoint {
  date: string;
  priceAvg: number;
}

export interface CommoditySummary {
  commodity: string;
  commodityName: string;
  category: string;
  unit: string;
  priceHigh: number;
  priceLow: number;
  priceAvg: number;
  change: number;
  changePct: number;
  low52w: number;
  high52w: number;
  regions: RegionPrice[];
  sources: SourceId[];
  recommendation: 'Mua' | 'Bán' | 'Giữ';
  trend7dPct: number | null;
  trendDirection: TrendDirection;
  sparkline30d: CommoditySparkPoint[];
  lastUpdated: string;
}

export interface VnPricesResponse {
  status: 'live' | 'cached' | 'fallback';
  fetchedAt: string;
  lastUpdated: string;
  data: CommoditySummary[];
  sources: SourceSnapshot[];
  errors: string[];
}

export interface CrawlerResult {
  items: CrawledPriceItem[];
  sources: SourceSnapshot[];
}
