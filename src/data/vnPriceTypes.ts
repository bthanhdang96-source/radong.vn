export type SourceId =
  | 'nongnghiep'
  | 'vietnambiz'
  | 'congthuong'
  | 'vpsaspice'
  | 'banggianongsan'
  | 'vietfood'
  | 'giaca_nsvl'
  | 'shopee'
  | 'customs'
  | 'fallback';

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
  recommendation: 'Mua' | 'Bán' | 'Giữ';
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
  'Luong thuc': 'Lương thực',
  'Cay cong nghiep': 'Cây công nghiệp',
  'Chan nuoi': 'Chăn nuôi',
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  nongnghiep: 'nongnghiepmoitruong.vn',
  vietnambiz: 'vietnambiz.vn',
  congthuong: 'congthuong.vn',
  vpsaspice: 'vpsa.org.vn',
  banggianongsan: 'banggianongsan.com',
  vietfood: 'vietfood.org.vn',
  giaca_nsvl: 'giacansvl.vn',
  shopee: 'Shopee',
  customs: 'customs.gov.vn',
  fallback: 'Fallback',
};



export const FALLBACK_VN_PRICES: VnPricesResponse = {
  status: 'fallback',
  fetchedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  errors: ['Đang hiển thị dữ liệu dự phòng vì API chưa sẵn sàng.'],
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
      commodityName: 'Hồ tiêu',
      category: 'Cây công nghiệp',
      unit: 'VND/kg',
      priceHigh: 142000,
      priceLow: 138000,
      priceAvg: 140200,
      change: 0,
      changePct: 0,
      low52w: 138000,
      high52w: 142000,
      recommendation: 'Giữ',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'Đắk Lắk', price: 142000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Đắk Nông', price: 141000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Gia Lai', price: 138000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Bà Rịa - Vũng Tàu', price: 140000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Bình Phước', price: 140000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
    {
      commodity: 'ca-phe-robusta',
      commodityName: 'Cà phê Robusta',
      category: 'Cây công nghiệp',
      unit: 'VND/kg',
      priceHigh: 87000,
      priceLow: 86500,
      priceAvg: 86875,
      change: -1000,
      changePct: -1.14,
      low52w: 86500,
      high52w: 87000,
      recommendation: 'Bán',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'Đắk Lắk', price: 87000, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Đắk Nông', price: 87000, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Gia Lai', price: 87000, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Lâm Đồng', price: 86500, change: -1000, changePct: -1.14, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
    {
      commodity: 'heo-hoi',
      commodityName: 'Heo hơi',
      category: 'Chăn nuôi',
      unit: 'VND/kg',
      priceHigh: 68500,
      priceLow: 65000,
      priceAvg: 66833,
      change: 0,
      changePct: 0,
      low52w: 65000,
      high52w: 68500,
      recommendation: 'Giữ',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'Miền Bắc', price: 65000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Miền Trung - Tây Nguyên', price: 67000, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Miền Nam', price: 68500, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
    {
      commodity: 'gao-noi-dia',
      commodityName: 'Lúa gạo ĐBSCL',
      category: 'Lương thực',
      unit: 'VND/kg',
      priceHigh: 9300,
      priceLow: 7550,
      priceAvg: 8575,
      change: 14.29,
      changePct: 0.17,
      low52w: 7550,
      high52w: 9300,
      recommendation: 'Giữ',
      lastUpdated: new Date().toISOString(),
      sources: ['fallback'],
      regions: [
        { region: 'IR 504', price: 8425, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'OM 18', price: 8775, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'CL 555', price: 8700, change: 100, changePct: 1.16, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'OM 5451', price: 8700, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'Đài Thơm 8', price: 9300, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
        { region: 'OM 380', price: 7550, change: 0, changePct: 0, source: 'fallback', hasConflict: false, conflictPct: null },
      ],
    },
  ],
};
