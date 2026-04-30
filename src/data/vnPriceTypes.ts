export type SourceId = 'nongnghiep' | 'vietnambiz' | 'congthuong' | 'fallback';

export interface PriceSourceStatus {
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
  sources: PriceSourceStatus[];
  errors: string[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  'Luong thuc': 'Luong thuc',
  'Cay cong nghiep': 'Cay cong nghiep',
  'Chan nuoi': 'Chan nuoi',
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  nongnghiep: 'nongnghiepmoitruong.vn',
  vietnambiz: 'vietnambiz.vn',
  congthuong: 'congthuong.vn',
  fallback: 'Fallback',
};

export const COMMODITY_META: Record<string, { short: string; nameEn: string }> = {
  'ca-phe-robusta': { short: 'CF', nameEn: 'Robusta Coffee' },
  'ho-tieu': { short: 'HT', nameEn: 'Black Pepper' },
  'heo-hoi': { short: 'HH', nameEn: 'Live Pig' },
  'gao-noi-dia': { short: 'GA', nameEn: 'Domestic Rice' },
};

export const FALLBACK_VN_PRICES: VnPricesResponse = {
  status: 'fallback',
  fetchedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  errors: ['Dang hien fallback data vi API chua san sang.'],
  sources: [
    {
      id: 'fallback',
      label: 'Fallback static data',
      url: 'local://fallback',
      fetchedAt: new Date().toISOString(),
      success: true,
      itemCount: 18,
      priority: 0,
      coverage: ['ca-phe-robusta', 'ho-tieu', 'heo-hoi', 'gao-noi-dia'],
    },
  ],
  data: [
    {
      commodity: 'ho-tieu',
      commodityName: 'Ho tieu',
      category: 'Cay cong nghiep',
      unit: 'VND/kg',
      priceHigh: 142000,
      priceLow: 138000,
      priceAvg: 140200,
      change: 0,
      changePct: 0,
      low52w: 138000,
      high52w: 142000,
      recommendation: 'Giu',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'Dak Lak', price: 142000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Dak Nong', price: 141000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Gia Lai', price: 138000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Ba Ria - Vung Tau', price: 140000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Binh Phuoc', price: 140000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
    {
      commodity: 'ca-phe-robusta',
      commodityName: 'Ca phe Robusta',
      category: 'Cay cong nghiep',
      unit: 'VND/kg',
      priceHigh: 87000,
      priceLow: 86500,
      priceAvg: 86875,
      change: -1000,
      changePct: -1.14,
      low52w: 86500,
      high52w: 87000,
      recommendation: 'Ban',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'Dak Lak', price: 87000, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Dak Nong', price: 87000, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Gia Lai', price: 87000, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Lam Dong', price: 86500, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
    {
      commodity: 'heo-hoi',
      commodityName: 'Heo hoi',
      category: 'Chan nuoi',
      unit: 'VND/kg',
      priceHigh: 68500,
      priceLow: 65000,
      priceAvg: 66833,
      change: 0,
      changePct: 0,
      low52w: 65000,
      high52w: 68500,
      recommendation: 'Giu',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'Mien Bac', price: 65000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Mien Trung - Tay Nguyen', price: 67000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Mien Nam', price: 68500, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
    {
      commodity: 'gao-noi-dia',
      commodityName: 'Lua gao DBSCL',
      category: 'Luong thuc',
      unit: 'VND/kg',
      priceHigh: 9300,
      priceLow: 7550,
      priceAvg: 8575,
      change: 14.29,
      changePct: 0.17,
      low52w: 7550,
      high52w: 9300,
      recommendation: 'Giu',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'IR 504', price: 8425, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'OM 18', price: 8775, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'CL 555', price: 8700, change: 100, changePct: 1.16, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'OM 5451', price: 8700, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Dai Thom 8', price: 9300, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'OM 380', price: 7550, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
  ],
};
