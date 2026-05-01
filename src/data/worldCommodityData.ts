// ─── Shared Types (used by both frontend and backend) ────
export type WorldCategory =
  | 'Tất cả'
  | 'Cà phê & Ca cao'
  | 'Lúa gạo & Ngũ cốc'
  | 'Gia vị & Cây CN'
  | 'Dầu thực vật'
  | 'Thủy sản'
  | 'Khác';

export interface WorldCommodityItem {
  id: string;
  name: string;          // Vietnamese name
  nameEn: string;        // English name
  symbol: string;        // Trading symbol
  category: WorldCategory;
  exchange: string;      // Exchange name (CBOT, ICE, etc.)
  unit: string;          // Price unit (USD/kg, USD/tấn, etc.)
  priceCurrent: number;
  priceYesterday: number;
  priceLastWeek: number;
  priceLastMonth: number;
  change: number;        // Absolute change
  changePct: number;     // Percentage change
  low52w: number;
  high52w: number;
  priceVndKg?: number | null;
  currency: 'USD';
  lastUpdate: string;    // ISO date string
}

export interface WorldPricesResponse {
  success: boolean;
  status?: 'live' | 'fallback';
  sourceMode?: 'supabase_curated' | 'legacy';
  count: number;
  exchangeRate: number;
  categories: WorldCategory[];
  lastUpdated?: string;
  data: WorldCommodityItem[];
}

// ─── Constants ──────────────────────────────────────────
export const WORLD_CATEGORIES: WorldCategory[] = [
  'Tất cả',
  'Cà phê & Ca cao',
  'Lúa gạo & Ngũ cốc',
  'Gia vị & Cây CN',
  'Dầu thực vật',
  'Thủy sản',
  'Khác',
];

export const DEFAULT_USD_VND_RATE = 25_850;

// SVG icons for categories (clean inline SVGs instead of emojis)
export const CATEGORY_SVGS: Record<WorldCategory, string> = {
  'Tất cả': 'M4 6h16M4 12h16M4 18h16',
  'Cà phê & Ca cao': 'M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3',
  'Lúa gạo & Ngũ cốc': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'Gia vị & Cây CN': 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.3',
  'Dầu thực vật': 'M12 22c5.523 0 10-4.477 10-10 0-3.863-2.4-7.2-5.8-8.6L12 2l-4.2 1.4C4.4 4.8 2 8.137 2 12c0 5.523 4.477 10 10 10z',
  'Thủy sản': 'M20.38 3.46L16 2 12 4 8 2 3.62 3.46a2 2 0 01-.69 1.34l-.1.1L2 12l.83 7.2a2 2 0 001.34 1.69l.1.03L8 22l4-2 4 2 3.73-1.08',
  'Khác': 'M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83',
};

// ─── Static Fallback Data ───────────────────────────────
// Used when the API server is unavailable (frontend-only mode)
export const FALLBACK_WORLD_DATA: WorldCommodityItem[] = [
  // Coffee & Cocoa
  { id: 'coffee-robusta', name: 'Cà phê Robusta', nameEn: 'Robusta Coffee', symbol: 'RC', category: 'Cà phê & Ca cao', exchange: 'ICE London', unit: 'USD/kg', priceCurrent: 4.82, priceYesterday: 4.75, priceLastWeek: 4.68, priceLastMonth: 4.42, change: 0.07, changePct: 1.47, low52w: 2.95, high52w: 5.15, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'coffee-arabica', name: 'Cà phê Arabica', nameEn: 'Arabica Coffee', symbol: 'KC', category: 'Cà phê & Ca cao', exchange: 'ICE US', unit: 'USD/kg', priceCurrent: 7.85, priceYesterday: 7.72, priceLastWeek: 7.55, priceLastMonth: 7.12, change: 0.13, changePct: 1.68, low52w: 4.80, high52w: 8.42, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'cocoa', name: 'Ca cao', nameEn: 'Cocoa', symbol: 'CC', category: 'Cà phê & Ca cao', exchange: 'ICE US', unit: 'USD/kg', priceCurrent: 9.45, priceYesterday: 9.62, priceLastWeek: 9.28, priceLastMonth: 8.85, change: -0.17, changePct: -1.77, low52w: 3.20, high52w: 11.80, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },

  // Rice & Grains
  { id: 'rice-5pct', name: 'Gạo 5% tấm', nameEn: 'Rice 5% broken', symbol: 'RICE5', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', priceCurrent: 518, priceYesterday: 515, priceLastWeek: 512, priceLastMonth: 525, change: 3, changePct: 0.58, low52w: 450, high52w: 650, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'rice-25pct', name: 'Gạo 25% tấm', nameEn: 'Rice 25% broken', symbol: 'RICE25', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', priceCurrent: 485, priceYesterday: 482, priceLastWeek: 478, priceLastMonth: 498, change: 3, changePct: 0.62, low52w: 415, high52w: 605, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'rice-thai', name: 'Gạo Thái A1 Super', nameEn: 'Thai Rice A1 Super', symbol: 'RICETH', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', priceCurrent: 532, priceYesterday: 528, priceLastWeek: 525, priceLastMonth: 540, change: 4, changePct: 0.76, low52w: 460, high52w: 675, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'wheat', name: 'Lúa mì', nameEn: 'Wheat (US HRW)', symbol: 'ZW', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', priceCurrent: 248, priceYesterday: 252, priceLastWeek: 245, priceLastMonth: 238, change: -4, changePct: -1.59, low52w: 195, high52w: 310, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'corn', name: 'Ngô', nameEn: 'Corn (Maize)', symbol: 'ZC', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', priceCurrent: 198, priceYesterday: 196, priceLastWeek: 192, priceLastMonth: 185, change: 2, changePct: 1.02, low52w: 165, high52w: 235, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'soybeans', name: 'Đậu tương', nameEn: 'Soybeans', symbol: 'ZS', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', priceCurrent: 425, priceYesterday: 420, priceLastWeek: 418, priceLastMonth: 405, change: 5, changePct: 1.19, low52w: 370, high52w: 485, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'cassava', name: 'Sắn lát', nameEn: 'Cassava (Tapioca)', symbol: 'CASS', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', priceCurrent: 285, priceYesterday: 282, priceLastWeek: 278, priceLastMonth: 268, change: 3, changePct: 1.06, low52w: 220, high52w: 330, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },

  // Spices & Industrial Crops
  { id: 'pepper-black', name: 'Tiêu đen', nameEn: 'Black Pepper', symbol: 'PBLK', category: 'Gia vị & Cây CN', exchange: 'KPGM', unit: 'USD/kg', priceCurrent: 6.25, priceYesterday: 6.18, priceLastWeek: 6.05, priceLastMonth: 5.72, change: 0.07, changePct: 1.13, low52w: 3.85, high52w: 6.90, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'cashew', name: 'Hạt điều', nameEn: 'Cashew Nuts', symbol: 'CASHW', category: 'Gia vị & Cây CN', exchange: 'India', unit: 'USD/kg', priceCurrent: 8.95, priceYesterday: 9.02, priceLastWeek: 8.80, priceLastMonth: 8.45, change: -0.07, changePct: -0.78, low52w: 6.20, high52w: 9.50, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'rubber-rss3', name: 'Cao su RSS3', nameEn: 'Rubber RSS3', symbol: 'RSS3', category: 'Gia vị & Cây CN', exchange: 'SGX', unit: 'USD/kg', priceCurrent: 2.15, priceYesterday: 2.12, priceLastWeek: 2.08, priceLastMonth: 1.98, change: 0.03, changePct: 1.42, low52w: 1.45, high52w: 2.42, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'rubber-tsr20', name: 'Cao su TSR20', nameEn: 'Rubber TSR20', symbol: 'TSR20', category: 'Gia vị & Cây CN', exchange: 'SGX', unit: 'USD/kg', priceCurrent: 1.92, priceYesterday: 1.90, priceLastWeek: 1.85, priceLastMonth: 1.78, change: 0.02, changePct: 1.05, low52w: 1.32, high52w: 2.18, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'sugar', name: 'Đường thô', nameEn: 'Sugar (Raw)', symbol: 'SB', category: 'Gia vị & Cây CN', exchange: 'ICE US', unit: 'USD/kg', priceCurrent: 0.48, priceYesterday: 0.47, priceLastWeek: 0.46, priceLastMonth: 0.44, change: 0.01, changePct: 2.13, low52w: 0.38, high52w: 0.55, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'cotton', name: 'Bông vải', nameEn: 'Cotton (A Index)', symbol: 'CT', category: 'Gia vị & Cây CN', exchange: 'ICE US', unit: 'USD/kg', priceCurrent: 1.95, priceYesterday: 1.92, priceLastWeek: 1.88, priceLastMonth: 1.82, change: 0.03, changePct: 1.56, low52w: 1.60, high52w: 2.20, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'tea-avg', name: 'Chè', nameEn: 'Tea (Average)', symbol: 'TEA', category: 'Gia vị & Cây CN', exchange: 'Mombasa', unit: 'USD/kg', priceCurrent: 3.28, priceYesterday: 3.25, priceLastWeek: 3.20, priceLastMonth: 3.05, change: 0.03, changePct: 0.92, low52w: 2.40, high52w: 3.65, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },

  // Vegetable Oils
  { id: 'palm-oil', name: 'Dầu cọ', nameEn: 'Palm Oil', symbol: 'FCPO', category: 'Dầu thực vật', exchange: 'MDEX', unit: 'USD/tấn', priceCurrent: 892, priceYesterday: 885, priceLastWeek: 875, priceLastMonth: 845, change: 7, changePct: 0.79, low52w: 720, high52w: 1050, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'soybean-oil', name: 'Dầu đậu nành', nameEn: 'Soybean Oil', symbol: 'ZL', category: 'Dầu thực vật', exchange: 'CBOT', unit: 'USD/tấn', priceCurrent: 1085, priceYesterday: 1078, priceLastWeek: 1062, priceLastMonth: 1025, change: 7, changePct: 0.65, low52w: 880, high52w: 1250, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'coconut-oil', name: 'Dầu dừa', nameEn: 'Coconut Oil', symbol: 'CNO', category: 'Dầu thực vật', exchange: 'Philippines', unit: 'USD/tấn', priceCurrent: 1320, priceYesterday: 1305, priceLastWeek: 1280, priceLastMonth: 1210, change: 15, changePct: 1.15, low52w: 960, high52w: 1480, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'sunflower-oil', name: 'Dầu hướng dương', nameEn: 'Sunflower Oil', symbol: 'SFO', category: 'Dầu thực vật', exchange: 'EU', unit: 'USD/tấn', priceCurrent: 1045, priceYesterday: 1052, priceLastWeek: 1035, priceLastMonth: 995, change: -7, changePct: -0.67, low52w: 820, high52w: 1200, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'groundnut-oil', name: 'Dầu lạc', nameEn: 'Groundnut Oil', symbol: 'GNO', category: 'Dầu thực vật', exchange: 'EU', unit: 'USD/tấn', priceCurrent: 1580, priceYesterday: 1568, priceLastWeek: 1545, priceLastMonth: 1490, change: 12, changePct: 0.77, low52w: 1250, high52w: 1720, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },

  // Seafood
  { id: 'shrimp', name: 'Tôm (giá TB)', nameEn: 'Shrimp (Avg)', symbol: 'SHRMP', category: 'Thủy sản', exchange: 'Global', unit: 'USD/kg', priceCurrent: 12.50, priceYesterday: 12.35, priceLastWeek: 12.20, priceLastMonth: 11.80, change: 0.15, changePct: 1.21, low52w: 9.50, high52w: 14.20, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'pangasius', name: 'Cá tra fillet', nameEn: 'Pangasius Fillet', symbol: 'PANGA', category: 'Thủy sản', exchange: 'VN Export', unit: 'USD/kg', priceCurrent: 2.85, priceYesterday: 2.82, priceLastWeek: 2.78, priceLastMonth: 2.65, change: 0.03, changePct: 1.06, low52w: 2.20, high52w: 3.15, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'tuna', name: 'Cá ngừ', nameEn: 'Tuna (Skipjack)', symbol: 'TUNA', category: 'Thủy sản', exchange: 'Bangkok', unit: 'USD/tấn', priceCurrent: 1650, priceYesterday: 1640, priceLastWeek: 1620, priceLastMonth: 1580, change: 10, changePct: 0.61, low52w: 1350, high52w: 1850, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },

  // Others
  { id: 'orange-juice', name: 'Nước cam cô đặc', nameEn: 'Orange Juice FC', symbol: 'OJ', category: 'Khác', exchange: 'ICE US', unit: 'USD/kg', priceCurrent: 5.42, priceYesterday: 5.38, priceLastWeek: 5.25, priceLastMonth: 4.95, change: 0.04, changePct: 0.74, low52w: 3.80, high52w: 6.10, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'urea', name: 'Phân bón Urê', nameEn: 'Urea', symbol: 'UREA', category: 'Khác', exchange: 'Global', unit: 'USD/tấn', priceCurrent: 312, priceYesterday: 315, priceLastWeek: 308, priceLastMonth: 295, change: -3, changePct: -0.95, low52w: 245, high52w: 385, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'dap', name: 'Phân DAP', nameEn: 'DAP Fertilizer', symbol: 'DAP', category: 'Khác', exchange: 'Global', unit: 'USD/tấn', priceCurrent: 565, priceYesterday: 558, priceLastWeek: 548, priceLastMonth: 525, change: 7, changePct: 1.25, low52w: 450, high52w: 640, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
  { id: 'lumber', name: 'Gỗ xẻ', nameEn: 'Sawnwood (Soft)', symbol: 'LBS', category: 'Khác', exchange: 'CME', unit: 'USD/m\u00B3', priceCurrent: 385, priceYesterday: 382, priceLastWeek: 378, priceLastMonth: 365, change: 3, changePct: 0.79, low52w: 310, high52w: 445, currency: 'USD', lastUpdate: '2026-04-01T00:00:00Z' },
];
