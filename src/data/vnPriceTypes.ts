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
  sources: PriceSourceStatus[];
  errors: string[];
}

export interface PriceChainRetailRegion {
  provinceCode: string;
  region: string;
  avgPrice: number;
  vsNationalAvgPct: number | null;
  dataPoints: number;
}

export interface PriceChainItem {
  commodity: string;
  commodityName: string;
  category: string;
  unit: string;
  farmGateVnd: number | null;
  wholesaleVnd: number | null;
  retailVnd: number | null;
  exportVnd: number | null;
  exportUsd: number | null;
  worldUsdKg: number | null;
  worldExchange: string | null;
  retailVsFarmgatePct: number | null;
  exportVsFarmgatePct: number | null;
  trend7dPct: number | null;
  updatedAt: string;
  retailRegions: PriceChainRetailRegion[];
}

export interface VnPriceChainResponse {
  success: boolean;
  status: 'live' | 'fallback';
  lastUpdated: string;
  sources: PriceSourceStatus[];
  errors: string[];
  data: PriceChainItem[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  'Lương thực': 'Lương thực',
  'Cây công nghiệp': 'Cây công nghiệp',
  'Chăn nuôi': 'Chăn nuôi',
  'Thủy sản': 'Thủy sản',
  'Trái cây': 'Trái cây',
  'Rau củ': 'Rau củ',
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  nongnghiep: 'nongnghiepmoitruong.vn',
  vietnambiz: 'vietnambiz.vn',
  congthuong: 'congthuong.vn',
  chogia: 'chogia.vn',
  daklak_sct: 'socongthuong.daklak.gov.vn',
  dongnai_sct_daugiay: 'sct.dongnai.gov.vn',
  banggianongsan: 'banggianongsan.com',
  giahotieu: 'giahotieu.com',
  kimhungmarket: 'kimhungmarket.com',
  vietfood: 'vietfood.org.vn',
  giaca_nsvl: 'giacansvl.vn',
  bhx: 'Bách Hóa Xanh',
  coop: 'Co.op Online',
  customs: 'customs.gov.vn',
  agroinfo_fruit_report: 'thitruongnongsan.gov.vn',
  fallback: 'Dự phòng',
};

function buildFallbackSparkline(values: number[]): CommoditySparkPoint[] {
  const today = new Date();

  return values.map((priceAvg, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (values.length - 1 - index));

    return {
      date: date.toISOString().slice(0, 10),
      priceAvg,
    };
  });
}

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
      trend7dPct: 1.24,
      trendDirection: 'Tăng',
      sparkline30d: buildFallbackSparkline([138400, 138900, 139500, 140100, 140200, 141100, 140200]),
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
      trend7dPct: -1.14,
      trendDirection: 'Giảm',
      sparkline30d: buildFallbackSparkline([88200, 87950, 87700, 87580, 87320, 87040, 86875]),
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
      trend7dPct: 0.46,
      trendDirection: 'Trung tính',
      sparkline30d: buildFallbackSparkline([66400, 66550, 66620, 66780, 66810, 66860, 66833]),
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
      trend7dPct: 0.82,
      trendDirection: 'Trung tính',
      sparkline30d: buildFallbackSparkline([8340, 8385, 8425, 8480, 8510, 8550, 8575]),
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
