export type SourceId = 'nongnghiep' | 'vietnambiz' | 'congthuong' | 'fallback';

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
}

export interface CrawledPriceItem {
  commodity: string;
  commodityName: string;
  category: string;
  region: string;
  price: number;
  unit: string;
  change: number | null;
  changePct: number | null;
  timestamp: string;
  source: SourceId;
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
  recommendation: 'Mua' | 'Ban' | 'Giu';
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
