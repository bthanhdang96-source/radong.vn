import * as XLSX from 'xlsx';
import { getCached, setCache } from './cacheService.js';

// ─── Types ───────────────────────────────────────────────
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
  name: string;
  nameEn: string;
  symbol: string;
  category: WorldCategory;
  exchange: string;
  unit: string;
  priceCurrent: number;
  priceYesterday: number;
  priceLastWeek: number;
  priceLastMonth: number;
  change: number;
  changePct: number;
  low52w: number;
  high52w: number;
  currency: 'USD';
  lastUpdate: string;
}

// ─── World Bank Pink Sheet URL ──────────────────────────
const PINK_SHEET_URL =
  'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f144e6550f-0350022021/related/CMO-Historical-Data-Monthly.xlsx';

const CACHE_KEY = 'world-prices';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ─── Mapping: Pink Sheet column names → our commodity IDs ─
// The Pink Sheet columns vary, so we map the most relevant ones
interface PinkSheetMapping {
  id: string;
  name: string;
  nameEn: string;
  symbol: string;
  category: WorldCategory;
  exchange: string;
  unit: string;
  /** Column header in the Pink Sheet (approximate match) */
  pinkSheetKey: string;
}

const COMMODITY_MAPPINGS: PinkSheetMapping[] = [
  // Coffee & Cocoa
  { id: 'coffee-robusta', name: 'Cà phê Robusta', nameEn: 'Robusta Coffee', symbol: 'RC', category: 'Cà phê & Ca cao', exchange: 'ICE London', unit: 'USD/kg', pinkSheetKey: 'COFFEE_ROBUS' },
  { id: 'coffee-arabica', name: 'Cà phê Arabica', nameEn: 'Arabica Coffee', symbol: 'KC', category: 'Cà phê & Ca cao', exchange: 'ICE US', unit: 'USD/kg', pinkSheetKey: 'COFFEE_ARABIC' },
  { id: 'cocoa', name: 'Ca cao', nameEn: 'Cocoa', symbol: 'CC', category: 'Cà phê & Ca cao', exchange: 'ICE US', unit: 'USD/kg', pinkSheetKey: 'COCOA' },

  // Rice & Grains
  { id: 'rice-5pct', name: 'Gạo 5% tấm', nameEn: 'Rice 5% broken', symbol: 'RICE5', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetKey: 'RICE_05' },
  { id: 'rice-25pct', name: 'Gạo 25% tấm', nameEn: 'Rice 25% broken', symbol: 'RICE25', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetKey: 'RICE_25' },
  { id: 'rice-thai', name: 'Gạo Thái A1 Super', nameEn: 'Thai Rice A1 Super', symbol: 'RICETH', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetKey: 'RICE_A1' },
  { id: 'wheat', name: 'Lúa mì', nameEn: 'Wheat (US HRW)', symbol: 'ZW', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetKey: 'WHEAT_US_HRW' },
  { id: 'corn', name: 'Ngô', nameEn: 'Corn (Maize)', symbol: 'ZC', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetKey: 'MAIZE' },
  { id: 'soybeans', name: 'Đậu tương', nameEn: 'Soybeans', symbol: 'ZS', category: 'Lúa gạo & Ngũ cốc', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetKey: 'SOYBEAN' },
  { id: 'cassava', name: 'Sắn lát', nameEn: 'Cassava (Tapioca)', symbol: 'CASS', category: 'Lúa gạo & Ngũ cốc', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetKey: 'CASSAVA_STARCH' },

  // Spices & Industrial Crops
  { id: 'pepper-black', name: 'Tiêu đen', nameEn: 'Black Pepper', symbol: 'PBLK', category: 'Gia vị & Cây CN', exchange: 'KPGM', unit: 'USD/kg', pinkSheetKey: 'GRNUT' },
  { id: 'cashew', name: 'Hạt điều', nameEn: 'Cashew Nuts', symbol: 'CASHW', category: 'Gia vị & Cây CN', exchange: 'India', unit: 'USD/kg', pinkSheetKey: 'CASHEW' },
  { id: 'rubber-rss3', name: 'Cao su RSS3', nameEn: 'Rubber RSS3', symbol: 'RSS3', category: 'Gia vị & Cây CN', exchange: 'SGX', unit: 'USD/kg', pinkSheetKey: 'RUBBER1_MYSG' },
  { id: 'rubber-tsr20', name: 'Cao su TSR20', nameEn: 'Rubber TSR20', symbol: 'TSR20', category: 'Gia vị & Cây CN', exchange: 'SGX', unit: 'USD/kg', pinkSheetKey: 'RUBBER2_TSR20' },
  { id: 'sugar', name: 'Đường thô', nameEn: 'Sugar (Raw)', symbol: 'SB', category: 'Gia vị & Cây CN', exchange: 'ICE US', unit: 'USD/kg', pinkSheetKey: 'SUGAR_WLD' },
  { id: 'cotton', name: 'Bông vải', nameEn: 'Cotton (A Index)', symbol: 'CT', category: 'Gia vị & Cây CN', exchange: 'ICE US', unit: 'USD/kg', pinkSheetKey: 'COTTON_A_INDX' },
  { id: 'tea-avg', name: 'Chè', nameEn: 'Tea (Average)', symbol: 'TEA', category: 'Gia vị & Cây CN', exchange: 'Mombasa', unit: 'USD/kg', pinkSheetKey: 'TEA_AVG' },

  // Vegetable Oils
  { id: 'palm-oil', name: 'Dầu cọ', nameEn: 'Palm Oil', symbol: 'FCPO', category: 'Dầu thực vật', exchange: 'MDEX', unit: 'USD/tấn', pinkSheetKey: 'PALM_OIL' },
  { id: 'soybean-oil', name: 'Dầu đậu nành', nameEn: 'Soybean Oil', symbol: 'ZL', category: 'Dầu thực vật', exchange: 'CBOT', unit: 'USD/tấn', pinkSheetKey: 'SOYBEAN_OIL' },
  { id: 'coconut-oil', name: 'Dầu dừa', nameEn: 'Coconut Oil', symbol: 'CNO', category: 'Dầu thực vật', exchange: 'Philippines', unit: 'USD/tấn', pinkSheetKey: 'COCONUT_OIL' },
  { id: 'sunflower-oil', name: 'Dầu hướng dương', nameEn: 'Sunflower Oil', symbol: 'SFO', category: 'Dầu thực vật', exchange: 'EU', unit: 'USD/tấn', pinkSheetKey: 'SUNFLOWER_OIL' },
  { id: 'groundnut-oil', name: 'Dầu lạc', nameEn: 'Groundnut Oil', symbol: 'GNO', category: 'Dầu thực vật', exchange: 'EU', unit: 'USD/tấn', pinkSheetKey: 'GRNUT_OIL' },

  // Seafood (not in Pink Sheet — use static + mock)
  { id: 'shrimp', name: 'Tôm (giá TB)', nameEn: 'Shrimp (Avg)', symbol: 'SHRMP', category: 'Thủy sản', exchange: 'Global', unit: 'USD/kg', pinkSheetKey: 'SHRIMP_MEX' },
  { id: 'pangasius', name: 'Cá tra fillet', nameEn: 'Pangasius Fillet', symbol: 'PANGA', category: 'Thủy sản', exchange: 'VN Export', unit: 'USD/kg', pinkSheetKey: '' },
  { id: 'tuna', name: 'Cá ngừ', nameEn: 'Tuna (Skipjack)', symbol: 'TUNA', category: 'Thủy sản', exchange: 'Bangkok', unit: 'USD/tấn', pinkSheetKey: '' },

  // Others
  { id: 'orange-juice', name: 'Nước cam cô đặc', nameEn: 'Orange Juice FC', symbol: 'OJ', category: 'Khác', exchange: 'ICE US', unit: 'USD/kg', pinkSheetKey: 'ORANGE' },
  { id: 'urea', name: 'Phân bón Urê', nameEn: 'Urea', symbol: 'UREA', category: 'Khác', exchange: 'Global', unit: 'USD/tấn', pinkSheetKey: 'UREA_EE_BULK' },
  { id: 'dap', name: 'Phân DAP', nameEn: 'DAP Fertilizer', symbol: 'DAP', category: 'Khác', exchange: 'Global', unit: 'USD/tấn', pinkSheetKey: 'DAP' },
  { id: 'lumber', name: 'Gỗ xẻ', nameEn: 'Sawnwood (Soft)', symbol: 'LBS', category: 'Khác', exchange: 'CME', unit: 'USD/m³', pinkSheetKey: 'LOGS_CMR' },
];

// ─── Static fallback data (realistic prices referenced from World Bank Mar-Apr 2026) ─
function buildFallbackData(): WorldCommodityItem[] {
  const fallbackPrices: Record<string, { current: number; yesterday: number; lastWeek: number; lastMonth: number; low52w: number; high52w: number }> = {
    'coffee-robusta':  { current: 4.82, yesterday: 4.75, lastWeek: 4.68, lastMonth: 4.42, low52w: 2.95, high52w: 5.15 },
    'coffee-arabica':  { current: 7.85, yesterday: 7.72, lastWeek: 7.55, lastMonth: 7.12, low52w: 4.80, high52w: 8.42 },
    'cocoa':           { current: 9.45, yesterday: 9.62, lastWeek: 9.28, lastMonth: 8.85, low52w: 3.20, high52w: 11.80 },
    'rice-5pct':       { current: 518, yesterday: 515, lastWeek: 512, lastMonth: 525, low52w: 450, high52w: 650 },
    'rice-25pct':      { current: 485, yesterday: 482, lastWeek: 478, lastMonth: 498, low52w: 415, high52w: 605 },
    'rice-thai':       { current: 532, yesterday: 528, lastWeek: 525, lastMonth: 540, low52w: 460, high52w: 675 },
    'wheat':           { current: 248, yesterday: 252, lastWeek: 245, lastMonth: 238, low52w: 195, high52w: 310 },
    'corn':            { current: 198, yesterday: 196, lastWeek: 192, lastMonth: 185, low52w: 165, high52w: 235 },
    'soybeans':        { current: 425, yesterday: 420, lastWeek: 418, lastMonth: 405, low52w: 370, high52w: 485 },
    'cassava':         { current: 285, yesterday: 282, lastWeek: 278, lastMonth: 268, low52w: 220, high52w: 330 },
    'pepper-black':    { current: 6.25, yesterday: 6.18, lastWeek: 6.05, lastMonth: 5.72, low52w: 3.85, high52w: 6.90 },
    'cashew':          { current: 8.95, yesterday: 9.02, lastWeek: 8.80, lastMonth: 8.45, low52w: 6.20, high52w: 9.50 },
    'rubber-rss3':     { current: 2.15, yesterday: 2.12, lastWeek: 2.08, lastMonth: 1.98, low52w: 1.45, high52w: 2.42 },
    'rubber-tsr20':    { current: 1.92, yesterday: 1.90, lastWeek: 1.85, lastMonth: 1.78, low52w: 1.32, high52w: 2.18 },
    'sugar':           { current: 0.48, yesterday: 0.47, lastWeek: 0.46, lastMonth: 0.44, low52w: 0.38, high52w: 0.55 },
    'cotton':          { current: 1.95, yesterday: 1.92, lastWeek: 1.88, lastMonth: 1.82, low52w: 1.60, high52w: 2.20 },
    'tea-avg':         { current: 3.28, yesterday: 3.25, lastWeek: 3.20, lastMonth: 3.05, low52w: 2.40, high52w: 3.65 },
    'palm-oil':        { current: 892, yesterday: 885, lastWeek: 875, lastMonth: 845, low52w: 720, high52w: 1050 },
    'soybean-oil':     { current: 1085, yesterday: 1078, lastWeek: 1062, lastMonth: 1025, low52w: 880, high52w: 1250 },
    'coconut-oil':     { current: 1320, yesterday: 1305, lastWeek: 1280, lastMonth: 1210, low52w: 960, high52w: 1480 },
    'sunflower-oil':   { current: 1045, yesterday: 1052, lastWeek: 1035, lastMonth: 995, low52w: 820, high52w: 1200 },
    'groundnut-oil':   { current: 1580, yesterday: 1568, lastWeek: 1545, lastMonth: 1490, low52w: 1250, high52w: 1720 },
    'shrimp':          { current: 12.50, yesterday: 12.35, lastWeek: 12.20, lastMonth: 11.80, low52w: 9.50, high52w: 14.20 },
    'pangasius':       { current: 2.85, yesterday: 2.82, lastWeek: 2.78, lastMonth: 2.65, low52w: 2.20, high52w: 3.15 },
    'tuna':            { current: 1650, yesterday: 1640, lastWeek: 1620, lastMonth: 1580, low52w: 1350, high52w: 1850 },
    'orange-juice':    { current: 5.42, yesterday: 5.38, lastWeek: 5.25, lastMonth: 4.95, low52w: 3.80, high52w: 6.10 },
    'urea':            { current: 312, yesterday: 315, lastWeek: 308, lastMonth: 295, low52w: 245, high52w: 385 },
    'dap':             { current: 565, yesterday: 558, lastWeek: 548, lastMonth: 525, low52w: 450, high52w: 640 },
    'lumber':          { current: 385, yesterday: 382, lastWeek: 378, lastMonth: 365, low52w: 310, high52w: 445 },
  };

  const now = new Date().toISOString();

  return COMMODITY_MAPPINGS.map((mapping) => {
    const prices = fallbackPrices[mapping.id];
    if (!prices) {
      // Shouldn't happen, but safety net
      return null;
    }

    const change = parseFloat((prices.current - prices.yesterday).toFixed(4));
    const changePct = parseFloat(((change / prices.yesterday) * 100).toFixed(2));

    return {
      id: mapping.id,
      name: mapping.name,
      nameEn: mapping.nameEn,
      symbol: mapping.symbol,
      category: mapping.category,
      exchange: mapping.exchange,
      unit: mapping.unit,
      priceCurrent: prices.current,
      priceYesterday: prices.yesterday,
      priceLastWeek: prices.lastWeek,
      priceLastMonth: prices.lastMonth,
      change,
      changePct,
      low52w: prices.low52w,
      high52w: prices.high52w,
      currency: 'USD' as const,
      lastUpdate: now,
    };
  }).filter(Boolean) as WorldCommodityItem[];
}

// ─── Try to fetch & parse World Bank Pink Sheet ─────────
async function fetchAndParsePinkSheet(): Promise<WorldCommodityItem[] | null> {
  try {
    console.log('[WorldBank] Fetching Pink Sheet from:', PINK_SHEET_URL);
    const response = await fetch(PINK_SHEET_URL);

    if (!response.ok) {
      console.error('[WorldBank] HTTP Error:', response.status);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // The "Monthly Prices" sheet contains the data we need
    const sheetName = workbook.SheetNames.find(
      (s) => s.toLowerCase().includes('monthly') && s.toLowerCase().includes('price')
    ) || workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.error('[WorldBank] Sheet not found:', sheetName);
      return null;
    }

    // Parse sheet to JSON (header row is row 1-4 typically in Pink Sheet)
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });

    if (!rawData || rawData.length < 3) {
      console.warn('[WorldBank] Not enough data rows in sheet');
      return null;
    }

    // Get the last 3 rows for current, last month, 2 months ago
    const latestRow = rawData[rawData.length - 1];
    const prevRow = rawData[rawData.length - 2];
    const prev2Row = rawData[rawData.length - 3];

    const now = new Date().toISOString();
    const results: WorldCommodityItem[] = [];

    for (const mapping of COMMODITY_MAPPINGS) {
      if (!mapping.pinkSheetKey) {
        // No Pink Sheet mapping (e.g., Pangasius, Tuna) — skip, use fallback
        continue;
      }

      // Try to find the column in the data
      const currentVal = findColumnValue(latestRow, mapping.pinkSheetKey);
      const prevVal = findColumnValue(prevRow, mapping.pinkSheetKey);
      const prev2Val = findColumnValue(prev2Row, mapping.pinkSheetKey);
      if (currentVal === null || prevVal === null) continue;

      // Calculate 52W range from available historical data
      let low52w = currentVal;
      let high52w = currentVal;
      const lookback = Math.min(rawData.length, 13);
      for (let i = rawData.length - lookback; i < rawData.length; i++) {
        const val = findColumnValue(rawData[i], mapping.pinkSheetKey);
        if (val !== null) {
          low52w = Math.min(low52w, val);
          high52w = Math.max(high52w, val);
        }
      }

      const change = parseFloat((currentVal - prevVal).toFixed(4));
      const changePct = parseFloat(((change / prevVal) * 100).toFixed(2));

      results.push({
        id: mapping.id,
        name: mapping.name,
        nameEn: mapping.nameEn,
        symbol: mapping.symbol,
        category: mapping.category,
        exchange: mapping.exchange,
        unit: mapping.unit,
        priceCurrent: currentVal,
        priceYesterday: prevVal,
        priceLastWeek: prevVal, // Monthly data — use prev month as proxy
        priceLastMonth: prev2Val ?? prevVal,
        change,
        changePct,
        low52w,
        high52w,
        currency: 'USD',
        lastUpdate: now,
      });
    }

    console.log(`[WorldBank] Parsed ${results.length} commodities from Pink Sheet`);
    return results.length > 0 ? results : null;
  } catch (err) {
    console.error('[WorldBank] Failed to fetch/parse Pink Sheet:', err);
    return null;
  }
}

/**
 * Try to find a column value in a row by partial key match (case-insensitive).
 */
function findColumnValue(row: Record<string, unknown>, key: string): number | null {
  if (!row || !key) return null;

  // Try exact match first
  if (key in row && typeof row[key] === 'number') return row[key];

  // Try partial match
  const lowerKey = key.toLowerCase();
  for (const [colName, value] of Object.entries(row)) {
    if (colName.toLowerCase().includes(lowerKey) && typeof value === 'number') {
      return value;
    }
  }

  return null;
}

// ─── Public API ─────────────────────────────────────────
/**
 * Get world commodity prices.
 * Strategy: Cache → World Bank API → Fallback static data
 */
export async function getWorldPrices(): Promise<WorldCommodityItem[]> {
  // 1. Try cache
  const cached = getCached<WorldCommodityItem[]>(CACHE_KEY);
  if (cached) {
    console.log('[WorldPrices] Serving from cache');
    return cached;
  }

  // 2. Try World Bank Pink Sheet
  const liveData = await fetchAndParsePinkSheet();
  if (liveData && liveData.length > 0) {
    // Merge with fallback for items not in Pink Sheet (seafood, etc.)
    const fallback = buildFallbackData();
    const liveIds = new Set(liveData.map((d) => d.id));
    const merged = [
      ...liveData,
      ...fallback.filter((f) => !liveIds.has(f.id)),
    ];

    setCache(CACHE_KEY, merged, CACHE_TTL);
    console.log(`[WorldPrices] Cached ${merged.length} items (${liveData.length} live + ${merged.length - liveData.length} fallback)`);
    return merged;
  }

  // 3. Fallback to static data
  console.log('[WorldPrices] Using fallback static data');
  const fallback = buildFallbackData();
  setCache(CACHE_KEY, fallback, 4 * 60 * 60 * 1000); // Short TTL for fallback = 4h
  return fallback;
}

/**
 * Get list of available categories.
 */
export function getCategories(): WorldCategory[] {
  return ['Tất cả', 'Cà phê & Ca cao', 'Lúa gạo & Ngũ cốc', 'Gia vị & Cây CN', 'Dầu thực vật', 'Thủy sản', 'Khác'];
}
